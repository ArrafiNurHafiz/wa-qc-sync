// src/runtime/paths.js — Resolusi direktori paket vs direktori data runtime (lokal repo atau ~/.wa-qc-sync)
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, "../..");

export function getPackageRoot() {
  return PACKAGE_ROOT;
}

export function getDefaultGlobalDataDir(homeDir = os.homedir()) {
  return path.join(homeDir, ".wa-qc-sync");
}

function fileContainsText(filePath, needle) {
  try {
    if (!fs.existsSync(filePath)) return false;
    return fs.readFileSync(filePath, "utf8").includes(needle);
  } catch {
    return false;
  }
}

/** Deteksi apakah folder aktif adalah workspace wa-qc-sync agar tidak bentrok dengan folder proyek lain. */
export function isProjectWorkspace(dir) {
  const target = path.resolve(dir);
  if (target === PACKAGE_ROOT) return true;

  const pkgPath = path.join(target, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg?.name === "wa-qc-sync") return true;
    } catch {
      // Abaikan package.json rusak
    }
  }

  return (
    fileContainsText(path.join(target, ".env"), "GAS_QC_WEBHOOK_URL") ||
    fileContainsText(path.join(target, "config.json"), "GAS_QC_WEBHOOK_URL")
  );
}

/** Pilih direktori data untuk CLI global tanpa mengganggu isolasi test atau import langsung. */
export function resolveCliDataDir({
  cwd = process.cwd(),
  explicitDir = process.env.WA_QC_HOME,
  homeDir = os.homedir()
} = {}) {
  if (explicitDir && String(explicitDir).trim()) {
    return path.resolve(String(explicitDir).trim());
  }
  if (isProjectWorkspace(cwd)) {
    return path.resolve(cwd);
  }
  return getDefaultGlobalDataDir(homeDir);
}

export function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getDataDir() {
  const envHome = process.env.WA_QC_HOME;
  return envHome && envHome.trim() ? path.resolve(envHome.trim()) : process.cwd();
}

export function getEnvPath(dataDir = getDataDir()) {
  return path.join(dataDir, ".env");
}

export function getConfigPath(dataDir = getDataDir()) {
  return path.join(dataDir, "config.json");
}

export function getQueuePath(dataDir = getDataDir()) {
  return path.join(dataDir, "message_queue.json");
}

export function getAuthDir(dataDir = getDataDir()) {
  return path.join(dataDir, "auth_info_baileys");
}

export function loadEnvFile(dataDir = getDataDir()) {
  const envPath = getEnvPath(dataDir);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, quiet: true });
    return envPath;
  }
  return null;
}
