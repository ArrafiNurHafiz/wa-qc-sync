#!/usr/bin/env node
// src/runtime/cli.js — CLI global wa-qc-sync (start, web, setup, doctor)
import { spawn } from "child_process";
import fs from "fs";
import net from "net";
import path from "path";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { fileURLToPath } from "url";
import {
  ensureDir,
  getConfigPath,
  getEnvPath,
  getLogPath,
  getPackageRoot,
  getPidPath,
  getQueuePath,
  loadEnvFile,
  resolveCliDataDir
} from "./paths.js";

const COMMANDS = new Set(["start", "run", "web", "stop", "status", "logs", "setup", "doctor", "help", "version"]);

export function readPackageMeta() {
  const pkgPath = path.join(getPackageRoot(), "package.json");
  return JSON.parse(fs.readFileSync(pkgPath, "utf8"));
}

/** Mengurai argumen CLI menjadi subcommand + opsi konfigurasi tanpa dependensi eksternal. */
export function parseCliArgs(argv = []) {
  const opts = {
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
  };

  const args = [...argv];
  let commandSet = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      opts.command = "help";
      commandSet = true;
    } else if (arg === "-v" || arg === "--version") {
      opts.command = "version";
      commandSet = true;
    } else if (arg === "-w" || arg === "--web") {
      opts.webOnly = true;
      if (!commandSet) opts.command = "web";
    } else if (arg === "-f" || arg === "--foreground") {
      opts.foreground = true;
    } else if (arg === "--no-open") {
      opts.noOpen = true;
    } else if (arg === "-y" || arg === "--non-interactive") {
      opts.nonInteractive = true;
    } else if (arg === "-d" || arg === "--data-dir") {
      opts.dataDir = args[++i] || null;
    } else if (arg.startsWith("--data-dir=")) {
      opts.dataDir = arg.slice("--data-dir=".length);
    } else if (arg === "-p" || arg === "--port") {
      opts.port = parseInt(args[++i], 10) || null;
    } else if (arg.startsWith("--port=")) {
      opts.port = parseInt(arg.slice("--port=".length), 10) || null;
    } else if (arg.startsWith("--gas-url=")) {
      opts.gasUrl = arg.slice("--gas-url=".length);
    } else if (arg.startsWith("--groups=")) {
      opts.allowedGroups = arg.slice("--groups=".length);
    } else if (arg.startsWith("--secret=")) {
      opts.apiSecret = arg.slice("--secret=".length);
    } else if (!arg.startsWith("-") && !commandSet && COMMANDS.has(arg)) {
      opts.command = arg;
      commandSet = true;
      if (arg === "web") opts.webOnly = true;
    }
  }

  return opts;
}

/** Salin .env.example ke dataDir/.env bila belum ada (aman, tidak menimpa konfigurasi lama). */
export function ensureEnvBootstrapped(dataDir) {
  const envPath = getEnvPath(dataDir);
  if (fs.existsSync(envPath)) return false;

  const examplePath = path.join(getPackageRoot(), ".env.example");
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    return true;
  }
  return false;
}

function formatEnvValue(val) {
  const str = String(val ?? "");
  return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Simpan variabel ke .env (pertahankan baris/komentar lain) dan sinkronkan ke config.json. */
export async function saveSetupValues(dataDir, values = {}) {
  ensureDir(dataDir);
  ensureEnvBootstrapped(dataDir);

  const envPath = getEnvPath(dataDir);
  const lines = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf8").split(/\r?\n/)
    : [];

  const updates = {
    PORT: String(values.PORT || 3001),
    GAS_QC_WEBHOOK_URL: String(values.GAS_QC_WEBHOOK_URL ?? "").trim(),
    ALLOWED_GROUPS: String(values.ALLOWED_GROUPS ?? "").trim(),
    API_SECRET: String(values.API_SECRET ?? "").trim()
  };

  const remaining = { ...updates };
  const nextLines = lines.map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (match && Object.prototype.hasOwnProperty.call(remaining, match[1])) {
      const key = match[1];
      const val = remaining[key];
      delete remaining[key];
      return key === "PORT" ? `${key}=${val}` : `${key}=${formatEnvValue(val)}`;
    }
    return line;
  });

  for (const [key, val] of Object.entries(remaining)) {
    nextLines.push(key === "PORT" ? `${key}=${val}` : `${key}=${formatEnvValue(val)}`);
  }

  fs.writeFileSync(envPath, `${nextLines.join("\n").replace(/\n+$/, "")}\n`, "utf8");

  const { AppConfig } = await import("./app-config.js");
  const cfg = new AppConfig(getConfigPath(dataDir));
  return cfg.update({
    PORT: parseInt(updates.PORT, 10) || 3001,
    GAS_QC_WEBHOOK_URL: updates.GAS_QC_WEBHOOK_URL,
    ALLOWED_GROUPS: updates.ALLOWED_GROUPS,
    API_SECRET: updates.API_SECRET
  });
}

function printHelp(meta, dataDir) {
  const pkgRoot = getPackageRoot();
  console.log(`
${meta.name} v${meta.version} — Automasi QC Lapangan KWaS

Pemakaian:
  qc-kwas [perintah] [opsi]

Perintah:
  start                 Jalankan Bot WA + Web UI di latar belakang (default)
  web                   Jalankan Web Command Center di latar belakang (tanpa WA)
  run                   Jalankan di foreground (untuk debug / systemd)
  status                Cek status proses latar belakang
  logs                  Tampilkan 40 baris log terakhir
  stop                  Hentikan proses latar belakang
  setup                 Wizard konfigurasi opsional di terminal
  doctor                Cek kesiapan Node.js, folder data, port, antrean, & GAS
  help                  Tampilkan panduan perintah ini
  version               Tampilkan versi paket

Opsi:
  -d, --data-dir <dir>  Folder penyimpanan sesi WA, config.json, & .env
                        (aktif saat ini: ${dataDir})
  -p, --port <port>     Timpa port Web Command Center (default: 3001)
  -w, --web             Pintasan untuk mode Web Command Center saja
  -f, --foreground      Jalankan di foreground (jangan masuk latar belakang)
      --no-open         Jangan buka browser otomatis saat start
  -h, --help            Tampilkan bantuan
  -v, --version         Tampilkan versi

Berkas referensi Google Apps Script dalam paket ini:
  - GAS Script : ${path.join(pkgRoot, "gas", "Code_QC.gs")}
  - Form Excel : ${path.join(pkgRoot, "docs", "referensi", "Form Lap QC Lap-cetak.xlsx")}
`.trim());
}

async function promptWithDefault(rl, label, currentValue = "") {
  const suffix = currentValue ? ` [${currentValue}]` : "";
  const answer = await rl.question(`${label}${suffix}: `);
  const trimmed = answer.trim();
  return trimmed === "" ? currentValue : trimmed;
}

export async function runSetup(dataDir, opts = {}) {
  const pkgRoot = getPackageRoot();
  ensureDir(dataDir);
  ensureEnvBootstrapped(dataDir);
  loadEnvFile(dataDir);

  const { AppConfig } = await import("./app-config.js");
  const { checkGasStatus } = await import("./gas-client.js");
  const current = new AppConfig(getConfigPath(dataDir)).getAll();

  let gasUrl = opts.gasUrl ?? current.GAS_QC_WEBHOOK_URL ?? "";
  let port = opts.port ?? current.PORT ?? 3001;
  let allowedGroups = opts.allowedGroups ?? current.ALLOWED_GROUPS ?? "";
  let apiSecret = opts.apiSecret ?? current.API_SECRET ?? "";

  if (!opts.nonInteractive && process.stdin.isTTY) {
    console.log("==========================================");
    console.log("  SETUP WA-QC-SYNC (KWaS)");
    console.log("==========================================");
    console.log(`Direktori data : ${dataDir}`);
    console.log(`Skrip GAS      : ${path.join(pkgRoot, "gas", "Code_QC.gs")}`);
    console.log(`Template Excel : ${path.join(pkgRoot, "docs", "referensi", "Form Lap QC Lap-cetak.xlsx")}\n`);

    const rl = readline.createInterface({ input, output });
    try {
      gasUrl = await promptWithDefault(rl, "URL Web App GAS (/exec, boleh kosong dulu)", gasUrl);
      const portStr = await promptWithDefault(rl, "Port Web Console", String(port));
      port = parseInt(portStr, 10) || 3001;
      allowedGroups = await promptWithDefault(rl, "ALLOWED_GROUPS (ID grup dipisah koma, kosong = semua)", allowedGroups);
      apiSecret = await promptWithDefault(rl, "API_SECRET opsional", apiSecret);
    } finally {
      rl.close();
    }
  }

  const saved = await saveSetupValues(dataDir, {
    PORT: port,
    GAS_QC_WEBHOOK_URL: gasUrl,
    ALLOWED_GROUPS: allowedGroups,
    API_SECRET: apiSecret
  });

  console.log(`\nKonfigurasi tersimpan ke:`);
  console.log(`- ${getEnvPath(dataDir)}`);
  console.log(`- ${getConfigPath(dataDir)}`);

  if (saved.GAS_QC_WEBHOOK_URL) {
    try {
      const res = await checkGasStatus({ gasUrl: saved.GAS_QC_WEBHOOK_URL, timeout: 10000 });
      console.log(`Koneksi GAS Web App OK (service: ${res?.service || "ok"}, templateConfigured: ${Boolean(res?.templateConfigured)})`);
    } catch (err) {
      console.warn(`Peringatan ping GAS: ${err.message}`);
    }
  } else {
    console.log("GAS_QC_WEBHOOK_URL belum diisi. Anda dapat mengisinya nanti lewat tab Pengaturan di Web UI.");
  }

  return saved;
}

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => resolve({ ok: false, error: err.code || err.message }));
    server.once("listening", () => {
      server.close(() => resolve({ ok: true }));
    });
    server.listen(port, "127.0.0.1");
  });
}

export async function runDoctor(dataDir, opts = {}) {
  loadEnvFile(dataDir);
  const { AppConfig } = await import("./app-config.js");
  const { MessageQueue } = await import("./message-queue.js");
  const { checkGasStatus } = await import("./gas-client.js");

  const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
  const nodeOk = nodeMajor >= 18;
  const dirExists = fs.existsSync(dataDir);
  const cfg = new AppConfig(getConfigPath(dataDir)).getAll();
  const port = opts.port || cfg.PORT || 3001;
  const portCheck = await checkPortAvailable(port);
  const queueStats = new MessageQueue(getQueuePath(dataDir)).getStatus();

  console.log("==========================================");
  console.log("  DIAGNOSTIK WA-QC-SYNC (DOCTOR)");
  console.log("==========================================");
  console.log(`[${nodeOk ? "PASS" : "FAIL"}] Node.js       : v${process.versions.node} (minimal v18)`);
  console.log(`[${dirExists ? "PASS" : "WARN"}] Data Dir      : ${dataDir}`);
  console.log(`[${fs.existsSync(getEnvPath(dataDir)) ? "PASS" : "INFO"}] File .env     : ${getEnvPath(dataDir)}`);
  console.log(`[${portCheck.ok ? "PASS" : "FAIL"}] Port ${port}     : ${portCheck.ok ? "tersedia" : `gagal (${portCheck.error})`}`);
  console.log(`[INFO] Antrean Queue : total=${queueStats.total}, pending=${queueStats.pending}, failed=${queueStats.failed}`);

  let gasOk = true;
  if (!cfg.GAS_QC_WEBHOOK_URL) {
    console.log("[WARN] GAS Webhook   : belum dikonfigurasi (jalankan 'qc-kwas setup' atau atur di Web UI)");
  } else {
    try {
      const res = await checkGasStatus({ gasUrl: cfg.GAS_QC_WEBHOOK_URL, timeout: 10000 });
      console.log(`[PASS] GAS Webhook   : aktif (templateConfigured=${Boolean(res?.templateConfigured)}, generatePdf=${Boolean(res?.generatePdf)})`);
    } catch (err) {
      gasOk = false;
      console.log(`[WARN] GAS Webhook   : tidak terjangkau (${err.message})`);
    }
  }

  return {
    ok: nodeOk && portCheck.ok,
    nodeVersion: process.versions.node,
    dataDir,
    port,
    portAvailable: portCheck.ok,
    gasConfigured: Boolean(cfg.GAS_QC_WEBHOOK_URL),
    gasReachable: gasOk,
    queueStats
  };
}

function isPidAlive(pid) {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readRunningDaemon(dataDir) {
  const pidPath = getPidPath(dataDir);
  if (!fs.existsSync(pidPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(pidPath, "utf8"));
    if (raw?.pid && isPidAlive(raw.pid)) {
      return raw;
    }
  } catch {
    // Abaikan PID file rusak
  }
  try { fs.unlinkSync(pidPath); } catch {}
  return null;
}

function registerPidCleanup(pidPath) {
  const cleanup = () => {
    try {
      if (fs.existsSync(pidPath)) {
        const raw = JSON.parse(fs.readFileSync(pidPath, "utf8"));
        if (raw?.pid === process.pid) fs.unlinkSync(pidPath);
      }
    } catch {}
  };
  process.once("exit", cleanup);
  process.once("SIGINT", () => { cleanup(); process.exit(0); });
  process.once("SIGTERM", () => { cleanup(); process.exit(0); });
}

function openBrowserUrl(url) {
  try {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    const p = spawn(cmd, args, { detached: true, stdio: "ignore" });
    p.on("error", () => {});
    p.unref();
  } catch {}
}

async function startBackgroundDaemon(dataDir, opts, activePort) {
  const existing = readRunningDaemon(dataDir);
  if (existing) {
    console.log(`qc-kwas sudah berjalan di latar belakang (PID: ${existing.pid})`);
    console.log(`Web Command Center : http://localhost:${existing.port || activePort}`);
    return 0;
  }

  const logPath = getLogPath(dataDir);
  const pidPath = getPidPath(dataDir);
  const logFd = fs.openSync(logPath, "a");
  const childArgs = [
    fileURLToPath(import.meta.url),
    opts.webOnly ? "web" : "run",
    "--foreground",
    "--data-dir", dataDir,
    "--port", String(activePort)
  ];

  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, WA_QC_HOME: dataDir, PORT: String(activePort) }
  });
  child.unref();
  fs.closeSync(logFd);

  fs.writeFileSync(pidPath, JSON.stringify({
    pid: child.pid,
    port: activePort,
    mode: opts.webOnly ? "web" : "start",
    startedAt: new Date().toISOString()
  }, null, 2));

  // Tunggu hingga port HTTP siap atau proses gagal
  let listening = false;
  for (let i = 0; i < 40; i++) {
    if (!isPidAlive(child.pid)) break;
    const p = await checkPortAvailable(activePort);
    if (!p.ok) {
      listening = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  if (!isPidAlive(child.pid) && !listening) {
    try { fs.unlinkSync(pidPath); } catch {}
    console.error("[CLI ERROR] Gagal menjalankan qc-kwas di latar belakang. Log terakhir:");
    try {
      const tail = fs.readFileSync(logPath, "utf8").split(/\r?\n/).slice(-15).join("\n");
      if (tail) console.error(tail);
    } catch {}
    return 1;
  }

  const webUrl = `http://localhost:${activePort}`;
  console.log(`qc-kwas berjalan di latar belakang (PID: ${child.pid})`);
  console.log(`- Web Command Center : ${webUrl}`);
  console.log(`- Direktori data     : ${dataDir}`);
  console.log(`- Perintah lain      : qc-kwas status | qc-kwas logs | qc-kwas stop`);
  if (!opts.noOpen) openBrowserUrl(webUrl);
  return 0;
}

async function stopBackgroundDaemon(dataDir) {
  const existing = readRunningDaemon(dataDir);
  if (!existing) {
    console.log("qc-kwas tidak sedang berjalan di latar belakang.");
    return 0;
  }

  try {
    process.kill(existing.pid, "SIGTERM");
  } catch {}

  for (let i = 0; i < 20; i++) {
    if (!isPidAlive(existing.pid)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (isPidAlive(existing.pid)) {
    try { process.kill(existing.pid, "SIGKILL"); } catch {}
  }
  try { fs.unlinkSync(getPidPath(dataDir)); } catch {}
  console.log(`qc-kwas (PID: ${existing.pid}) berhasil dihentikan.`);
  return 0;
}

export async function runCli(argv = process.argv.slice(2)) {
  const opts = parseCliArgs(argv);
  const meta = readPackageMeta();
  const dataDir = resolveCliDataDir({ explicitDir: opts.dataDir });

  if (opts.command === "version") {
    console.log(`${meta.name} v${meta.version}`);
    return 0;
  }

  if (opts.command === "help") {
    printHelp(meta, dataDir);
    return 0;
  }

  ensureDir(dataDir);
  process.env.WA_QC_HOME = dataDir;
  if (opts.port) {
    process.env.PORT = String(opts.port);
  }
  ensureEnvBootstrapped(dataDir);
  loadEnvFile(dataDir);

  if (opts.command === "setup") {
    await runSetup(dataDir, opts);
    return 0;
  }

  if (opts.command === "doctor") {
    const report = await runDoctor(dataDir, opts);
    return report.ok ? 0 : 1;
  }

  if (opts.command === "stop") {
    return await stopBackgroundDaemon(dataDir);
  }

  if (opts.command === "status") {
    const running = readRunningDaemon(dataDir);
    if (!running) {
      console.log(`Status: berhenti (direktori data: ${dataDir})`);
      return 0;
    }
    console.log(`Status: berjalan di latar belakang (PID: ${running.pid}, mode: ${running.mode || "start"}, Web UI: http://localhost:${running.port || 3001})`);
    return 0;
  }

  if (opts.command === "logs") {
    const logPath = getLogPath(dataDir);
    if (!fs.existsSync(logPath)) {
      console.log(`Belum ada file log di ${logPath}`);
      return 0;
    }
    const tail = fs.readFileSync(logPath, "utf8").split(/\r?\n/).slice(-40).join("\n");
    console.log(tail);
    return 0;
  }

  const { appConfig } = await import("./app-config.js");
  const activePort = opts.port || appConfig.get("PORT") || 3001;
  const runForeground = opts.foreground || opts.command === "run";

  if (!runForeground) {
    return await startBackgroundDaemon(dataDir, opts, activePort);
  }

  fs.writeFileSync(getPidPath(dataDir), JSON.stringify({
    pid: process.pid,
    port: activePort,
    mode: opts.webOnly ? "web" : "start",
    startedAt: new Date().toISOString()
  }, null, 2));
  registerPidCleanup(getPidPath(dataDir));

  console.log(`[CLI] Direktori data aktif: ${dataDir}`);
  console.log(`[CLI] Web Command Center  : http://localhost:${activePort}`);

  if (opts.command === "web" || opts.webOnly) {
    const { startWebOnly } = await import("./web-only.js");
    startWebOnly(activePort);
    return 0;
  }

  const { bootstrap } = await import("./index.js");
  await bootstrap({ port: activePort });
  return 0;
}

function isDirectCliExecution() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectCliExecution()) {
  runCli()
    .then((code) => {
      if (typeof code === "number" && code !== 0) {
        process.exitCode = code;
      }
    })
    .catch((err) => {
      console.error("[CLI ERROR]", err?.message || err);
      process.exit(1);
    });
}
