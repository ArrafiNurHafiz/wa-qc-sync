// src/runtime/correction-store.js — Penyimpanan token konfirmasi #OK <6-HEX> TTL 5 menit
import crypto from "crypto";

export class CorrectionStore {
  constructor({ ttlMs = 5 * 60 * 1000, now = () => Date.now(), tokenFactory } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.tokenFactory = tokenFactory || (() => crypto.randomBytes(3).toString("hex").toUpperCase());
    this.entries = new Map();
  }

  key(chatJid, participant) {
    const cleanParticipant = String(participant || "").replace(/:\d+(?=@)/, "");
    return `${chatJid}:${cleanParticipant}`;
  }

  create(chatJid, participant, value) {
    const token = this.tokenFactory();
    this.entries.set(this.key(chatJid, participant), {
      token,
      value,
      expiresAt: this.now() + this.ttlMs
    });
    return token;
  }

  consume(chatJid, participant, token = null) {
    const k = this.key(chatJid, participant);
    const entry = this.entries.get(k);
    if (!entry || entry.expiresAt < this.now()) {
      if (entry && entry.expiresAt < this.now()) {
        this.entries.delete(k);
      }
      return null;
    }
    if (token !== null && token !== undefined && String(token).trim() !== "") {
      if (entry.token !== String(token).trim().toUpperCase()) {
        return null;
      }
    }
    this.entries.delete(k);
    return entry.value;
  }
}
