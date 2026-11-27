// src/runtime/web-only.js — Menjalankan Web Command Center & Mobile QC Form tanpa koneksi WhatsApp
import path from "path";
import { pathToFileURL } from "url";
import { appConfig } from "./app-config.js";
import { syncDictionaryFromWebhook } from "../qc/index.js";
import { startWebServer } from "../web/server.js";

export function startWebOnly(port = appConfig.get("PORT") || 3001) {
  syncDictionaryFromWebhook(
    appConfig.get("GAS_QC_WEBHOOK_URL"),
    null,
    appConfig.get("API_SECRET")
  ).catch(() => {});
  return startWebServer(port);
}

const isMainModule = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMainModule) {
  startWebOnly();
}
