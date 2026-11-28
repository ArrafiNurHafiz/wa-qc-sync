// src/web/server.js — Server HTTP Express 5 (Port 3001) untuk Web Command Center & Mobile QC Form
import express from "express";
import QRCode from "qrcode";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import {
  PRODUCT_MASTER,
  VENDORS_PRE,
  VENDORS_FIN,
  QC_CRITERIA,
  addProduct,
  addVendor,
  applyMasterData,
  validateQcReport,
  getQcTemplateText,
  getHelpText,
  getCriteriaText
} from "../qc/index.js";
import { appConfig } from "../runtime/app-config.js";
import { loadEnvFile } from "../runtime/paths.js";
import { MessageQueue } from "../runtime/message-queue.js";
import { sendToGasWebhook, checkGasStatus, isRetryableGasError } from "../runtime/gas-client.js";
import { generateNoLaporan, processQueuedMessages } from "../runtime/index.js";

loadEnvFile();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultPublicDir = path.resolve(__dirname, "../../public");

const globalWaState = {
  currentQR: null,
  connectionStatus: "Disconnected",
  connectedUser: null,
  restartCallback: null,
  logoutCallback: null,
  dataMutationVersion: 1
};

export function notifyDataMutation() {
  globalWaState.dataMutationVersion++;
}

export function registerBotControls({ onRestart, onLogout }) {
  globalWaState.restartCallback = onRestart;
  globalWaState.logoutCallback = onLogout;
}

export function updateWebQR(qr) {
  globalWaState.currentQR = qr;
  globalWaState.connectionStatus = "Scan QR";
}

export function updateWebStatus(status, user = null) {
  globalWaState.connectionStatus = status;
  if (user) globalWaState.connectedUser = user;
  if (status === "Connected") {
    globalWaState.currentQR = null;
  }
}

function getSafeErrorMessage(err, fallback = "Terjadi kesalahan pada server.") {
  if (!err || typeof err.message !== "string") return fallback;
  return err.message.split("\n")[0].slice(0, 240);
}

export function createWebApp(deps = {}) {
  const config = deps.config || appConfig;
  const queue = deps.queue || MessageQueue.getDefault();
  const publicDir = deps.publicDir || defaultPublicDir;
  const waState = deps.state || globalWaState;

  const sendToGas = deps.sendToGas || ((action, data, opts = {}) =>
    sendToGasWebhook(action, data, {
      gasUrl: opts.gasUrl ?? config.get("GAS_QC_WEBHOOK_URL"),
      apiSecret: opts.apiSecret ?? config.get("API_SECRET"),
      timeout: opts.timeout
    }));

  const checkGas = deps.checkGas || ((opts = {}) =>
    checkGasStatus({
      gasUrl: opts.gasUrl ?? config.get("GAS_QC_WEBHOOK_URL"),
      timeout: opts.timeout
    }));

  let dashboardCache = null;
  let dashboardCacheTime = 0;
  let cachedMutationVersion = 0;
  let cachedQrRaw = null;
  let cachedQrDataUrl = null;
  const CACHE_TTL_MS = 30000;

  function bumpMutation() {
    waState.dataMutationVersion++;
    dashboardCacheTime = 0;
  }

  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(publicDir));

  app.get("/", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.get("/api/help", (req, res) => {
    res.json({
      helpText: getHelpText(PRODUCT_MASTER.length),
      criteriaText: getCriteriaText(),
      templateText: getQcTemplateText()
    });
  });

  app.get("/api/master", async (req, res) => {
    const gasUrl = String(config.get("GAS_QC_WEBHOOK_URL") || "").trim();
    const shouldSync = req.query.fresh === "1" ||
      (gasUrl && PRODUCT_MASTER.length === 0 && VENDORS_PRE.length === 0 && VENDORS_FIN.length === 0);

    if (shouldSync && gasUrl) {
      try {
        const masterRes = await sendToGas("GET_MASTER_DATA", {});
        if (masterRes?.status === "success" && masterRes.data) {
          applyMasterData(masterRes.data);
        }
      } catch (_) {}
    }

    res.json({
      success: true,
      products: PRODUCT_MASTER.map((p) => ({ sku: p.sku, nama: p.nama, kategori: p.kategori })),
      vendorsPre: [...VENDORS_PRE],
      vendorsFin: [...VENDORS_FIN],
      criteria: QC_CRITERIA.map((c) => ({ id: c.id, shortLabel: c.shortLabel, label: c.label, group: c.group }))
    });
  });

  app.post("/api/master/products", async (req, res) => {
    const nama = String(req.body?.nama || req.body?.namaProduk || "").trim();
    const sku = String(req.body?.sku || req.body?.kodeRawBody || "").trim().toUpperCase();
    const kategori = String(req.body?.kategori || "Kitchenware").trim() || "Kitchenware";

    if (!nama) {
      return res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: "Nama barang wajib diisi."
      });
    }

    const gasUrl = String(config.get("GAS_QC_WEBHOOK_URL") || "").trim();
    let gasProduct = null;
    if (gasUrl) {
      try {
        const gasRes = await sendToGas("ADD_MASTER_PRODUCT", { kodeRawBody: sku, namaProduk: nama, kategori });
        if (gasRes?.status !== "success") {
          return res.status(400).json({
            success: false,
            code: gasRes?.code || "GAS_ERROR",
            message: gasRes?.message || "Gagal menyimpan barang ke Google Sheets."
          });
        }
        gasProduct = gasRes.product || null;
      } catch (err) {
        return res.status(502).json({
          success: false,
          message: `Gagal menghubungi GAS: ${getSafeErrorMessage(err)}`
        });
      }
    }

    const saved = addProduct({
      sku: gasProduct?.kodeRawBody || sku,
      nama: gasProduct?.namaProduk || nama,
      kategori: gasProduct?.kategori || kategori
    });
    bumpMutation();
    return res.status(201).json({
      success: true,
      product: saved ? { sku: saved.sku, nama: saved.nama, kategori: saved.kategori } : null,
      message: `Barang "${nama}" berhasil ditambahkan ke database.`
    });
  });

  app.post("/api/master/vendors", async (req, res) => {
    const nama = String(req.body?.nama || req.body?.namaVendor || "").trim();
    const tipeRaw = String(req.body?.tipe || req.body?.tipeVendor || "Pre-Finishing").trim();
    const tipeLower = tipeRaw.toLowerCase();
    const tipe = tipeLower === "both" ? "Both" : (tipeLower.includes("fin") && !tipeLower.includes("pre") ? "Finishing" : "Pre-Finishing");

    if (!nama) {
      return res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: "Nama vendor wajib diisi."
      });
    }

    const gasUrl = String(config.get("GAS_QC_WEBHOOK_URL") || "").trim();
    let gasVendor = null;
    if (gasUrl) {
      try {
        const gasRes = await sendToGas("ADD_MASTER_VENDOR", { namaVendor: nama, tipeVendor: tipe });
        if (gasRes?.status !== "success") {
          return res.status(400).json({
            success: false,
            code: gasRes?.code || "GAS_ERROR",
            message: gasRes?.message || "Gagal menyimpan vendor ke Google Sheets."
          });
        }
        gasVendor = gasRes.vendor || null;
      } catch (err) {
        return res.status(502).json({
          success: false,
          message: `Gagal menghubungi GAS: ${getSafeErrorMessage(err)}`
        });
      }
    }

    const ok = addVendor(gasVendor?.namaVendor || nama, gasVendor?.tipeVendor || tipe);
    if (!ok) {
      return res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: "Nama vendor tidak valid."
      });
    }
    bumpMutation();
    return res.status(201).json({
      success: true,
      vendor: { nama: gasVendor?.namaVendor || nama, tipe: gasVendor?.tipeVendor || tipe },
      message: `Vendor "${nama}" berhasil ditambahkan ke database.`
    });
  });

  // --- WA & QUEUE ENDPOINTS ---
  app.get("/api/wa/status", async (req, res) => {
    let qrDataUrl = null;
    if (waState.currentQR && waState.connectionStatus !== "Connected") {
      if (waState.currentQR === cachedQrRaw && cachedQrDataUrl) {
        qrDataUrl = cachedQrDataUrl;
      } else {
        try {
          qrDataUrl = await QRCode.toDataURL(waState.currentQR);
          cachedQrRaw = waState.currentQR;
          cachedQrDataUrl = qrDataUrl;
        } catch (_) {}
      }
    }

    res.json({
      status: waState.connectionStatus,
      user: waState.connectedUser,
      qrImage: qrDataUrl,
      gasConnected: Boolean(String(config.get("GAS_QC_WEBHOOK_URL") || "").trim()),
      dataVersion: waState.dataMutationVersion,
      queue: queue.getStatus()
    });
  });

  app.post("/api/wa/restart", async (req, res) => {
    if (typeof waState.restartCallback !== "function") {
      return res.status(400).json({
        success: false,
        code: "BOT_NOT_ACTIVE",
        message: "Mode web-only aktif; bot WhatsApp tidak dijalankan pada proses ini."
      });
    }
    try {
      await waState.restartCallback();
      res.json({ success: true, message: "Bot WhatsApp sedang di-restart..." });
    } catch (err) {
      res.status(500).json({ success: false, message: getSafeErrorMessage(err) });
    }
  });

  app.post("/api/wa/logout", async (req, res) => {
    if (typeof waState.logoutCallback !== "function") {
      return res.status(400).json({
        success: false,
        code: "BOT_NOT_ACTIVE",
        message: "Mode web-only aktif; bot WhatsApp tidak dijalankan pada proses ini."
      });
    }
    try {
      await waState.logoutCallback();
      waState.connectionStatus = "Disconnected";
      waState.connectedUser = null;
      waState.currentQR = null;
      res.json({ success: true, message: "Sesi WhatsApp diputus. Silakan scan QR baru." });
    } catch (err) {
      res.status(500).json({ success: false, message: getSafeErrorMessage(err) });
    }
  });

  app.get("/api/queue/status", (req, res) => {
    try {
      const qStatus = queue.getStatus();
      res.json({ success: true, ...qStatus });
    } catch (err) {
      res.status(500).json({ success: false, message: getSafeErrorMessage(err) });
    }
  });

  app.post("/api/queue/retry", async (req, res) => {
    if (!String(config.get("GAS_QC_WEBHOOK_URL") || "").trim()) {
      return res.status(400).json({
        success: false,
        code: "GAS_NOT_CONFIGURED",
        message: "GAS_QC_WEBHOOK_URL belum dikonfigurasi."
      });
    }

    try {
      const result = await processQueuedMessages({
        sock: null,
        queue,
        gasUrl: config.get("GAS_QC_WEBHOOK_URL"),
        notifyDataMutation: bumpMutation,
        sendToGas
      });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, message: getSafeErrorMessage(err) });
    }
  });

  // --- QC REPORTS ENDPOINTS ---
  app.get("/api/qc/reports", async (req, res) => {
    const gasUrl = String(config.get("GAS_QC_WEBHOOK_URL") || "").trim();
    if (!gasUrl) {
      return res.status(400).json({
        success: false,
        code: "GAS_NOT_CONFIGURED",
        message: "GAS_QC_WEBHOOK_URL belum dikonfigurasi. Buka Pengaturan untuk menghubungkan Google Apps Script."
      });
    }

    const forceRefresh = req.query.fresh === "1";
    const now = Date.now();
    if (
      !forceRefresh &&
      dashboardCache &&
      cachedMutationVersion === waState.dataMutationVersion &&
      now - dashboardCacheTime < CACHE_TTL_MS
    ) {
      return res.json({
        success: true,
        data: dashboardCache,
        cached: true,
        dataVersion: waState.dataMutationVersion
      });
    }

    try {
      const result = await sendToGas("GET_QC_DASHBOARD", { limit: Number(req.query.limit) || 100 });
      if (result?.status === "success" && result.data) {
        dashboardCache = result.data;
        dashboardCacheTime = Date.now();
        cachedMutationVersion = waState.dataMutationVersion;
        return res.json({
          success: true,
          data: result.data,
          dataVersion: waState.dataMutationVersion
        });
      }
      return res.status(400).json({
        success: false,
        message: result?.message || "Gagal memuat rekap QC dari Google Apps Script."
      });
    } catch (err) {
      if (dashboardCache) {
        return res.json({
          success: true,
          data: dashboardCache,
          stale: true,
          dataVersion: waState.dataMutationVersion
        });
      }
      return res.status(502).json({
        success: false,
        message: `Gagal terhubung ke Google Apps Script: ${getSafeErrorMessage(err)}`
      });
    }
  });

  app.post("/api/qc/reports", async (req, res) => {
    const validation = validateQcReport({
      ...req.body,
      sumber: req.body?.sumber || "WEB"
    });

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: validation.error,
        details: validation.details
      });
    }

    const gasUrl = String(config.get("GAS_QC_WEBHOOK_URL") || "").trim();
    if (!gasUrl) {
      return res.status(400).json({
        success: false,
        code: "GAS_NOT_CONFIGURED",
        message: "GAS_QC_WEBHOOK_URL belum dikonfigurasi. Buka tab Pengaturan terlebih dahulu."
      });
    }

    const nowMs = Date.now();
    const report = {
      ...validation.report,
      noLaporan: validation.report.noLaporan || generateNoLaporan(nowMs),
      idempotencyKey: validation.report.idempotencyKey || `web:${nowMs}:${Math.random().toString(36).slice(2, 8)}`
    };

    try {
      const gasRes = await sendToGas("LOG_QC_REPORT", report);
      if (gasRes?.status === "success") {
        bumpMutation();
        return res.status(201).json({
          success: true,
          queued: false,
          duplicate: Boolean(gasRes.duplicate),
          noLaporan: gasRes.noLaporan || report.noLaporan,
          sheetUrl: gasRes.sheetUrl || "",
          pdfUrl: gasRes.pdfUrl || "",
          warnings: validation.warnings,
          dataVersion: waState.dataMutationVersion
        });
      }

      return res.status(400).json({
        success: false,
        code: gasRes?.code || "GAS_ERROR",
        message: gasRes?.message || "Gagal menyimpan laporan QC ke Google Drive."
      });
    } catch (err) {
      if (isRetryableGasError(err)) {
        queue.saveToQueue(
          report.petugasQc || "Web Admin",
          "WEB",
          `WEB FORM QC ${report.vendor} (${report.noLaporan})`,
          "network_error",
          { action: "LOG_QC_REPORT", data: report }
        );
        bumpMutation();
        return res.status(202).json({
          success: true,
          queued: true,
          noLaporan: report.noLaporan,
          message: "Koneksi Google Apps Script terganggu. Laporan disimpan ke antrean offline dan akan dikirim ulang otomatis.",
          dataVersion: waState.dataMutationVersion
        });
      }

      return res.status(500).json({
        success: false,
        message: getSafeErrorMessage(err)
      });
    }
  });

  app.post("/api/qc/reports/void", async (req, res) => {
    const noLaporan = String(req.body?.noLaporan || "").trim();
    const alasanVoid = String(req.body?.alasanVoid || "").trim();
    const oleh = String(req.body?.oleh || "Admin Web").trim();

    if (!noLaporan || !alasanVoid) {
      return res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: "Nomor laporan dan alasan pembatalan (Void) wajib diisi."
      });
    }

    if (!String(config.get("GAS_QC_WEBHOOK_URL") || "").trim()) {
      return res.status(400).json({
        success: false,
        code: "GAS_NOT_CONFIGURED",
        message: "GAS_QC_WEBHOOK_URL belum dikonfigurasi."
      });
    }

    try {
      const result = await sendToGas("VOID_QC_REPORT", { noLaporan, alasanVoid, oleh });
      if (result?.status === "success") {
        bumpMutation();
        return res.json({
          success: true,
          status: "VOID",
          noLaporan,
          message: result.message || `Laporan ${noLaporan} berhasil di-VOID.`
        });
      }

      const statusCode = result?.code === "ALREADY_VOID" ? 409 : result?.code === "NOT_FOUND" ? 404 : 400;
      return res.status(statusCode).json({
        success: false,
        code: result?.code || "VOID_ERROR",
        message: result?.message || "Gagal membatalkan laporan."
      });
    } catch (err) {
      return res.status(502).json({
        success: false,
        message: `Gagal menghubungi GAS: ${getSafeErrorMessage(err)}`
      });
    }
  });

  app.post("/api/qc/reset", async (req, res) => {
    const confirmText = String(req.body?.confirm || "").trim().toUpperCase();
    if (confirmText !== "RESET") {
      return res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: "Ketik RESET untuk mengonfirmasi penghapusan seluruh data QC."
      });
    }

    const clearedQueueCount = typeof queue.clear === "function" ? queue.clear() : 0;
    dashboardCache = null;
    dashboardCacheTime = 0;
    bumpMutation();

    const gasUrl = String(config.get("GAS_QC_WEBHOOK_URL") || "").trim();
    if (!gasUrl) {
      return res.json({
        success: true,
        clearedQueueCount,
        gasReset: false,
        trashedFiles: 0,
        message: `Antrean lokal dibersihkan (${clearedQueueCount} item). GAS belum terhubung.`
      });
    }

    try {
      const result = await sendToGas("RESET_QC_DATA", { confirm: "RESET" });
      if (result?.status === "success") {
        dashboardCache = null;
        dashboardCacheTime = 0;
        bumpMutation();
        return res.json({
          success: true,
          clearedQueueCount,
          gasReset: true,
          clearedSheets: result.clearedSheets || 0,
          trashedFiles: result.trashedFiles || 0,
          message: result.message || "Semua data QC di Google Sheets, Drive, dan antrean lokal berhasil direset bersih."
        });
      }

      return res.status(400).json({
        success: false,
        code: result?.code || "RESET_ERROR",
        message: result?.message || "Gagal mereset data di Google Apps Script."
      });
    } catch (err) {
      return res.status(502).json({
        success: false,
        message: `Antrean lokal dibersihkan, namun gagal menghubungi GAS: ${getSafeErrorMessage(err)}`
      });
    }
  });

  // --- CONFIG ENDPOINTS ---
  app.get("/api/config", (req, res) => {
    const cfg = config.getAll();
    res.json({
      success: true,
      config: {
        gasWebhookUrl: cfg.GAS_QC_WEBHOOK_URL || "",
        allowedGroups: cfg.ALLOWED_GROUPS || "",
        hasApiSecret: Boolean(String(cfg.API_SECRET || "").trim())
      }
    });
  });

  app.post("/api/config/test", async (req, res) => {
    const gasWebhookUrl = String(req.body?.gasWebhookUrl || "").trim();
    const apiSecret = typeof req.body?.apiSecret === "string"
      ? req.body.apiSecret.trim()
      : String(config.get("API_SECRET") || "").trim();

    if (!/^https?:\/\//i.test(gasWebhookUrl)) {
      return res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: "URL Webhook GAS tidak valid (harus diawali http:// atau https://)."
      });
    }

    try {
      const health = await checkGas({ gasUrl: gasWebhookUrl });
      if (health?.status !== "success" && health?.status !== "active") {
        return res.status(400).json({
          success: false,
          message: "URL merespons tetapi bukan endpoint wa-qc-sync GAS yang valid."
        });
      }

      // Uji endpoint POST (termasuk API_SECRET jika diisi)
      const masterCheck = await sendToGas("GET_MASTER_DATA", {}, { gasUrl: gasWebhookUrl, apiSecret });
      if (masterCheck?.status !== "success") {
        return res.status(400).json({
          success: false,
          message: masterCheck?.message || "Uji POST ke GAS gagal (periksa API_SECRET atau izin deployment)."
        });
      }

      const templateReady = Boolean(health.templateConfigured && health.outputFolderConfigured);
      return res.json({
        success: true,
        templateReady,
        generatePdf: Boolean(health.generatePdf),
        message: templateReady
          ? "Koneksi GAS berhasil & Template Drive siap!"
          : "Koneksi GAS aktif, namun TEMPLATE_FILE_ID atau OUTPUT_FOLDER_ID belum diisi di Script Properties."
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: `Gagal terhubung ke GAS: ${getSafeErrorMessage(err)}`
      });
    }
  });

  app.post("/api/config", (req, res) => {
    const gasWebhookUrl = String(req.body?.gasWebhookUrl || "").trim();
    const allowedGroups = String(req.body?.allowedGroups || "").trim();

    if (gasWebhookUrl && !/^https?:\/\//i.test(gasWebhookUrl)) {
      return res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        message: "Format URL Webhook GAS tidak valid."
      });
    }

    const nextConfig = {
      GAS_QC_WEBHOOK_URL: gasWebhookUrl,
      ALLOWED_GROUPS: allowedGroups
    };

    if (req.body?.clearApiSecret === true) {
      nextConfig.API_SECRET = "";
    } else if (typeof req.body?.apiSecret === "string" && req.body.apiSecret.trim() !== "") {
      nextConfig.API_SECRET = req.body.apiSecret.trim();
    }

    config.update(nextConfig);
    bumpMutation();
    res.json({ success: true, message: "Pengaturan berhasil disimpan." });
  });

  // API 404 JSON & SPA fallback (Express 5 safe)
  app.use((req, res) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ success: false, code: "NOT_FOUND", message: "Endpoint API tidak ditemukan." });
    }
    return res.sendFile(path.join(publicDir, "index.html"));
  });

  // Global safe error handler (dilarang membocorkan stack trace ke klien)
  app.use((err, req, res, next) => {
    console.error("[WEB ERROR]", err?.message || err);
    if (res.headersSent) return next(err);
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ success: false, code: "INVALID_JSON", message: "Format JSON request tidak valid." });
    }
    return res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: "Terjadi kesalahan internal server." });
  });

  return { app, state: waState };
}

export function startWebServer(port = appConfig.get("PORT") || 3001, deps = {}) {
  const { app } = createWebApp(deps);
  const server = app.listen(port, "0.0.0.0", () => {
    const interfaces = os.networkInterfaces();
    const localIps = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === "IPv4" && !iface.internal) {
          localIps.push(iface.address);
        }
      }
    }
    console.log("[WEB COMMAND CENTER] wa-qc-sync berjalan di:");
    console.log(`  - Lokal PC       : http://localhost:${port}`);
    localIps.forEach((ip) => console.log(`  - Dari HP/Laptop : http://${ip}:${port}`));
  });
  return server;
}
