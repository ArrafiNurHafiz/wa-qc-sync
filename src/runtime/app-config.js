// src/runtime/app-config.js — Konfigurasi runtime lokal (config.json + .env) & filter whitelist grup
import fs from "fs";
import { getConfigPath, loadEnvFile } from "./paths.js";

loadEnvFile();

function getDefaultConfig() {
  return {
    GAS_QC_WEBHOOK_URL: process.env.GAS_QC_WEBHOOK_URL || "",
    ALLOWED_GROUPS: process.env.ALLOWED_GROUPS || "",
    API_SECRET: process.env.API_SECRET || "",
    PORT: parseInt(process.env.PORT, 10) || 3001
  };
}

export class AppConfig {
  constructor(configPath = getConfigPath()) {
    this.configPath = configPath;
    this.config = getDefaultConfig();
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, "utf-8");
        const parsed = JSON.parse(raw);
        this.config = { ...this.config, ...parsed };
      } else {
        this.save();
      }
    } catch (err) {
      console.warn(`[CONFIG] Gagal membaca config.json, menggunakan default: ${err.message}`);
    }
  }

  save() {
    const tempFile = `${this.configPath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      fs.writeFileSync(tempFile, JSON.stringify(this.config, null, 2), "utf-8");
      fs.renameSync(tempFile, this.configPath);
    } catch (err) {
      console.error(`[CONFIG] Gagal menyimpan config.json: ${err.message}`);
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch (_) {}
    }
  }

  get(key) {
    return this.config[key];
  }

  getAll() {
    return { ...this.config };
  }

  set(key, value) {
    this.config[key] = value;
    this.save();
  }

  update(newValues = {}) {
    this.config = { ...this.config, ...newValues };
    this.save();
    return this.getAll();
  }
}

export const appConfig = new AppConfig();

export function parseAllowedGroups(raw) {
  return String(raw || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => (/^\d+$/.test(n) ? `${n}@g.us` : n));
}

export function isChatAllowed(chatJid, raw) {
  const groups = parseAllowedGroups(raw);
  if (groups.length === 0) return true;
  return Boolean(chatJid && chatJid.endsWith("@g.us") && groups.includes(chatJid));
}
