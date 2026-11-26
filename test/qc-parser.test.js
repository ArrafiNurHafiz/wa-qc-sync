import test from "node:test";
import assert from "node:assert/strict";
import { parseQcMessage } from "../src/qc/qc-parser.js";
import { getQcTemplateText, getHelpText, getCriteriaText } from "../src/qc/help-text.js";

test("perintah qc / #QC kosong dan perintah bantu mengembalikan command yang benar", () => {
  assert.deepEqual(parseQcMessage("qc"), { command: "QC_TEMPLATE" });
  assert.deepEqual(parseQcMessage("#QC"), { command: "QC_TEMPLATE" });
  assert.deepEqual(parseQcMessage("  #qc  "), { command: "QC_TEMPLATE" });
  assert.deepEqual(parseQcMessage("#HELP"), { command: "HELP" });
  assert.deepEqual(parseQcMessage("#KRITERIA"), { command: "KRITERIA" });
  assert.deepEqual(parseQcMessage("#PRODUK"), { command: "LIST_PRODUCTS" });
  assert.deepEqual(parseQcMessage("#STATUS"), { command: "STATUS" });
  assert.deepEqual(parseQcMessage("#VENDOR PRE"), { command: "VENDOR", sub: "PRE" });

  const tpl = getQcTemplateText();
  assert.match(tpl, /^FORM QC/m);
  assert.match(tpl, /Bluestain\s*:/);
  assert.match(tpl, /Lainnya\s*:/);
  assert.match(getHelpText(66), /FORM QC/);
  assert.match(getCriteriaText(), /Bebas Bluestain/);
});

test("parseQcMessage mengurai template Gaya 4 FORM QC lengkap dengan kerusakan dan '-'", () => {
  const msg = `FORM QC
Vendor   : Londo
PO       : PO-2026-112
Barang   : Sendok Oval
Tahap    : Unfinish
Periksa  : 1000
MC %     : 13.5

[Isi angka rusak, kosong = aman, "-" = T/B]
Ati         : 
Pulur       : 
Teter       : 
Mata Mati   : 
Bluestain   : 30
Cutter Mark : 20
Gerinda     : 
Serat Balik : 
Ukuran      : 
Kesikuan    : 
Doreng      : 
Warna       : -
Kehalusan   : 
Lubang      : 
Lainnya     : 

Catatan  : 50 pcs disortir untuk rework vendor`;

  const parsed = parseQcMessage(msg);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.type, "QC_REPORT");
  assert.equal(parsed.requires_confirmation, false);
  assert.equal(parsed.report.vendor, "Londo");
  assert.equal(parsed.report.noDokumenPo, "PO-2026-112");
  assert.equal(parsed.report.items.length, 1);

  const item = parsed.report.items[0];
  assert.equal(item.kodeRawBody, "RB103002");
  assert.equal(item.qtyDiperiksa, 1000);
  assert.equal(item.mcMentah, 13.5);
  assert.equal(item.rusak.length, 2);
  assert.equal(item.totalRusak, 50);
  assert.equal(item.qtyLolos, 950);
  assert.equal(item.kriteriaStatus.WARNA, "NA");
  assert.equal(item.kriteriaStatus.BLUESTAIN, "NOK");
  assert.equal(item.kriteriaStatus.ATI, "OK");
  assert.equal(item.keputusan, "Bersyarat");
});

test("parseQcMessage mendukung penghapusan baris kosong dan input multi-item dipisah '---'", () => {
  const msg = `FORM QC
Vendor   : Londo
PO       : PO-2026-112
Barang   : Sendok Oval
Tahap    : Unfinish
Periksa  : 1000
MC %     : 13.5
Bluestain   : 30
Cutter Mark : 20
Catatan  : 50 pcs rework
---
Barang   : Sutil Besar
Tahap    : Unfinish
Periksa  : 500
MC %     : 14.0
Catatan  : Mulus semua`;

  const parsed = parseQcMessage(msg);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.report.items.length, 2);
  assert.equal(parsed.report.items[0].qtyLolos, 950);
  assert.equal(parsed.report.items[1].kodeRawBody, "RB102003");
  assert.equal(parsed.report.items[1].qtyLolos, 500);
  assert.equal(parsed.report.items[1].keputusan, "Lolos");
});

test("parseQcMessage memicu konfirmasi #OK untuk typo medium dan menolak field wajib kosong/rusak non-angka", () => {
  const typoMedium = parseQcMessage(`FORM QC
Vendor   : Widodo Kltn
Barang   : Sutil Bsr
Periksa  : 200`);
  assert.equal(typoMedium.error, undefined);
  assert.equal(typoMedium.requires_confirmation, true);
  assert.equal(typoMedium.corrections.length, 2);

  const missingField = parseQcMessage(`FORM QC
Vendor   : Londo
PO       : PO-1`);
  assert.ok(missingField.error);

  const invalidNumber = parseQcMessage(`FORM QC
Vendor   : Londo
Barang   : Sendok Oval
Periksa  : 100
Bluestain: banyak`);
  assert.ok(invalidNumber.error);
});

test("parseQcMessage mendukung format Lainnya bebas dengan angka", () => {
  const parsed = parseQcMessage(`FORM QC
Vendor  : Londo
Barang  : Sendok Oval
Periksa : 100
Lainnya : Retak ujung 5`);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.report.items[0].rusak[0].kriteriaId, "LAINNYA");
  assert.equal(parsed.report.items[0].rusak[0].qty, 5);
  assert.match(parsed.report.items[0].rusak[0].label, /Retak ujung/i);
  assert.equal(parsed.report.items[0].qtyLolos, 95);
});
