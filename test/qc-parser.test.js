import test from "node:test";
import assert from "node:assert/strict";
import { parseQcMessage } from "../src/qc/qc-parser.js";
import { PRODUCT_MASTER, VENDORS_PRE, addProduct, addVendor } from "../src/qc/dictionary.js";
import { getQcTemplateText, getQcItemTemplateText, getHelpText, getCriteriaText } from "../src/qc/help-text.js";

test("perintah qc / #QC kosong, qc2, dan perintah bantu mengembalikan command yang benar", () => {
  assert.deepEqual(parseQcMessage("qc"), { command: "QC_TEMPLATE" });
  assert.deepEqual(parseQcMessage("#QC"), { command: "QC_TEMPLATE" });
  assert.deepEqual(parseQcMessage("  #qc  "), { command: "QC_TEMPLATE" });
  assert.deepEqual(parseQcMessage("qc2"), { command: "QC_ITEM_TEMPLATE", itemNumber: 2 });
  assert.deepEqual(parseQcMessage("qc 3"), { command: "QC_ITEM_TEMPLATE", itemNumber: 3 });
  assert.deepEqual(parseQcMessage("#HELP"), { command: "HELP" });
  assert.deepEqual(parseQcMessage("#KRITERIA"), { command: "KRITERIA" });
  assert.deepEqual(parseQcMessage("#PRODUK"), { command: "LIST_PRODUCTS" });
  assert.deepEqual(parseQcMessage("#STATUS"), { command: "STATUS" });
  assert.deepEqual(parseQcMessage("#VENDOR PRE"), { command: "VENDOR", sub: "PRE" });

  const tpl = getQcTemplateText();
  assert.match(tpl, /^FORM QC/m);
  assert.match(tpl, /\[ITEM 1\]/);
  assert.doesNotMatch(tpl, /\[ITEM 2\]/);
  assert.doesNotMatch(tpl, /^---$/m);
  assert.equal(tpl.match(/^Keputusan:/gm)?.length, 1);
  assert.match(tpl, /Crack\s*:/);
  assert.match(tpl, /Bluestain\s*:/);
  assert.match(tpl, /Lainnya\s*:/);
  assert.match(getQcItemTemplateText(2), /^\[ITEM 2\]/m);
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
  assert.equal(parsed.report.items[1].kodeRawBody, "RB102003");
  assert.equal(parsed.report.items[1].namaItem, "Sutil Besar");
  assert.equal(parsed.report.items[1].qtyLolos, 500);
  assert.equal(parsed.report.items[1].keputusan, "Lolos");
});

test("parseQcMessage mendeteksi typo sedang (#OK) dan menolak field wajib kosong/rusak non-angka", () => {
  const typoMedium = parseQcMessage(`FORM QC
Vendor   : Widodo Kltn
Barang   : Sutil Bsr
Periksa  : 200`);
  assert.equal(typoMedium.error, undefined);
  assert.equal(typoMedium.requires_confirmation, true);
  assert.equal(typoMedium.report.vendor, "Widodo Klaten");
  assert.equal(typoMedium.report.items[0].kodeRawBody, "RB102003");
  assert.equal(typoMedium.report.items[0].namaItem, "Sutil Besar");

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

test("parseQcMessage template 1 item dan lanjutan [ITEM 2] berurutan", () => {
  const tpl = getQcTemplateText();
  const filled1 = tpl
    .replace("Vendor   : ", "Vendor   : Londo")
    .replace("PO       : ", "PO       : PO-4-01")
    .replace("[ITEM 1]\nBarang   : \nTahap    : Unfinish\nPeriksa  : \nMC %     : ", "[ITEM 1]\nBarang   : Sendok Oval\nTahap    : Unfinish\nPeriksa  : 100\nMC %     : 13.5")
    .replace("\nKeputusan: ", "\nKeputusan: Tolak");

  const res1 = parseQcMessage(filled1);
  assert.equal(res1.error, undefined);
  assert.equal(res1.type, "QC_REPORT");
  assert.equal(res1.report.items.length, 1);
  assert.equal(res1.report.items[0].kodeRawBody, "RB103002");
  assert.equal(res1.report.items[0].namaItem, "Sendok Oval");
  assert.equal(res1.report.items[0].qtyLolos, 100);
  assert.equal(res1.report.items[0].keputusan, "Tolak");

  const tpl2 = getQcItemTemplateText(2)
    .replace("Barang   : \nTahap    : Unfinish\nPeriksa  : \nMC %     : ", "Barang   : Talenan Jepang\nTahap    : Unfinish\nPeriksa  : 50\nMC %     : 12.0")
    .replace("Crack       : ", "Crack       : 5")
    .replace("\nKeputusan: ", "\nKeputusan: Bersyarat");

  // Tanpa sesi aktif sebelumnya harus ditolak dengan panduan
  const noSession = parseQcMessage(tpl2);
  assert.equal(noSession.needsActiveSession, true);
  assert.ok(noSession.error);

  // Dengan sesi aktif dari FORM QC sebelumnya -> masuk QC_ITEM_APPEND
  const res2 = parseQcMessage(tpl2, {
    session: { vendor: "Londo", noDokumenPo: "PO-4-01", petugasQc: "Budi" }
  });
  assert.equal(res2.error, undefined);
  assert.equal(res2.type, "QC_ITEM_APPEND");
  assert.equal(res2.itemNumber, 2);
  assert.equal(res2.report.vendor, "Londo");
  assert.equal(res2.item.kodeRawBody, "RB201004");
  assert.equal(res2.item.namaItem, "Talenan Jepang");
  assert.equal(res2.item.qtyLolos, 45);
  assert.equal(res2.item.rusak[0].kriteriaId, "CRACK");
  assert.equal(res2.item.keputusan, "Bersyarat");
});

test("parseQcMessage menolak produk dan vendor tidak terdaftar di database", () => {
  const parsed = parseQcMessage(`FORM QC
Vendor   : CV Sumber Kayu Mandiri
PO       : PO-CUSTOM-01
Barang   : Talang Bambu Custom 40cm
Tahap    : Unfinish
Periksa  : 120
MC %     : 12.5
Bluestain: 10
Keputusan: Bersyarat`);

  assert.match(parsed.error, /tidak ditemukan di database/i);
});

test("parseQcMessage memvalidasi terhadap database & auto-correct typo saat master terisi", () => {
  // Typo ringan (score >= 0.90) -> auto-correct langsung tanpa #OK
  const minorTypo = parseQcMessage(`FORM QC
Vendor   : Widodo Klatn
PO       : PO-DB-01
Barang   : Sendok Oval Duc
Tahap    : Unfinish
Periksa  : 100
MC %     : 12
Keputusan: Lolos`);

  assert.equal(minorTypo.error, undefined);
  assert.equal(minorTypo.requires_confirmation, false);
  assert.equal(minorTypo.corrected, true);
  assert.equal(minorTypo.report.vendor, "Widodo Klaten");
  assert.equal(minorTypo.report.items[0].kodeRawBody, "RB103017");
  assert.equal(minorTypo.report.items[0].namaItem, "Sendok Oval Duco");

  // Typo sedang (0.50 - 0.89) -> requires_confirmation (#OK)
  const moderateTypo = parseQcMessage(`FORM QC
Vendor   : Widodo Kltn
PO       : PO-DB-02
Barang   : Sendok Oval
Tahap    : Unfinish
Periksa  : 50
MC %     : 12
Keputusan: Lolos`);

  assert.equal(moderateTypo.error, undefined);
  assert.equal(moderateTypo.requires_confirmation, true);
  assert.equal(moderateTypo.report.vendor, "Widodo Klaten");

  // Produk tidak ada di database -> ditolak
  const unknownProd = parseQcMessage(`FORM QC
Vendor   : Londo
PO       : PO-DB-03
Barang   : Kursi Plastik Xyz
Tahap    : Unfinish
Periksa  : 50
MC %     : 12
Keputusan: Lolos`);

  assert.match(unknownProd.error, /tidak ditemukan di database/i);
});
