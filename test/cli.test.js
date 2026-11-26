import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseCliArgs } from "../src/runtime/cli.js";
import { getPackageRoot, resolveCliDataDir } from "../src/runtime/paths.js";

function runProcess(cmd, args, options) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", rejectPromise);
    child.on("close", (status) => resolvePromise({ status, stdout, stderr }));
  });
}

test("parseCliArgs mengurai subcommand dan flag CLI dengan akurat", () => {
  assert.deepEqual(parseCliArgs([]), {
    command: "start",
    webOnly: false,
    foreground: false,
    noOpen: false,
    dataDir: null,
    port: null,
    gasUrl: null,
    allowedGroups: null,
    apiSecret: null,
    nonInteractive: false
  });

  const parsed = parseCliArgs(["--web", "-f", "--no-open", "-p", "3010", "--data-dir=/tmp/qc-data"]);
  assert.equal(parsed.command, "web");
  assert.equal(parsed.webOnly, true);
  assert.equal(parsed.foreground, true);
  assert.equal(parsed.noOpen, true);
  assert.equal(parsed.port, 3010);
  assert.equal(parsed.dataDir, "/tmp/qc-data");

  const setup = parseCliArgs(["setup", "-y", "--gas-url=https://x/exec", "--groups=123@g.us", "--secret=sec"]);
  assert.equal(setup.command, "setup");
  assert.equal(setup.nonInteractive, true);
  assert.equal(setup.gasUrl, "https://x/exec");
  assert.equal(setup.allowedGroups, "123@g.us");
  assert.equal(setup.apiSecret, "sec");
});

test("resolveCliDataDir mengisolasi folder proyek lain ke ~/.wa-qc-sync kecuali eksplisit atau workspace wa-qc-sync", () => {
  const base = mkdtempSync(join(tmpdir(), "wa-qc-paths-"));
  try {
    const fakeHome = join(base, "home");
    const foreignProject = join(base, "wa-lain");
    const qcWorkspace = join(base, "qc-ws");
    mkdirSync(fakeHome, { recursive: true });
    mkdirSync(foreignProject, { recursive: true });
    mkdirSync(qcWorkspace, { recursive: true });

    // Folder proyek WA lain yang punya .env & config.json berbeda tidak boleh tertimpa
    writeFileSync(join(foreignProject, ".env"), "GAS_WEBHOOK_URL=https://lain/exec\n");
    writeFileSync(join(foreignProject, "config.json"), '{"PORT":3000}');
    assert.equal(
      resolveCliDataDir({ cwd: foreignProject, explicitDir: "", homeDir: fakeHome }),
      join(fakeHome, ".qc-kwas")
    );

    // Folder milik wa-qc-sync (memiliki GAS_QC_WEBHOOK_URL) tetap dipakai langsung
    writeFileSync(join(qcWorkspace, ".env"), 'GAS_QC_WEBHOOK_URL=""\n');
    assert.equal(
      resolveCliDataDir({ cwd: qcWorkspace, explicitDir: "", homeDir: fakeHome }),
      qcWorkspace
    );

    // Repo paket saat ini selalu dikenali
    assert.equal(
      resolveCliDataDir({ cwd: getPackageRoot(), explicitDir: "", homeDir: fakeHome }),
      getPackageRoot()
    );

    // --data-dir / WA_QC_HOME eksplisit selalu menang
    assert.equal(
      resolveCliDataDir({ cwd: foreignProject, explicitDir: join(base, "custom"), homeDir: fakeHome }),
      join(base, "custom")
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("CLI wa-qc-sync berjalan via symlink global (setup non-interaktif + doctor)", async () => {
  const base = mkdtempSync(join(tmpdir(), "wa-qc-cli-"));
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "success", service: "wa-qc-sync-gas", templateConfigured: true, generatePdf: true }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));

  try {
    const gasMockPort = server.address().port;
    const gasMockUrl = `http://127.0.0.1:${gasMockPort}/exec`;
    const cliTarget = resolve("src/runtime/cli.js");
    const binSymlink = join(base, "qc-kwas");
    const dataDir = join(base, "qc-data");
    symlinkSync(cliTarget, binSymlink);

    const env = { ...process.env };
    delete env.WA_QC_HOME;
    delete env.GAS_QC_WEBHOOK_URL;
    delete env.PORT;

    const ver = spawnSync(binSymlink, ["--version"], { cwd: base, env, encoding: "utf8" });
    assert.equal(ver.status, 0, ver.stderr);
    assert.match(ver.stdout, /qc-kwas v/);

    const setupRes = await runProcess(
      binSymlink,
      ["setup", "-y", "--data-dir", dataDir, "--port=3199", `--gas-url=${gasMockUrl}`, "--groups=12036399@g.us", "--secret=top"],
      { cwd: base, env, encoding: "utf8" }
    );
    assert.equal(setupRes.status, 0, setupRes.stderr);
    assert.match(setupRes.stdout, /Koneksi GAS Web App OK/);

    const envText = readFileSync(join(dataDir, ".env"), "utf8");
    assert.match(envText, /PORT=3199/);
    assert.match(envText, new RegExp(gasMockUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const cfgJson = JSON.parse(readFileSync(join(dataDir, "config.json"), "utf8"));
    assert.equal(cfgJson.PORT, 3199);
    assert.equal(cfgJson.GAS_QC_WEBHOOK_URL, gasMockUrl);
    assert.equal(cfgJson.ALLOWED_GROUPS, "12036399@g.us");

    const docRes = await runProcess(binSymlink, ["doctor", "--data-dir", dataDir], { cwd: base, env, encoding: "utf8" });
    assert.equal(docRes.status, 0, docRes.stderr);
    assert.match(docRes.stdout, /\[PASS\] Node\.js/);
    assert.match(docRes.stdout, /\[PASS\] Port 3199/);
    assert.match(docRes.stdout, /\[PASS\] GAS Webhook/);

    // Uji mode background otomatis: qc-kwas web --port 3197 --no-open -> status -> fetch HTML -> stop
    const bgStart = await runProcess(
      binSymlink,
      ["web", "--port", "3197", "--no-open", "--data-dir", dataDir],
      { cwd: base, env, encoding: "utf8" }
    );
    assert.equal(bgStart.status, 0, bgStart.stderr);
    assert.match(bgStart.stdout, /berjalan di latar belakang/i);

    const statusRes = await runProcess(binSymlink, ["status", "--data-dir", dataDir], { cwd: base, env, encoding: "utf8" });
    assert.equal(statusRes.status, 0);
    assert.match(statusRes.stdout, /berjalan di latar belakang/i);

    const html = await fetch("http://127.0.0.1:3197/").then((r) => r.text());
    assert.match(html, /<title>/);

    const stopRes = await runProcess(binSymlink, ["stop", "--data-dir", dataDir], { cwd: base, env, encoding: "utf8" });
    assert.equal(stopRes.status, 0, stopRes.stderr);
    assert.match(stopRes.stdout, /berhasil dihentikan/i);
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(base, { recursive: true, force: true });
  }
});
