// src/runtime/gas-client.js — HTTP client ke Google Apps Script Web App
import axios from "axios";
import { appConfig } from "./app-config.js";

export function isRetryableGasError(err) {
  if (!err) return false;
  if (err.code === "GAS_NOT_CONFIGURED") return false;
  if (!err.response) return true;
  const retryCodes = new Set(["ECONNABORTED", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "ECONNRESET"]);
  if (retryCodes.has(err.code)) return true;
  return Boolean(err.response && err.response.status >= 500);
}

export async function sendToGasWebhook(action, data = {}, options = {}) {
  const gasUrl = String(options.gasUrl ?? appConfig.get("GAS_QC_WEBHOOK_URL") ?? "").trim();
  if (!gasUrl) {
    const err = new Error("GAS_QC_WEBHOOK_URL belum dikonfigurasi. Silakan isi di Pengaturan.");
    err.code = "GAS_NOT_CONFIGURED";
    throw err;
  }

  const apiSecret = String(options.apiSecret ?? appConfig.get("API_SECRET") ?? "").trim();
  const payload = { action, data };
  if (apiSecret) {
    payload.apiSecret = apiSecret;
  }

  const response = await axios.post(gasUrl, payload, {
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    timeout: options.timeout ?? 30000,
    maxRedirects: 5
  });
  return response.data;
}

export async function checkGasStatus(options = {}) {
  const gasUrl = String(options.gasUrl ?? appConfig.get("GAS_QC_WEBHOOK_URL") ?? "").trim();
  if (!gasUrl) {
    const err = new Error("GAS_QC_WEBHOOK_URL belum dikonfigurasi.");
    err.code = "GAS_NOT_CONFIGURED";
    throw err;
  }

  const response = await axios.get(gasUrl, {
    timeout: options.timeout ?? 15000,
    maxRedirects: 5
  });
  return response.data;
}
