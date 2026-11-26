import test from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCT_MASTER,
  VENDORS_PRE,
  VENDORS_FIN,
  QC_CRITERIA,
  syncDictionaryFromWebhook
} from "../src/qc/dictionary.js";
import {
  matchProduct,
  matchVendorWithConfidence,
  matchCriterion
} from "../src/qc/matcher.js";

test("kamus lokal bebas database produk/vendor dan memuat 14 kriteria standar", () => {
  assert.equal(PRODUCT_MASTER.length, 0);
  assert.equal(VENDORS_PRE.length, 0);
  assert.equal(VENDORS_FIN.length, 0);
  assert.equal(QC_CRITERIA.length, 14);
});

test("matchProduct mengembalikan null saat database kosong dan mencocokkan bila ada data dinamis", () => {
  assert.equal(matchProduct("Barang Custom Apa Saja"), null);
  PRODUCT_MASTER.push({ sku: "RB103002", nama: "Sendok Oval", kategori: "Kitchenware", alias: ["sendok oval"] });
  try {
    const bySku = matchProduct("RB103002");
    assert.equal(bySku?.product.sku, "RB103002");
    assert.equal(bySku?.confidence, "sku_exact");

    const fuzzyHigh = matchProduct("Sendok Ovl");
    assert.equal(fuzzyHigh?.product.sku, "RB103002");
    assert.ok(fuzzyHigh.score >= 0.9);
  } finally {
    PRODUCT_MASTER.pop();
  }
});

test("matchVendorWithConfidence mengembalikan null saat database kosong dan membedakan skor bila ada data dinamis", () => {
  assert.equal(matchVendorWithConfidence("Vendor Custom Bebas", "PRE"), null);
  VENDORS_PRE.push("Londo", "Widodo Klaten");
  try {
    const exact = matchVendorWithConfidence("londo", "PRE");
    assert.equal(exact?.vendor, "Londo");
    assert.equal(exact?.confidence, "exact");
    assert.equal(exact?.requiresConfirmation, false);

    const medium = matchVendorWithConfidence("Widodo Kltn", "PRE");
    assert.equal(medium?.vendor, "Widodo Klaten");
    assert.ok(medium.score >= 0.5 && medium.score < 0.9);
    assert.equal(medium?.requiresConfirmation, true);
  } finally {
    VENDORS_PRE.splice(0, VENDORS_PRE.length);
  }
});

test("matchCriterion mencocokkan 14 kriteria dan fallback ke Lainnya jika < 0.50", () => {
  const blue = matchCriterion("Bluestain");
  assert.equal(blue.id, "BLUESTAIN");
  assert.equal(blue.isOther, false);

  const gerinda = matchCriterion("Gerinda");
  assert.equal(gerinda.id, "BEKAS_GERINDA");

  const typo = matchCriterion("Cuter Mark");
  assert.equal(typo.id, "CUTTER_MARK");
  assert.equal(typo.corrected, true);

  const other = matchCriterion("Pecah bagian gagang belakang");
  assert.equal(other.id, "LAINNYA");
  assert.equal(other.isOther, true);
  assert.equal(other.original, "Pecah bagian gagang belakang");
});

test("syncDictionaryFromWebhook memakai fallback lokal jika URL kosong & sinkronisasi via fetcher mock", async () => {
  assert.equal(await syncDictionaryFromWebhook(""), false);

  const originalProdCount = PRODUCT_MASTER.length;
  const originalPreCount = VENDORS_PRE.length;
  const originalFinCount = VENDORS_FIN.length;

  const ok = await syncDictionaryFromWebhook("https://example.test/gas", async () => ({
    data: {
      status: "success",
      data: {
        products: [
          { kodeRawBody: "RB999001", namaProduk: "Produk Uji Baru", kategori: "Kitchenware" }
        ],
        vendors: [
          { kodeVendor: "VPRE99", namaVendor: "Vendor Uji Pre", tipeVendor: "Pre-Finishing" },
          { kodeVendor: "VFIN99", namaVendor: "Vendor Uji Fin", tipeVendor: "Finishing" },
          { kodeVendor: "HEADER", namaVendor: "Nama Vendor", tipeVendor: "Header" }
        ]
      }
    }
  }));

  assert.equal(ok, true);
  assert.equal(PRODUCT_MASTER.length, originalProdCount + 1);
  assert.equal(VENDORS_PRE.length, originalPreCount + 1);
  assert.equal(VENDORS_FIN.length, originalFinCount + 1);

  // Bersihkan mutasi uji dari array global agar test lain deterministik
  PRODUCT_MASTER.pop();
  VENDORS_PRE.pop();
  VENDORS_FIN.pop();
});
