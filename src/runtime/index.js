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

export function formatQcReplyMessage(report, gasResult = {}, { corrected = false, fromQueue = false } = {}) {
  const title = fromQueue
    ? "✅ *LAPORAN QC OFFLINE BERHASIL DICATAT*"
    : "✅ *LAPORAN QC BERHASIL DICATAT*";

  const lines = [
    title,
    "━━━━━━━━━━━━━━━━━━━━",
    `📄 No. Laporan : *${gasResult.noLaporan || report.noLaporan}*`,
    `🏭 Vendor      : *${report.vendor}* (PO: ${report.noDokumenPo || "-"})`,
    `📅 Tanggal     : ${report.tanggalPemeriksaan}`,
    `📦 Total Item  : ${report.totalItem} item | Diperiksa: *${report.totalDiperiksa} pcs*`,
    `❌ Total Rusak : *${report.totalRusak} pcs*`,
    `✅ Lolos/Terima: *${report.totalLolos} pcs*`,
    `🏷️ Keputusan   : *${report.keputusanUmum}*`
  ];

  if (Array.isArray(report.items)) {
    lines.push("");
    report.items.forEach((it, idx) => {
      const defectTxt = it.rusak?.length
        ? it.rusak.map((r) => `${r.shortLabel || r.label} ${r.qty}`).join(", ")
        : "Mulus";
      lines.push(`${idx + 1}. *${it.namaItem}* (${it.kodeRawBody || "-"}): Periksa ${it.qtyDiperiksa} → Lolos ${it.qtyLolos} [${it.keputusan}] (${defectTxt})`);
    });
  }

  if (gasResult.sheetUrl) {
    lines.push("", `📊 Google Sheet : ${gasResult.sheetUrl}`);
  }
  if (gasResult.pdfUrl) {
    lines.push(`📑 File PDF     : ${gasResult.pdfUrl}`);
  }
  if (gasResult.duplicate) {
    lines.push("ℹ️ _Catatan: Laporan dengan ID sama sudah tercatat sebelumnya (idempoten)._");
  }
  if (corrected) {
    lines.push("⚠️ _Nama produk/vendor disesuaikan otomatis dari kamus master._");
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
    notifyDataMutation = () => {},
    sendToGas = (action, data) => sendToGasWebhook(action, data, { gasUrl }),
    checkGas = () => checkGasStatus({ gasUrl })
  } = deps;

  if (!text || !isQcRelevantMessage(text)) return { handled: false, reason: "irrelevant" };
  if (!isChatAllowed(chatJid, allowedGroups)) return { handled: false, reason: "not_whitelisted" };

  const replyOpts = rawMsg ? { quoted: rawMsg } : undefined;
  const trimmed = text.trim();

  // Cek konfirmasi #OK <6-HEX>
  const confirmMatch = trimmed.match(/^#OK\s+([A-Z0-9]{6})$/i);
  let confirmedParsed = null;
  if (confirmMatch) {
    confirmedParsed = correctionStore.consume(chatJid, participant, confirmMatch[1]);
    if (!confirmedParsed) {
      await sock.sendMessage(
        chatJid,
        { text: "⚠️ Kode konfirmasi tidak ditemukan atau sudah kedaluwarsa (5 menit). Kirim ulang laporan FORM QC." },
        replyOpts
      );
      return { handled: true, command: "OK_INVALID" };
    }
  }

  const parsed = confirmedParsed || parseQcMessage(trimmed);
  if (!parsed) return { handled: false, reason: "unparsed" };

  if (parsed.command === "QC_TEMPLATE") {
    await sock.sendMessage(chatJid, { text: getQcTemplateText() }, replyOpts);
    return { handled: true, command: "QC_TEMPLATE" };
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
    const listStr = PRODUCT_MASTER.map((p, idx) => `${idx + 1}. ${p.nama} (SKU: ${p.sku})`).join("\n");
    await sock.sendMessage(
      chatJid,
      { text: `📦 *DAFTAR ${PRODUCT_MASTER.length} PRODUK RESMI KWaS:*\n\n${listStr}` },
      replyOpts
    );
    return { handled: true, command: "LIST_PRODUCTS" };
  }

  if (parsed.command === "VENDOR") {
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
          `Laporan belum dikirim ke Google Drive.\nBalas: *#OK ${token}*\n_Berlaku selama 5 menit._`
      },
      replyOpts
    );
    return { handled: true, requiresConfirmation: true, token };
  }

  // Bangun payload GAS LOG_QC_REPORT
  const idempotencyKey = `${chatJid}:${messageId || Date.now()}`;
  const qcData = buildQcWebhookPayload(parsed.report, { senderName, idempotencyKey });
  const webhookPayload = { action: "LOG_QC_REPORT", data: qcData };

  try {
    const gasRes = await sendToGas("LOG_QC_REPORT", qcData);
    if (gasRes?.status !== "success") {
      await sock.sendMessage(
        chatJid,
        { text: `❌ *GAGAL MENYIMPAN KE DRIVE*\n━━━━━━━━━━━━━━━━━━━━\n${gasRes?.message || "Kesalahan Google Apps Script."}` },
        replyOpts
      );
      return { handled: true, failed: true };
    }

    notifyDataMutation();
    await sock.sendMessage(
      chatJid,
      {
        text: formatQcReplyMessage(qcData, gasRes, { corrected: parsed.corrected }),
        mentions: participant ? [participant] : undefined
      },
      replyOpts
    );
    return { handled: true, success: true, noLaporan: gasRes.noLaporan || qcData.noLaporan };
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
let currentSock = null;
let queueWorkerInterval = null;
let webBridge = null;

export async function startBot() {
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
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: process.env.DEBUG === "true" ? "debug" : "silent" }),
    auth: state,
    printQRInTerminal: false,
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

      if (isLoggedOut || isReplaced) {
        console.log("[KONEKSI] Sesi berakhir/diganti. Membersihkan auth dan restart...");
        await authPersistence.beginReset();
        sock.ev.removeAllListeners();
        try {
          fs.rmSync(getAuthDir(), { recursive: true, force: true });
        } catch (_) {}
        setTimeout(() => void startBot(), 2000);
      } else {
        setTimeout(() => void startBot(), 3000);
      }
    } else if (connection === "open") {
      console.log("\n[KONEKSI] Bot WhatsApp QC KWaS terhubung.");
      webBridge?.updateWebStatus("Connected", sock.user);

      syncDictionaryFromWebhook(appConfig.get("GAS_QC_WEBHOOK_URL")).catch(() => {});
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

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key && msg.message) {
        const msgKey = `${msg.key.remoteJid}:${msg.key.id}`;
        messageStore.set(msgKey, msg);
        if (messageStore.size > 1000) {
          messageStore.delete(messageStore.keys().next().value);
        }
      }

      if (msg.key?.fromMe || !msg.message) continue;

      const chatJid = msg.key.remoteJid;
      const participant = msg.key.participant || msg.participant || chatJid;
      const senderNumber = participant.split("@")[0].replace(/\D/g, "");
      const senderName = msg.pushName ? `${msg.pushName} (+${senderNumber})` : `+${senderNumber}`;
      const text = extractMessageText(msg);

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
    }
  });
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
