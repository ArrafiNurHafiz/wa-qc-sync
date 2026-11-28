// src/runtime/index.js — Runtime Bot WhatsApp Baileys, router pesan Gaya 4, dan retry antrean offline
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";
import {
  PRODUCT_MASTER,
  VENDORS_PRE,
  VENDORS_FIN,
  syncDictionaryFromWebhook,
  isQcRelevantMessage,
  parseQcMessage,
  getQcTemplateText,
  getQcItemTemplateText,
  getHelpText,
  getCriteriaText
} from "../qc/index.js";
import { MessageQueue } from "./message-queue.js";
import { CorrectionStore } from "./correction-store.js";
import { createAuthPersistence } from "./auth-persistence.js";
import { appConfig, parseAllowedGroups, isChatAllowed } from "./app-config.js";
import { getAuthDir, loadEnvFile } from "./paths.js";
import { sendToGasWebhook, checkGasStatus, isRetryableGasError } from "./gas-client.js";

loadEnvFile();

export function generateNoLaporan(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `QC-${y}${m}${day}-${nowMs}`;
}

export function buildQcWebhookPayload(report, { senderName = "-", idempotencyKey = "" } = {}) {
  const nowMs = Date.now();
  return {
    ...report,
    noLaporan: report.noLaporan || generateNoLaporan(nowMs),
    idempotencyKey: report.idempotencyKey || idempotencyKey || `wa:${nowMs}`,
    petugasQc: report.petugasQc && report.petugasQc !== "-" ? report.petugasQc : senderName
  };
}

export function formatQcReplyMessage(report, gasResult = {}, { appendMode = false, itemNumber = 1, fromQueue = false } = {}) {
  const statusLine = appendMode
    ? `✅ *Laporan diterima (Item #${itemNumber} ditambahkan).*`
    : fromQueue
      ? "✅ *Laporan diterima (dari antrean).* "
      : "✅ *Laporan diterima.*";

  const lines = [statusLine.trim()];
  if (gasResult.sheetUrl) {
    lines.push(`📊 Sheet: ${gasResult.sheetUrl}`);
  }
  return lines.join("\n");
}

function extractMessageText(msg) {
  const content = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message;
  if (!content) return "";
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.documentMessage?.caption ||
    content.videoMessage?.caption ||
    ""
  );
}

const defaultActiveSessions = new Map();

/**
 * Menangani satu pesan teks masuk (dipakai Baileys & unit test terisolasi).
 */
export async function handleIncomingTextMessage(
  { chatJid, participant, senderName, text, messageId, rawMsg = null },
  deps
) {
  const {
    sock,
    correctionStore,
    queue,
    allowedGroups,
    gasUrl,
    sessionStore = defaultActiveSessions,
    notifyDataMutation = () => {},
    sendToGas = (action, data) => sendToGasWebhook(action, data, { gasUrl }),
    checkGas = () => checkGasStatus({ gasUrl })
  } = deps;

  if (!text || !isQcRelevantMessage(text)) return { handled: false, reason: "irrelevant" };
  const replyOpts = rawMsg ? { quoted: rawMsg } : undefined;
  const trimmed = text.trim();

  if (/^#(?:QC)?GROUPID\b/i.test(trimmed)) {
    const label = chatJid.endsWith("@g.us") ? "ID Grup WhatsApp" : "ID Chat WhatsApp";
    await sock.sendMessage(
      chatJid,
      { text: `🆔 *${label}:*\n\`${chatJid}\`\n\n_Salin ID di atas ke Pengaturan → Whitelist ID Grup WhatsApp._` },
      replyOpts
    );
    return { handled: true, command: "GROUP_ID", chatJid };
  }

  if (!isChatAllowed(chatJid, allowedGroups)) return { handled: false, reason: "not_whitelisted" };

  // Cek konfirmasi #OKQC <6-HEX> atau #OK <6-HEX> (kompatibel berbagi nomor dengan produksi-kwas)
  const confirmMatch = trimmed.match(/^#OK(QC)?\s+([A-Z0-9]{6})$/i);
  let confirmedParsed = null;
  if (confirmMatch) {
    const isExplicitQc = Boolean(confirmMatch[1]);
    confirmedParsed = correctionStore.consume(chatJid, participant, confirmMatch[2]);
    if (!confirmedParsed) {
      if (!isExplicitQc) {
        return { handled: false, reason: "ok_for_other_bot" };
      }
      await sock.sendMessage(
        chatJid,
        { text: "⚠️ Kode konfirmasi QC tidak ditemukan atau sudah kedaluwarsa (5 menit). Kirim ulang laporan FORM QC." },
        replyOpts
      );
      return { handled: true, command: "OK_INVALID" };
    }
  }

  const sessionKey = `${chatJid}:${participant || chatJid}`;
  const activeSession = sessionStore.get(sessionKey) || null;
  const parsed = confirmedParsed || parseQcMessage(trimmed, { session: activeSession });
  if (!parsed) return { handled: false, reason: "unparsed" };

  if (parsed.command === "QC_TEMPLATE") {
    await sock.sendMessage(chatJid, { text: getQcTemplateText() }, replyOpts);
    return { handled: true, command: "QC_TEMPLATE" };
  }

  if (parsed.command === "QC_ITEM_TEMPLATE") {
    const nextNum = activeSession?.itemCount ? activeSession.itemCount + 1 : parsed.itemNumber;
    await sock.sendMessage(chatJid, { text: getQcItemTemplateText(nextNum) }, replyOpts);
    return { handled: true, command: "QC_ITEM_TEMPLATE", itemNumber: nextNum };
  }

  if (parsed.command === "HELP") {
    await sock.sendMessage(chatJid, { text: getHelpText(PRODUCT_MASTER.length) }, replyOpts);
    return { handled: true, command: "HELP" };
  }

  if (parsed.command === "KRITERIA") {
    await sock.sendMessage(chatJid, { text: getCriteriaText() }, replyOpts);
    return { handled: true, command: "KRITERIA" };
  }

  if (parsed.command === "LIST_PRODUCTS") {
    if (PRODUCT_MASTER.length === 0) {
      await sock.sendMessage(
        chatJid,
        { text: "ℹ️ Mode input bebas aktif (tidak memakai database produk). Ketik langsung nama produk di template *FORM QC*." },
        replyOpts
      );
      return { handled: true, command: "LIST_PRODUCTS" };
    }
    const listStr = PRODUCT_MASTER.map((p, idx) => `${idx + 1}. ${p.nama} (SKU: ${p.sku})`).join("\n");
    await sock.sendMessage(
      chatJid,
      { text: `📦 *DAFTAR ${PRODUCT_MASTER.length} PRODUK RESMI KWaS:*\n\n${listStr}` },
      replyOpts
    );
    return { handled: true, command: "LIST_PRODUCTS" };
  }

  if (parsed.command === "VENDOR") {
    if (VENDORS_PRE.length === 0 && VENDORS_FIN.length === 0) {
      await sock.sendMessage(
        chatJid,
        { text: "ℹ️ Mode input bebas aktif (tidak memakai database vendor). Ketik langsung nama vendor di template *FORM QC*." },
        replyOpts
      );
      return { handled: true, command: "VENDOR" };
    }
    const sub = String(parsed.sub || "").toUpperCase();
    const listPre = VENDORS_PRE.map((v, i) => `${i + 1}. ${v}`).join("\n");
    const listFin = VENDORS_FIN.map((v, i) => `${i + 1}. ${v}`).join("\n");

    let msgText = "";
    if (sub.includes("PRE")) {
      msgText = `🏭 *DAFTAR VENDOR PRE-FINISHING (${VENDORS_PRE.length})*\n━━━━━━━━━━━━━━━━━━━━\n\n${listPre}`;
    } else if (sub.includes("FIN")) {
      msgText = `✨ *DAFTAR VENDOR FINISHING (${VENDORS_FIN.length})*\n━━━━━━━━━━━━━━━━━━━━\n\n${listFin}`;
    } else {
      msgText =
        `🏭 *DAFTAR VENDOR REKANAN*\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `*PRE-FINISHING (${VENDORS_PRE.length}):*\n${listPre}\n\n` +
        `*FINISHING (${VENDORS_FIN.length}):*\n${listFin}\n\n` +
        `_Tips: Ketik *#VENDOR PRE* atau *#VENDOR FIN* untuk filter._`;
    }
    await sock.sendMessage(chatJid, { text: msgText }, replyOpts);
    return { handled: true, command: "VENDOR" };
  }

  if (parsed.command === "STATUS") {
    try {
      const statusRes = await checkGas();
      if (statusRes?.status !== "success" && statusRes?.status !== "active") {
        throw new Error("Respons webhook GAS tidak valid");
      }
      await sock.sendMessage(
        chatJid,
        {
          text:
            `✅ *SISTEM QC ONLINE*\n━━━━━━━━━━━━━━━━━━━━\n` +
            `🔗 GAS Webhook : Aktif\n` +
            `📄 Template Form: ${statusRes.templateConfigured ? "Terkonfigurasi" : "Belum diset"}\n` +
            `📑 Ekspor PDF  : ${statusRes.generatePdf ? "Aktif" : "Nonaktif"}\n` +
            `📦 Antrean     : ${queue.getStatus().pending} pending\n` +
            `⏰ Waktu Cek   : ${new Date().toLocaleString("id-ID")}`
        },
        replyOpts
      );
    } catch (err) {
      await sock.sendMessage(
        chatJid,
        { text: `❌ *SISTEM TERKENDALA*\n━━━━━━━━━━━━━━━━━━━━\nWebhook GAS tidak dapat dijangkau: ${err.message}` },
        replyOpts
      );
    }
    return { handled: true, command: "STATUS" };
  }

  if (parsed.error) {
    await sock.sendMessage(
      chatJid,
      { text: `❌ *GAGAL MEMPROSES FORM QC*\n━━━━━━━━━━━━━━━━━━━━\n${parsed.error}` },
      replyOpts
    );
    return { handled: true, error: parsed.error };
  }

  if (parsed.requires_confirmation && !confirmedParsed) {
    const token = correctionStore.create(chatJid, participant, parsed);
    const corrections = parsed.corrections
      .map((item) => `• ${item.field}: "${item.original}" → *${item.suggested}*`)
      .join("\n");
    await sock.sendMessage(
      chatJid,
      {
        text:
          `⚠️ *KONFIRMASI KOREKSI NAMA*\n━━━━━━━━━━━━━━━━━━━━\n${corrections}\n\n` +
          `Laporan belum dikirim ke Google Drive.\nBalas: *#OKQC ${token}*\n_Berlaku selama 5 menit._`
      },
      replyOpts
    );
    return { handled: true, requiresConfirmation: true, token };
  }

  // Bangun payload GAS LOG_QC_REPORT atau APPEND_QC_ITEM
  const idempotencyKey = `${chatJid}:${messageId || Date.now()}`;
  const isAppend = parsed.type === "QC_ITEM_APPEND";
  const gasAction = isAppend ? "APPEND_QC_ITEM" : "LOG_QC_REPORT";
  const qcData = isAppend
    ? {
        noLaporan: activeSession.noLaporan,
        fileId: activeSession.fileId,
        vendor: activeSession.vendor,
        noDokumenPo: activeSession.noDokumenPo,
        tanggalPemeriksaan: activeSession.tanggalPemeriksaan,
        petugasQc: activeSession.petugasQc,
        idempotencyKey,
        item: parsed.item
      }
    : buildQcWebhookPayload(parsed.report, { senderName, idempotencyKey });
  const webhookPayload = { action: gasAction, data: qcData };

  try {
    const gasRes = await sendToGas(gasAction, qcData);
    if (gasRes?.status !== "success") {
      await sock.sendMessage(
        chatJid,
        { text: `❌ *GAGAL MENYIMPAN KE DRIVE*\n━━━━━━━━━━━━━━━━━━━━\n${gasRes?.message || "Kesalahan Google Apps Script."}` },
        replyOpts
      );
      return { handled: true, failed: true };
    }

    const nextCount = isAppend
      ? (gasRes.totalItem || (activeSession.itemCount || 1) + 1)
      : (qcData.items?.length || 1);

    if (isAppend) {
      activeSession.itemCount = nextCount;
      if (gasRes.pdfUrl) activeSession.pdfUrl = gasRes.pdfUrl;
      if (gasRes.sheetUrl) activeSession.sheetUrl = gasRes.sheetUrl;
      activeSession.updatedAt = Date.now();
      sessionStore.set(sessionKey, activeSession);
    } else {
      sessionStore.set(sessionKey, {
        noLaporan: gasRes.noLaporan || qcData.noLaporan,
        fileId: gasRes.fileId || "",
        sheetUrl: gasRes.sheetUrl || "",
        pdfUrl: gasRes.pdfUrl || "",
        vendor: qcData.vendor,
        noDokumenPo: qcData.noDokumenPo,
        tanggalPemeriksaan: qcData.tanggalPemeriksaan,
        petugasQc: qcData.petugasQc,
        itemCount: nextCount,
        updatedAt: Date.now()
      });
    }

    notifyDataMutation();
    const replyReport = isAppend ? parsed.report : qcData;
    await sock.sendMessage(
      chatJid,
      {
        text: formatQcReplyMessage(replyReport, gasRes, {
          corrected: parsed.corrected,
          appendMode: isAppend,
          itemNumber: nextCount
        }),
        mentions: participant ? [participant] : undefined
      },
      replyOpts
    );
    return { handled: true, success: true, noLaporan: gasRes.noLaporan || qcData.noLaporan, itemNumber: nextCount };
  } catch (err) {
    if (isRetryableGasError(err)) {
      queue.saveToQueue(participant, chatJid, trimmed, "network_error", webhookPayload);
      await sock.sendMessage(
        chatJid,
        {
          text:
            `⚠️ *KONEKSI GAS TERGANGGU — MASUK ANTREAN OFFLINE*\n━━━━━━━━━━━━━━━━━━━━\n` +
            `Laporan *${qcData.vendor}* (${qcData.totalItem} item, ${qcData.totalLolos} pcs lolos) telah disimpan aman ke antrean lokal.\n` +
            `Bot akan otomatis mengirim ulang ke Google Drive saat koneksi pulih.`
        },
        replyOpts
      );
      return { handled: true, queued: true, noLaporan: qcData.noLaporan };
    }

    await sock.sendMessage(
      chatJid,
      { text: `⚠️ *Terjadi Kesalahan Sistem:* ${err.message}` },
      replyOpts
    );
    return { handled: true, error: err.message };
  }
}

/**
 * Memproses pesan tertunda di MessageQueue secara FIFO.
 */
export async function processQueuedMessages(deps) {
  const {
    sock = null,
    queue,
    gasUrl,
    notifyDataMutation = () => {},
    sendToGas = (action, data) => sendToGasWebhook(action, data, { gasUrl })
  } = deps;

  const pending = queue.getPendingMessages();
  let processed = 0;
  let failed = 0;

  for (const qMsg of pending) {
    try {
      const action = qMsg.payload?.action || "LOG_QC_REPORT";
      const data = qMsg.payload?.data;
      if (!data) {
        throw new Error("Payload antrean tidak lengkap.");
      }

      const res = await sendToGas(action, data);
      if (res?.status !== "success") {
        throw new Error(res?.message || "Webhook GAS gagal.");
      }

      queue.updateStatus(qMsg.id, "processed");
      notifyDataMutation();
      processed++;

      if (sock && qMsg.chat) {
        try {
          await sock.sendMessage(qMsg.chat, {
            text: formatQcReplyMessage(data, res, { fromQueue: true })
          });
        } catch (notifyErr) {
          console.warn(`[QUEUE] Gagal kirim notifikasi susulan ke ${qMsg.chat}: ${notifyErr.message}`);
        }
      }
    } catch (err) {
      failed++;
      const status = isRetryableGasError(err) && (qMsg.attempts || 0) + 1 < 5 ? "pending" : "failed";
      queue.updateStatus(qMsg.id, status, err.message);
    }
  }

  return { processed, failed, remaining: queue.getPendingMessages().length };
}

// --- Runtime Stateful Baileys ---
const correctionStore = new CorrectionStore();
const messageStore = new Map();
const processedMessageIds = new Set();
let currentSock = null;
let queueWorkerInterval = null;
let webBridge = null;
let isStartingBot = false;
let reconnectTimer = null;
let reconnectAttempts = 0;

function scheduleBotReconnect(delayMs) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void startBot();
  }, delayMs);
}

export async function startBot() {
  if (isStartingBot) return;
  isStartingBot = true;

  try {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (queueWorkerInterval) {
      clearInterval(queueWorkerInterval);
      queueWorkerInterval = null;
    }

    if (currentSock) {
      try {
        currentSock.ev.removeAllListeners();
        currentSock.end(new Error("Bot restarting"));
      } catch (_) {}
      currentSock = null;
    }

    const { state, saveCreds } = await useMultiFileAuthState(getAuthDir());
    const authPersistence = createAuthPersistence(saveCreds);
    let version;
    try {
      const latest = await Promise.race([
        fetchLatestBaileysVersion(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout versi WA")), 8000))
      ]);
      version = latest?.version;
    } catch (_) {
      version = undefined;
    }

    const sock = makeWASocket({
      ...(version ? { version } : {}),
      browser: ["KWaS QC Bot", "Chrome", "1.1.2"],
      logger: pino({ level: process.env.DEBUG === "true" ? "debug" : "silent" }),
      auth: state,
      printQRInTerminal: false,
      connectTimeoutMs: 30000,
      keepAliveIntervalMs: 25000,
      getMessage: async (key) => {
        const msgKey = `${key.remoteJid}:${key.id}`;
        return messageStore.get(msgKey)?.message || undefined;
      }
    });
    currentSock = sock;

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("\n[QR CODE] Pindai kode QR di bawah atau lewat Web Command Center:");
        qrcode.generate(qr, { small: true });
        webBridge?.updateWebQR(qr);
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isReplaced = statusCode === DisconnectReason.connectionReplaced;

        console.log(`[KONEKSI] Terputus (Status: ${statusCode}).`);
        webBridge?.updateWebStatus("Disconnected");

        if (isLoggedOut) {
          console.log("[KONEKSI] Sesi logout. Membersihkan auth dan restart...");
          await authPersistence.beginReset();
          sock.ev.removeAllListeners();
          try {
            fs.rmSync(getAuthDir(), { recursive: true, force: true });
          } catch (_) {}
          reconnectAttempts = 0;
          scheduleBotReconnect(2000);
        } else if (isReplaced) {
          console.log("[KONEKSI] Sesi digantikan di perangkat/proses lain. Menunggu 10 detik sebelum reconnect...");
          reconnectAttempts = Math.min(reconnectAttempts + 1, 5);
          scheduleBotReconnect(10000);
        } else {
          reconnectAttempts = Math.min(reconnectAttempts + 1, 5);
          const backoffMs = Math.min(3000 * Math.pow(1.5, reconnectAttempts - 1), 30000);
          scheduleBotReconnect(Math.round(backoffMs));
        }
      } else if (connection === "open") {
        reconnectAttempts = 0;
        console.log("\n[KONEKSI] Bot WhatsApp QC KWaS terhubung.");
        webBridge?.updateWebStatus("Connected", sock.user);

        syncDictionaryFromWebhook(
          appConfig.get("GAS_QC_WEBHOOK_URL"),
          null,
          appConfig.get("API_SECRET")
        ).catch(() => {});
        MessageQueue.cleanup();
        await processQueuedMessages({
          sock,
          queue: MessageQueue.getDefault(),
          notifyDataMutation: () => webBridge?.notifyDataMutation()
        });

        if (!queueWorkerInterval) {
          let busy = false;
          queueWorkerInterval = setInterval(async () => {
            if (currentSock && currentSock.user && !busy && MessageQueue.getPendingMessages().length > 0) {
              busy = true;
              try {
                await processQueuedMessages({
                  sock: currentSock,
                  queue: MessageQueue.getDefault(),
                  notifyDataMutation: () => webBridge?.notifyDataMutation()
                });
              } catch (err) {
                console.error("[QUEUE RETRY ERROR]", err.message);
              } finally {
                busy = false;
              }
            }
          }, 30000);
        }
      }
    });

    sock.ev.on("creds.update", () => {
      void authPersistence.queueSave();
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type && type !== "notify") return;

      for (const msg of messages) {
        if (msg.key && msg.message) {
          const msgKey = `${msg.key.remoteJid}:${msg.key.id}`;
          messageStore.set(msgKey, msg);
          if (messageStore.size > 1000) {
            messageStore.delete(messageStore.keys().next().value);
          }
        }

        if (msg.key?.fromMe || !msg.message) continue;

        const dedupKey = msg.key?.id ? `${msg.key.remoteJid}:${msg.key.id}` : "";
        if (dedupKey) {
          if (processedMessageIds.has(dedupKey)) continue;
          processedMessageIds.add(dedupKey);
          if (processedMessageIds.size > 1000) {
            processedMessageIds.delete(processedMessageIds.values().next().value);
          }
        }

        const chatJid = msg.key.remoteJid;
        const participant = msg.key.participant || msg.participant || chatJid;
        const senderNumber = participant.split("@")[0].replace(/\D/g, "");
        const senderName = msg.pushName ? `${msg.pushName} (+${senderNumber})` : `+${senderNumber}`;
        const text = extractMessageText(msg);

        try {
          await handleIncomingTextMessage(
            { chatJid, participant, senderName, text, messageId: msg.key.id, rawMsg: msg },
            {
              sock,
              correctionStore,
              queue: MessageQueue.getDefault(),
              allowedGroups: appConfig.get("ALLOWED_GROUPS"),
              notifyDataMutation: () => webBridge?.notifyDataMutation()
            }
          );
        } catch (msgErr) {
          console.error("[MESSAGE HANDLER ERROR]", msgErr?.message || msgErr);
        }
      }
    });
  } catch (err) {
    console.error("[KONEKSI] Gagal inisialisasi bot WA:", err?.message || err);
    reconnectAttempts = Math.min(reconnectAttempts + 1, 5);
    scheduleBotReconnect(5000);
  } finally {
    isStartingBot = false;
  }
}

export async function bootstrap(options = {}) {
  process.on("unhandledRejection", (err) => {
    if (err?.isBoom && err.output?.statusCode === 428) {
      console.warn("[KONEKSI] Retry request dibatalkan: koneksi sudah ditutup.");
      return;
    }
    console.error("[FATAL] Unhandled rejection:", err);
    process.exit(1);
  });

  webBridge = await import("../web/server.js");
  const port = options.port || appConfig.get("PORT") || 3001;
  webBridge.startWebServer(port);

  webBridge.registerBotControls({
    onRestart: async () => {
      await startBot();
    },
    onLogout: async () => {
      if (currentSock) {
        try {
          currentSock.ev.removeAllListeners();
          currentSock.end(new Error("Manual logout from Web"));
        } catch (_) {}
        currentSock = null;
      }
      try {
        fs.rmSync(getAuthDir(), { recursive: true, force: true });
      } catch (_) {}
      await startBot();
    }
  });

  console.log("==========================================");
  console.log("  WA QC SYNC - CV KARYA WAHANA SENTOSA");
  console.log("==========================================");
  console.log("Target GAS Webhook:", appConfig.get("GAS_QC_WEBHOOK_URL") || "(belum diset)");
  const groups = parseAllowedGroups(appConfig.get("ALLOWED_GROUPS"));
  console.log("Mode Grup:", groups.length > 0 ? `Whitelist (${groups.join(", ")})` : "Semua Grup & Chat");

  await startBot();
}

const isMainModule = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMainModule) {
  void bootstrap();
}
