// src/runtime/web-only.js — Menjalankan Web Command Center & Mobile QC Form tanpa koneksi WhatsApp
import path from "path";
import { pathToFileURL } from "url";
import { appConfig } from "./app-config.js";
import { startWebServer } from "../web/server.js";

export function startWebOnly(port = appConfig.get("PORT") || 3001) {
  return startWebServer(port);
}

const isMainModule = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMainModule) {
  startWebOnly();
}
