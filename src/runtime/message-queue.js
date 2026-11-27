// src/runtime/message-queue.js — Antrean offline persisten atomic (message_queue.json)
import fs from "fs";
import { getQueuePath } from "./paths.js";

const QUEUE_RETENTION_DAYS = 7;

function getDefaultQueueFile() {
  return process.env.TEST_QUEUE_FILE || getQueuePath();
}

export class MessageQueue {
  constructor(queueFile = getDefaultQueueFile()) {
    this.queueFile = queueFile;
  }

  loadQueue() {
    try {
      if (fs.existsSync(this.queueFile)) {
        const data = fs.readFileSync(this.queueFile, "utf-8");
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (err) {
      console.warn(`[QUEUE] Gagal baca queue: ${err.message}`);
    }
    return [];
  }

  saveQueue(messages) {
    const tempFile = `${this.queueFile}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      fs.writeFileSync(tempFile, JSON.stringify(messages, null, 2), "utf-8");
      fs.renameSync(tempFile, this.queueFile);
    } catch (err) {
      console.error(`[QUEUE] Gagal simpan queue secara atomic: ${err.message}`);
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch (_) {}
    }
  }

  saveToQueue(sender, chatJid, text, source = "offline", payload = null) {
    const messages = this.loadQueue();
    const idempotencyKey = payload?.data?.idempotencyKey || null;

    if (idempotencyKey) {
      const existing = messages.find(
        (m) => m.status === "pending" && m.payload?.data?.idempotencyKey === idempotencyKey
      );
      if (existing) {
        return existing;
      }
    }

    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const queueMessage = {
      id,
      timestamp: new Date().toISOString(),
      sender,
      chat: chatJid,
      text,
      source,
      status: "pending",
      attempts: 0,
      lastError: null,
      lastAttempt: null,
      payload: payload || null
    };

    messages.push(queueMessage);
    this.saveQueue(messages);
    return queueMessage;
  }

  getPendingMessages(maxAttempts = 5) {
    const messages = this.loadQueue();
    return messages
      .filter((m) => m.status === "pending" && (m.attempts || 0) < maxAttempts)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  updateStatus(messageId, status, errorMsg = null) {
    const messages = this.loadQueue();
    const msg = messages.find((m) => m.id === messageId);
    if (msg) {
      msg.status = status;
      msg.attempts = (msg.attempts || 0) + 1;
      msg.lastAttempt = new Date().toISOString();
      if (errorMsg) {
        msg.lastError = errorMsg;
      }
      this.saveQueue(messages);
    }
  }

  removeFromQueue(messageId) {
    const messages = this.loadQueue();
    this.saveQueue(messages.filter((m) => m.id !== messageId));
  }

  cleanup() {
    const messages = this.loadQueue();
    const now = Date.now();
    const retentionMs = QUEUE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    const filtered = messages.filter((msg) => {
      const msgTime = new Date(msg.timestamp).getTime();
      return now - msgTime <= retentionMs;
    });

    const deletedCount = messages.length - filtered.length;
    if (deletedCount > 0) {
      this.saveQueue(filtered);
    }
    return deletedCount;
  }

  clear() {
    const prevCount = this.loadQueue().length;
    this.saveQueue([]);
    return prevCount;
  }

  getStatus() {
    const messages = this.loadQueue();
    const pending = messages.filter((m) => m.status === "pending").length;
    const failed = messages.filter((m) => m.status === "failed").length;
    const processed = messages.filter((m) => m.status === "processed").length;
    return {
      total: messages.length,
      pending,
      pendingCount: pending,
      failed,
      processed,
      items: messages.slice(-50)
    };
  }

  getQueueSize() {
    return this.loadQueue().length;
  }

  clearAll() {
    this.saveQueue([]);
  }

  // Static convenience wrappers untuk defaultQueue
  static _default = null;
  static getDefault() {
    if (!this._default) this._default = new MessageQueue();
    return this._default;
  }
  static loadQueue() { return this.getDefault().loadQueue(); }
  static saveQueue(messages) { return this.getDefault().saveQueue(messages); }
  static saveToQueue(...args) { return this.getDefault().saveToQueue(...args); }
  static getPendingMessages(maxAttempts = 5) { return this.getDefault().getPendingMessages(maxAttempts); }
  static updateStatus(...args) { return this.getDefault().updateStatus(...args); }
  static removeFromQueue(id) { return this.getDefault().removeFromQueue(id); }
  static cleanup() { return this.getDefault().cleanup(); }
  static getStatus() { return this.getDefault().getStatus(); }
  static logStatus() {
    const s = this.getStatus();
    console.log(`[QUEUE STATUS] Total: ${s.total}, Pending: ${s.pending}, Failed: ${s.failed}, Processed: ${s.processed}`);
    return s;
  }
  static getQueueSize() { return this.getDefault().getQueueSize(); }
  static clearAll() { return this.getDefault().clearAll(); }
}
