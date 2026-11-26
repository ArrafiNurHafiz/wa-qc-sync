import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageQueue } from "../src/runtime/message-queue.js";

test("MessageQueue menyimpan atomic FIFO, mencegah duplikat idempotencyKey, dan update status", () => {
  const dir = mkdtempSync(join(tmpdir(), "wa-qc-queue-"));
  const queuePath = join(dir, "message_queue.json");
  try {
    const q = new MessageQueue(queuePath);

    const first = q.saveToQueue("6281@s.whatsapp.net", "120@g.us", "FORM QC...", "network_error", {
      action: "LOG_QC_REPORT",
      data: { noLaporan: "QC-1", idempotencyKey: "key-1", vendor: "Londo", items: [] }
    });
    // Duplikat idempotencyKey yang masih pending tidak boleh menambah entri baru
    const dup = q.saveToQueue("6281@s.whatsapp.net", "120@g.us", "FORM QC...", "network_error", {
      action: "LOG_QC_REPORT",
      data: { noLaporan: "QC-1", idempotencyKey: "key-1", vendor: "Londo", items: [] }
    });
    assert.equal(dup.id, first.id);

    const second = q.saveToQueue("6282@s.whatsapp.net", "120@g.us", "FORM QC 2...", "offline", {
      action: "LOG_QC_REPORT",
      data: { noLaporan: "QC-2", idempotencyKey: "key-2", vendor: "Aris", items: [] }
    });

    assert.equal(existsSync(queuePath), true);
    const pending = q.getPendingMessages();
    assert.equal(pending.length, 2);
    assert.equal(pending[0].id, first.id);
    assert.equal(pending[1].id, second.id);

    q.updateStatus(first.id, "processed");
    const status = q.getStatus();
    assert.equal(status.pending, 1);
    assert.equal(status.processed, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("MessageQueue cleanup membersihkan pesan lebih dari 7 hari", () => {
  const dir = mkdtempSync(join(tmpdir(), "wa-qc-queue-clean-"));
  const queuePath = join(dir, "message_queue.json");
  try {
    const q = new MessageQueue(queuePath);
    const oldEntry = {
      id: "old_1",
      timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      status: "processed",
      attempts: 1,
      payload: null
    };
    const freshEntry = {
      id: "fresh_1",
      timestamp: new Date().toISOString(),
      status: "pending",
      attempts: 0,
      payload: null
    };
    q.saveQueue([oldEntry, freshEntry]);

    const removed = q.cleanup();
    assert.equal(removed, 1);
    assert.equal(q.getQueueSize(), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
