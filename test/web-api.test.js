import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppConfig } from "../src/runtime/app-config.js";
import { MessageQueue } from "../src/runtime/message-queue.js";
import { createWebApp } from "../src/web/server.js";

async function withServer(depsOverrides, fn) {
  const dir = mkdtempSync(join(tmpdir(), "wa-qc-web-"));
  const config = new AppConfig(join(dir, "config.json"));
  config.update({
    GAS_QC_WEBHOOK_URL: "https://script.google.com/macros/s/test-gas/exec",
    ALLOWED_GROUPS: "120363001@g.us",
    API_SECRET: "secret-top-rahasia",
    PORT: 3001
  });
  const queue = new MessageQueue(join(dir, "queue.json"));
  const gasCalls = [];

  const { app, state } = createWebApp({
    config,
    queue,
    sendToGas: async (action, data) => {
      gasCalls.push({ action, data });
      if (depsOverrides?.onGasCall) {
        return depsOverrides.onGasCall(action, data, gasCalls);
      }
      if (action === "GET_QC_DASHBOARD") {
        return {
          status: "success",
          data: {
            summary: { totalReports: 1, activeReports: 1, voidReports: 0, totalInspected: 1000, totalDefect: 50, totalPassed: 950, passRate: 95 },
            reports: [{ noLaporan: "QC-1", vendor: "Londo", status: "ACTIVE" }],
            items: [],
            defects: []
          }
        };
      }
      if (action === "LOG_QC_REPORT") {
        return {
          status: "success",
          duplicate: false,
          noLaporan: data.noLaporan,
          sheetUrl: "https://docs.google.com/spreadsheets/d/s1",
          pdfUrl: "https://drive.google.com/file/d/p1/view"
        };
      }
      if (action === "VOID_QC_REPORT") {
        return { status: "success", statusLaporan: "VOID", message: "Berhasil di-VOID" };
      }
      return { status: "success", data: {} };
    },
    checkGas: async () => ({
      status: "success",
      service: "wa-qc-sync-gas",
      templateConfigured: true,
      generatePdf: true
    }),
    ...(depsOverrides || {})
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await fn({ baseUrl, config, queue, gasCalls, state });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
}

test("GET /api/master, /api/help, dan /api/config tidak membocorkan API_SECRET", async () => {
  await withServer({}, async ({ baseUrl }) => {
    const master = await fetch(`${baseUrl}/api/master`).then((r) => r.json());
    assert.equal(master.success, true);
    assert.equal(master.products.length, 66);
    assert.equal(master.criteria.length, 14);

    const help = await fetch(`${baseUrl}/api/help`).then((r) => r.json());
    assert.match(help.templateText, /^FORM QC/m);
    assert.match(help.criteriaText, /Bebas Bluestain/);

    const cfgRes = await fetch(`${baseUrl}/api/config`).then((r) => r.json());
    assert.equal(cfgRes.success, true);
    assert.equal(cfgRes.config.hasApiSecret, true);
    assert.equal(cfgRes.config.apiSecret, undefined);
    assert.doesNotMatch(JSON.stringify(cfgRes), /secret-top-rahasia/);
  });
});

test("POST /api/qc/reports menegakkan validasi server, menyimpan GAS, dan fallback ke MessageQueue", async () => {
  let failNetwork = false;
  await withServer(
    {
      onGasCall: async (action, data) => {
        if (action === "LOG_QC_REPORT" && failNetwork) {
          const err = new Error("timeout");
          err.code = "ETIMEDOUT";
          throw err;
        }
        return {
          status: "success",
          duplicate: false,
          noLaporan: data.noLaporan,
          sheetUrl: "https://docs.google.com/spreadsheets/d/s1",
          pdfUrl: ""
        };
      }
    },
    async ({ baseUrl, queue, gasCalls }) => {
      // 1. Tolak payload rusak > diperiksa
      const badResp = await fetch(`${baseUrl}/api/qc/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor: "Londo",
          items: [
            {
              kodeRawBody: "RB103002",
              namaItem: "Sendok Oval",
              qtyDiperiksa: 100,
              rusak: [{ kriteriaId: "BLUESTAIN", qty: 150 }]
            }
          ]
        })
      });
      assert.equal(badResp.status, 400);
      const badJson = await badResp.json();
      assert.equal(badJson.code, "VALIDATION_ERROR");
      assert.equal(gasCalls.length, 0);

      // 2. Sukses kirim ke GAS
      const okResp = await fetch(`${baseUrl}/api/qc/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor: "Londo",
          noDokumenPo: "PO-2026-112",
          items: [
            {
              kodeRawBody: "RB103002",
              namaItem: "Sendok Oval",
              tahapBarang: "Unfinish",
              qtyDiperiksa: 1000,
              mcMentah: 13.5,
              rusak: [
                { kriteriaId: "BLUESTAIN", qty: 30 },
                { kriteriaId: "CUTTER_MARK", qty: 20 }
              ]
            }
          ]
        })
      });
      assert.equal(okResp.status, 201);
      const okJson = await okResp.json();
      assert.equal(okJson.success, true);
      assert.equal(okJson.sheetUrl, "https://docs.google.com/spreadsheets/d/s1");

      // 3. Simulasi error jaringan -> HTTP 202 + antrean lokal + retry berhasil
      failNetwork = true;
      const queuedResp = await fetch(`${baseUrl}/api/qc/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor: "Londo",
          items: [{ kodeRawBody: "RB102003", namaItem: "Sutil Besar", qtyDiperiksa: 500 }]
        })
      });
      assert.equal(queuedResp.status, 202);
      const queuedJson = await queuedResp.json();
      assert.equal(queuedJson.queued, true);
      assert.equal(queue.getPendingMessages().length, 1);

      failNetwork = false;
      const retryResp = await fetch(`${baseUrl}/api/queue/retry`, { method: "POST" });
      assert.equal(retryResp.status, 200);
      const retryJson = await retryResp.json();
      assert.equal(retryJson.processed, 1);
      assert.equal(retryJson.remaining, 0);
    }
  );
});

test("GET /api/qc/reports cache & POST /api/qc/reports/void menangani ALREADY_VOID", async () => {
  let voided = false;
  await withServer(
    {
      onGasCall: async (action) => {
        if (action === "GET_QC_DASHBOARD") {
          return {
            status: "success",
            data: { summary: { totalReports: 1 }, reports: [], items: [], defects: [] }
          };
        }
        if (action === "VOID_QC_REPORT") {
          if (voided) {
            return { status: "error", code: "ALREADY_VOID", message: "Sudah VOID" };
          }
          voided = true;
          return { status: "success", statusLaporan: "VOID", message: "Berhasil VOID" };
        }
        return { status: "success" };
      }
    },
    async ({ baseUrl, gasCalls }) => {
      const r1 = await fetch(`${baseUrl}/api/qc/reports`).then((r) => r.json());
      assert.equal(r1.success, true);
      assert.equal(r1.cached, undefined);

      const r2 = await fetch(`${baseUrl}/api/qc/reports`).then((r) => r.json());
      assert.equal(r2.cached, true);
      assert.equal(gasCalls.filter((c) => c.action === "GET_QC_DASHBOARD").length, 1);

      const void1 = await fetch(`${baseUrl}/api/qc/reports/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noLaporan: "QC-1", alasanVoid: "Salah input", oleh: "Admin" })
      });
      assert.equal(void1.status, 200);

      const void2 = await fetch(`${baseUrl}/api/qc/reports/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noLaporan: "QC-1", alasanVoid: "Ulang", oleh: "Admin" })
      });
      assert.equal(void2.status, 409);
      const void2Json = await void2.json();
      assert.equal(void2Json.code, "ALREADY_VOID");

      // Unknown API path harus JSON 404
      const notFound = await fetch(`${baseUrl}/api/tidak-ada`);
      assert.equal(notFound.status, 404);
    }
  );
});
