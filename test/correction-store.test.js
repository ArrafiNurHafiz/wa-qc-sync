import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { CorrectionStore } from "../src/runtime/correction-store.js";
import { parseAllowedGroups, isChatAllowed } from "../src/runtime/app-config.js";
import { createAuthPersistence } from "../src/runtime/auth-persistence.js";

test("CorrectionStore hanya mengembalikan konfirmasi milik pengirim yang sama", () => {
  const store = new CorrectionStore({ now: () => 1_000, tokenFactory: () => "AB12CD" });
  const token = store.create("group@g.us", "sender-a", { type: "QC_REPORT" });
  assert.equal(token, "AB12CD");

  assert.equal(store.consume("group@g.us", "sender-b", "AB12CD"), null);
  assert.deepEqual(store.consume("group@g.us", "sender-a", "ab12cd"), { type: "QC_REPORT" });
  assert.equal(store.consume("group@g.us", "sender-a", "AB12CD"), null);

  // Multi-device JID suffix (:1@s.whatsapp.net) tetap cocok dengan pengirim yang sama
  const mdToken = store.create("group@g.us", "628123456:2@s.whatsapp.net", { type: "QC_ITEM_APPEND" });
  assert.deepEqual(store.consume("group@g.us", "628123456@s.whatsapp.net", mdToken), { type: "QC_ITEM_APPEND" });

  // Consume tanpa token (cukup #OKQC) mengambil konfirmasi terakhir milik pengirim
  store.create("group@g.us", "628123456@s.whatsapp.net", { type: "QC_REPORT", simple: true });
  assert.deepEqual(store.consume("group@g.us", "628123456@s.whatsapp.net"), { type: "QC_REPORT", simple: true });
});

test("CorrectionStore menolak token kedaluwarsa (> 5 menit)", () => {
  let now = 1_000;
  const store = new CorrectionStore({ now: () => now, tokenFactory: () => "FF0011", ttlMs: 5 * 60 * 1000 });
  store.create("group@g.us", "sender-a", { ok: true });
  now += 5 * 60 * 1000 + 1;

  assert.equal(store.consume("group@g.us", "sender-a", "FF0011"), null);
});

test("whitelist ALLOWED_GROUPS memfilter grup dan normalisasi ID angka", () => {
  const GROUP_A = "120363429752883575@g.us";
  const GROUP_B = "120363999999999999@g.us";
  const JAPRI = "6281234567890@s.whatsapp.net";

  assert.equal(isChatAllowed(GROUP_A, ""), true);
  assert.equal(isChatAllowed(JAPRI, ""), true);
  assert.equal(isChatAllowed(GROUP_A, GROUP_A), true);
  assert.equal(isChatAllowed(GROUP_B, GROUP_A), false);
  assert.equal(isChatAllowed(JAPRI, GROUP_A), false);

  assert.deepEqual(parseAllowedGroups("120363429752883575, 120363999999999999@g.us"), [GROUP_A, GROUP_B]);
  assert.equal(isChatAllowed(GROUP_A, "120363429752883575"), true);
});

test("createAuthPersistence mengantre saveCreds dan menghentikan saat reset", async () => {
  let resolveSave;
  let saves = 0;
  const persistence = createAuthPersistence(async () => {
    saves++;
    await new Promise((resolve) => {
      resolveSave = resolve;
    });
  });

  const inFlight = persistence.queueSave();
  await Promise.resolve();
  const resetting = persistence.beginReset();

  resolveSave();
  await inFlight;
  await resetting;
  await persistence.queueSave();

  assert.equal(saves, 1);
});

test("konfigurasi clone baru memakai port 3001 dan tidak memiliki webhook produksi hardcoded", () => {
  const cwd = mkdtempSync(join(tmpdir(), "wa-qc-cfg-"));
  try {
    const env = { ...process.env };
    delete env.GAS_QC_WEBHOOK_URL;
    delete env.PORT;
    const moduleUrl = pathToFileURL(join(process.cwd(), "src/runtime/app-config.js")).href;
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { appConfig } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify({ url: appConfig.get("GAS_QC_WEBHOOK_URL"), port: appConfig.get("PORT") }));`
      ],
      { cwd, env, encoding: "utf8" }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), { url: "", port: 3001 });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
