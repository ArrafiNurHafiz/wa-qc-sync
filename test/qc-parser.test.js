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
  assert.match(tpl, /\[ITEM 1\]/);
  assert.match(tpl, /\[ITEM 4\]/);
  assert.equal(tpl.match(/^---$/gm)?.length, 3);
  assert.equal(tpl.match(/^Keputusan:/gm)?.length, 4);
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
  assert.equal(item.kodeRawBody, "");
  assert.equal(item.namaItem, "Sendok Oval");
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
  assert.equal(parsed.report.items[1].kodeRawBody, "");
  assert.equal(parsed.report.items[1].namaItem, "Sutil Besar");
  assert.equal(parsed.report.items[1].qtyLolos, 500);
  assert.equal(parsed.report.items[1].keputusan, "Lolos");
});

test("parseQcMessage menerima teks custom bebas dan menolak field wajib kosong/rusak non-angka", () => {
  const customFree = parseQcMessage(`FORM QC
Vendor   : Widodo Kltn
Barang   : Sutil Bsr
Periksa  : 200`);
  assert.equal(customFree.error, undefined);
  assert.equal(customFree.requires_confirmation, false);
  assert.equal(customFree.report.vendor, "Widodo Kltn");
  assert.equal(customFree.report.items[0].kodeRawBody, "");
  assert.equal(customFree.report.items[0].namaItem, "Sutil Bsr");

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

test("parseQcMessage dari template kosong 4 item: mengabaikan slot item kosong dan mendukung pengisian 4 item penuh", () => {
  const tpl = getQcTemplateText();
  const filled1 = tpl
    .replace("Vendor   : ", "Vendor   : Londo")
    .replace("PO       : ", "PO       : PO-4-01")
    .replace("[ITEM 1]\nBarang   : \nTahap    : Unfinish\nPeriksa  : \nMC %     : ", "[ITEM 1]\nBarang   : Sendok Oval\nTahap    : Unfinish\nPeriksa  : 100\nMC %     : 13.5")
    .replace("\nKeputusan: ", "\nKeputusan: Tolak");

  const res1 = parseQcMessage(filled1);
  assert.equal(res1.error, undefined);
  assert.equal(res1.report.items.length, 1);
  assert.equal(res1.report.items[0].kodeRawBody, "");
  assert.equal(res1.report.items[0].namaItem, "Sendok Oval");
  assert.equal(res1.report.items[0].qtyLolos, 100);
  assert.equal(res1.report.items[0].keputusan, "Tolak");

  const filled4 = tpl
    .replace("Vendor   : ", "Vendor   : Londo")
    .replace("PO       : ", "PO       : PO-4-04")
    .replace("[ITEM 1]\nBarang   : \nTahap    : Unfinish\nPeriksa  : \nMC %     : ", "[ITEM 1]\nBarang   : Sendok Oval\nTahap    : Unfinish\nPeriksa  : 100\nMC %     : 13.5")
    .replace("[ITEM 2]\nBarang   : \nTahap    : Unfinish\nPeriksa  : \nMC %     : ", "[ITEM 2]\nBarang   : Sutil Besar\nTahap    : Unfinish\nPeriksa  : 200\nMC %     : 14.0")
    .replace("[ITEM 3]\nBarang   : \nTahap    : Unfinish\nPeriksa  : \nMC %     : ", "[ITEM 3]\nBarang   : Sendok Oval\nTahap    : Finish\nPeriksa  : 150\nMC %     : 15.0")
    .replace("[ITEM 4]\nBarang   : \nTahap    : Unfinish\nPeriksa  : \nMC %     : ", "[ITEM 4]\nBarang   : Sutil Besar\nTahap    : Finish\nPeriksa  : 50\nMC %     : 16.0");

  const res4 = parseQcMessage(filled4);
  assert.equal(res4.error, undefined);
  assert.equal(res4.report.items.length, 4);
  assert.equal(res4.report.items[3].qtyDiperiksa, 50);
});

test("parseQcMessage menerima produk dan vendor custom bebas di luar kamus lokal", () => {
  const parsed = parseQcMessage(`FORM QC
Vendor   : CV Sumber Kayu Mandiri
PO       : PO-CUSTOM-01
Barang   : Talang Bambu Custom 40cm
Tahap    : Unfinish
Periksa  : 120
MC %     : 12.5
Bluestain: 10
Keputusan: Bersyarat`);

  assert.equal(parsed.error, undefined);
  assert.equal(parsed.requires_confirmation, false);
  assert.equal(parsed.report.vendor, "CV Sumber Kayu Mandiri");
  assert.equal(parsed.report.items[0].kodeRawBody, "");
  assert.equal(parsed.report.items[0].namaItem, "Talang Bambu Custom 40cm");
  assert.equal(parsed.report.items[0].qtyLolos, 110);
  assert.equal(parsed.report.items[0].keputusan, "Bersyarat");
});
