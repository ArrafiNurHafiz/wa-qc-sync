import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CorrectionStore } from "../src/runtime/correction-store.js";
import { MessageQueue } from "../src/runtime/message-queue.js";
import { handleIncomingTextMessage, processQueuedMessages } from "../src/runtime/index.js";

function createTestRuntime(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "wa-qc-rt-"));
  const queue = new MessageQueue(join(dir, "queue.json"));
  const correctionStore = new CorrectionStore({ tokenFactory: () => "A1B2C3" });
  const sentMessages = [];
  const gasCalls = [];
  let mutations = 0;

  const sock = {
    user: { id: "628111111:1@s.whatsapp.net" },
    async sendMessage(chatJid, content, options) {
      sentMessages.push({ chatJid, content, options });
    }
  };

  const deps = {
    sock,
    correctionStore,
    queue,
    allowedGroups: "",
    gasUrl: "https://script.google.com/macros/s/fake/exec",
    notifyDataMutation: () => {
      mutations++;
    },
    sendToGas: async (action, data) => {
      gasCalls.push({ action, data });
      return {
        status: "success",
        duplicate: false,
        noLaporan: data.noLaporan,
        sheetUrl: "https://docs.google.com/spreadsheets/d/sheet123",
        pdfUrl: "https://drive.google.com/file/d/pdf123/view"
      };
    },
    checkGas: async () => ({
      status: "success",
      service: "wa-qc-sync-gas",
      templateConfigured: true,
      generatePdf: true
    }),
    ...overrides
  };

  return { dir, queue, sentMessages, gasCalls, getMutations: () => mutations, deps };
}

test("router WhatsApp menangani qc, #HELP, #KRITERIA, #STATUS, dan whitelist grup", async () => {
  const ctx = createTestRuntime({ allowedGroups: "1203630001@g.us" });
  try {
    // Ditolak karena di luar whitelist
    await handleIncomingTextMessage({
      chatJid: "628999@s.whatsapp.net",
      participant: "628999@s.whatsapp.net",
      senderName: "Budi",
      text: "qc",
      messageId: "m1"
    }, ctx.deps);
    assert.equal(ctx.sentMessages.length, 0);

    // Diizinkan: ketik qc -> kirim template FORM QC tanpa panggil GAS
    await handleIncomingTextMessage({
      chatJid: "1203630001@g.us",
      participant: "62812@s.whatsapp.net",
      senderName: "Budi (+62812)",
      text: "qc",
      messageId: "m2"
    }, ctx.deps);
    assert.equal(ctx.sentMessages.length, 1);
    assert.match(ctx.sentMessages[0].content.text, /^FORM QC/m);
    assert.equal(ctx.gasCalls.length, 0);

    // #STATUS -> panggil checkGas
    await handleIncomingTextMessage({
      chatJid: "1203630001@g.us",
      participant: "62812@s.whatsapp.net",
      senderName: "Budi (+62812)",
      text: "#STATUS",
      messageId: "m3"
    }, ctx.deps);
    assert.equal(ctx.sentMessages.length, 2);
    assert.match(ctx.sentMessages[1].content.text, /SISTEM.*AKTIF|ONLINE/i);
  } finally {
    rmSync(ctx.dir, { recursive: true, force: true });
  }
});

test("router WhatsApp mencocokkan database, menolak item tak dikenal, dan fallback offline queue saat gagal jaringan", async () => {
  const ctx = createTestRuntime();
  try {
    // 1. Produk/vendor resmi dari database langsung diproses ke GAS tanpa #OK
    await handleIncomingTextMessage({
      chatJid: "1203630001@g.us",
      participant: "62812@s.whatsapp.net",
      senderName: "Budi (+62812)",
      text: `FORM QC\nVendor: Londo\nBarang: Talenan Jepang\nPeriksa: 200`,
      messageId: "m10"
    }, ctx.deps);
    assert.equal(ctx.gasCalls.length, 1);
    assert.equal(ctx.gasCalls[0].action, "LOG_QC_REPORT");
    assert.equal(ctx.gasCalls[0].data.vendor, "Londo");
    assert.equal(ctx.gasCalls[0].data.items[0].kodeRawBody, "RB201004");
    assert.equal(ctx.gasCalls[0].data.items[0].namaItem, "Talenan Jepang");
    assert.match(ctx.sentMessages[0].content.text, /spreadsheets\/d\/sheet123/);

    // 2. Simulasi error jaringan -> masuk MessageQueue, lalu retry berhasil
    let failMode = true;
    const netDeps = {
      ...ctx.deps,
      sendToGas: async (action, data) => {
        if (failMode) {
          const err = new Error("connect ECONNREFUSED");
          err.code = "ECONNREFUSED";
          throw err;
        }
        return {
          status: "success",
          noLaporan: data.noLaporan,
          sheetUrl: "https://docs.google.com/spreadsheets/d/recovered123",
          pdfUrl: ""
        };
      }
    };

    await handleIncomingTextMessage({
      chatJid: "1203630001@g.us",
      participant: "62812@s.whatsapp.net",
      senderName: "Budi (+62812)",
      text: `FORM QC\nVendor: Londo\nBarang: Sendok Oval\nPeriksa: 100`,
      messageId: "m12"
    }, netDeps);

    assert.equal(ctx.queue.getPendingMessages().length, 1);
    assert.match(ctx.sentMessages[1].content.text, /antrean offline/i);

    failMode = false;
    const retried = await processQueuedMessages(netDeps);
    assert.equal(retried.processed, 1);
    assert.equal(ctx.queue.getPendingMessages().length, 0);
    assert.match(ctx.sentMessages[2].content.text, /recovered123/);
  } finally {
    rmSync(ctx.dir, { recursive: true, force: true });
  }
});

test("router WhatsApp mendukung alur berurutan FORM QC ([ITEM 1]) -> [ITEM 2] (APPEND_QC_ITEM) -> FORM QC baru", async () => {
  const ctx = createTestRuntime({
    sendToGas: async (action, data) => {
      ctx.gasCalls.push({ action, data });
      return {
        status: "success",
        duplicate: false,
        noLaporan: data.noLaporan,
        fileId: "sheet-file-1",
        sheetUrl: "https://docs.google.com/spreadsheets/d/sheet-file-1",
        pdfUrl: "https://drive.google.com/file/d/pdf-1/view",
        totalItem: action === "APPEND_QC_ITEM" ? 2 : 1
      };
    }
  });
  const sessionStore = new Map();
  const deps = { ...ctx.deps, sessionStore };

  try {
    // 1. Kirim Item 1 via FORM QC
    await handleIncomingTextMessage({
      chatJid: "1203630001@g.us",
      participant: "62812@s.whatsapp.net",
      senderName: "Budi (+62812)",
      text: "FORM QC\nVendor: Londo\nPO: PO-01\n[ITEM 1]\nBarang: Piring\nPeriksa: 100\nKeputusan: Lolos",
      messageId: "s1"
    }, deps);
    assert.equal(ctx.gasCalls[0].action, "LOG_QC_REPORT");
    const noLap1 = ctx.gasCalls[0].data.noLaporan;
    assert.match(ctx.sentMessages[0].content.text, /Laporan diterima/i);
    assert.match(ctx.sentMessages[0].content.text, /spreadsheets\/d\/sheet-file-1/);

    // 2. Lanjut Item 2 tanpa tulis ulang FORM QC / Vendor / PO
    await handleIncomingTextMessage({
      chatJid: "1203630001@g.us",
      participant: "62812@s.whatsapp.net",
      senderName: "Budi (+62812)",
      text: "[ITEM 2]\nBarang: Mangkok\nPeriksa: 50\nCrack: 5\nKeputusan: Bersyarat",
      messageId: "s2"
    }, deps);
    assert.equal(ctx.gasCalls[1].action, "APPEND_QC_ITEM");
    assert.equal(ctx.gasCalls[1].data.noLaporan, noLap1);
    assert.equal(ctx.gasCalls[1].data.fileId, "sheet-file-1");
    assert.equal(ctx.gasCalls[1].data.item.namaItem, "Mangkok");
    assert.match(ctx.sentMessages[1].content.text, /Laporan diterima \(Item #2/i);
    assert.match(ctx.sentMessages[1].content.text, /spreadsheets\/d\/sheet-file-1/);

    // 3. Mulai kunjungan baru via FORM QC lagi
    await handleIncomingTextMessage({
      chatJid: "1203630001@g.us",
      participant: "62812@s.whatsapp.net",
      senderName: "Budi (+62812)",
      text: "FORM QC\nVendor: Janu\nPO: PO-02\n[ITEM 1]\nBarang: Cobek\nPeriksa: 20\nKeputusan: Lolos",
      messageId: "s3"
    }, deps);
    assert.equal(ctx.gasCalls[2].action, "LOG_QC_REPORT");
    assert.equal(ctx.gasCalls[2].data.vendor, "Janu");
  } finally {
    rmSync(ctx.dir, { recursive: true, force: true });
  }
});
