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

test("kamus master memuat 66 produk, daftar vendor, dan 14 kriteria standar", () => {
  assert.equal(PRODUCT_MASTER.length, 66);
  assert.ok(VENDORS_PRE.length >= 13);
  assert.ok(VENDORS_FIN.length >= 9);
  assert.equal(QC_CRITERIA.length, 14);
});

test("matchProduct mengenali SKU, nama KWaS, alias buyer, dan fuzzy score", () => {
  const bySku = matchProduct("RB103002");
  assert.equal(bySku?.product.sku, "RB103002");
  assert.equal(bySku?.confidence, "sku_exact");
  assert.equal(bySku?.requiresConfirmation, false);

  const byBuyerSku = matchProduct("3106613");
  assert.equal(byBuyerSku?.product.sku, "RB103002");
  assert.equal(byBuyerSku?.confidence, "buyer_sku_exact");

  const byAlias = matchProduct("talenanoval");
  assert.equal(byAlias?.product.sku, "RB201001");
  assert.equal(byAlias?.requiresConfirmation, false);

  // Fuzzy high confidence (>= 0.90) langsung diproses tanpa #OK
  const fuzzyHigh = matchProduct("Sutil Kayu Panjng");
  assert.equal(fuzzyHigh?.product.sku, "RB102001");
  assert.ok(fuzzyHigh.score >= 0.9);
  assert.equal(fuzzyHigh?.requiresConfirmation, false);

  // Fuzzy medium confidence (0.50 <= score < 0.90) wajib konfirmasi
  const fuzzyMedium = matchProduct("Sutil Bsr");
  assert.equal(fuzzyMedium?.product.sku, "RB102003");
  assert.equal(fuzzyMedium?.confidence, "fuzzy_match");
  assert.ok(fuzzyMedium.score >= 0.5 && fuzzyMedium.score < 0.9);
  assert.equal(fuzzyMedium?.requiresConfirmation, true);

  // Skor < 0.50 ditolak
  assert.equal(matchProduct("Barang Asing Tidak Ada Sama Sekali"), null);
});

test("matchVendorWithConfidence membedakan exact, perlu konfirmasi (#OK), dan ditolak (<0.50)", () => {
  const exact = matchVendorWithConfidence("londo", "PRE");
  assert.equal(exact?.vendor, "Londo");
  assert.equal(exact?.confidence, "exact");
  assert.equal(exact?.requiresConfirmation, false);

  const autoAny = matchVendorWithConfidence("Aris");
  assert.equal(autoAny?.vendor, "Aris");
  assert.equal(autoAny?.requiresConfirmation, false);

  // "Widodo Klten" vs "Widodo Klaten" -> 12 vs 13 chars, dist 1 => ~0.923 (auto)
  // "Widodo Kltn" vs "Widodo Klaten" -> dist 2 / 12 => ~0.833 (requires confirmation)
  const medium = matchVendorWithConfidence("Widodo Kltn", "PRE");
  assert.equal(medium?.vendor, "Widodo Klaten");
  assert.ok(medium.score >= 0.5 && medium.score < 0.9);
  assert.equal(medium?.requiresConfirmation, true);

  const rejected = matchVendorWithConfidence("Vendor Tidak Dikenal XYZ", "PRE");
  assert.equal(rejected, null);
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
