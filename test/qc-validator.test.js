import test from "node:test";
import assert from "node:assert/strict";
import { validateQcReport } from "../src/qc/qc-validator.js";

test("validateQcReport menghitung otomatis qtyLolos, kriteriaStatus, dan catatanSingkat", () => {
  const res = validateQcReport({
    vendor: "Londo",
    noDokumenPo: "PO-2026-112",
    tanggalPemeriksaan: "26/11/2026",
    petugasQc: "Budi",
    items: [
      {
        kodeRawBody: "RB103002",
        namaItem: "Sendok Oval",
        tahapBarang: "Unfinish",
        qtyDiperiksa: 1000,
        mcMentah: 13.5,
        rusak: [
          { kriteriaId: "BLUESTAIN", label: "Bebas Bluestain / Jamur", qty: 30 },
          { kriteriaId: "CUTTER_MARK", label: "Bebas Cutter Mark", qty: 20 }
        ],
        kriteriaStatus: { WARNA: "NA" }
      }
    ]
  });

  assert.equal(res.valid, true);
  const item = res.report.items[0];
  assert.equal(item.totalRusak, 50);
  assert.equal(item.qtyLolos, 950);
  assert.equal(item.keputusan, "Bersyarat");
  assert.equal(item.kriteriaStatus.BLUESTAIN, "NOK");
  assert.equal(item.kriteriaStatus.CUTTER_MARK, "NOK");
  assert.equal(item.kriteriaStatus.WARNA, "NA");
  assert.equal(item.kriteriaStatus.ATI, "OK");
  assert.match(item.catatanSingkat, /Rusak: 50 pcs/i);
  assert.match(item.catatanSingkat, /Bluestain/i);
});

test("validateQcReport menandai Lolos jika barang mulus 100%", () => {
  const res = validateQcReport({
    vendor: "Londo",
    items: [
      {
        kodeRawBody: "RB102003",
        namaItem: "Sutil Besar",
        tahapBarang: "Unfinish",
        qtyDiperiksa: 500,
        mcMentah: 14.0,
        rusak: []
      }
    ]
  });

  assert.equal(res.valid, true);
  assert.equal(res.report.items[0].totalRusak, 0);
  assert.equal(res.report.items[0].qtyLolos, 500);
  assert.equal(res.report.items[0].keputusan, "Lolos");
});

test("validateQcReport menolak hitungan tidak valid atau total rusak melebihi diperiksa", () => {
  const zeroQty = validateQcReport({
    vendor: "Londo",
    items: [{ namaItem: "Sendok Oval", qtyDiperiksa: 0 }]
  });
  assert.equal(zeroQty.valid, false);

  const overDefect = validateQcReport({
    vendor: "Londo",
    items: [
      {
        namaItem: "Sendok Oval",
        qtyDiperiksa: 100,
        rusak: [{ kriteriaId: "BLUESTAIN", qty: 120 }]
      }
    ]
  });
  assert.equal(overDefect.valid, false);

  const badLolos = validateQcReport({
    vendor: "Londo",
    items: [
      {
        namaItem: "Sendok Oval",
        qtyDiperiksa: 100,
        qtyLolos: 90,
        rusak: [{ kriteriaId: "BLUESTAIN", qty: 20 }]
      }
    ]
  });
  assert.equal(badLolos.valid, false);
});

test("validateQcReport menegakkan ambang MC (Mentah <= 15%, Jadi <= 17%) dan larangan Lolos penuh", () => {
  const mcMentahFailLolos = validateQcReport({
    vendor: "Londo",
    items: [
      {
        namaItem: "Sendok Oval",
        tahapBarang: "Unfinish",
        qtyDiperiksa: 100,
        mcMentah: 16.2,
        keputusan: "Lolos",
        catatanSingkat: "Tetap lolos"
      }
    ]
  });
  assert.equal(mcMentahFailLolos.valid, false);

  const mcJadiFailLolos = validateQcReport({
    vendor: "Aris",
    items: [
      {
        namaItem: "Sendok Oval",
        tahapBarang: "Finish",
        qtyDiperiksa: 100,
        mcJadi: 18.0,
        keputusan: "Lolos",
        catatanSingkat: "Tetap lolos"
      }
    ]
  });
  assert.equal(mcJadiFailLolos.valid, false);

  const mcMentahNoNote = validateQcReport({
    vendor: "Londo",
    items: [
      {
        namaItem: "Sendok Oval",
        tahapBarang: "Unfinish",
        qtyDiperiksa: 100,
        mcMentah: 16.5
      }
    ]
  });
  assert.equal(mcMentahNoNote.valid, false);

  const mcBersyaratWithNote = validateQcReport({
    vendor: "Londo",
    items: [
      {
        namaItem: "Sendok Oval",
        tahapBarang: "Unfinish",
        qtyDiperiksa: 100,
        mcMentah: 16.5,
        keputusan: "Bersyarat",
        catatanSingkat: "Jemur ulang 2 hari"
      }
    ]
  });
  assert.equal(mcBersyaratWithNote.valid, true);
  assert.equal(mcBersyaratWithNote.report.items[0].mcViolation, true);
});

test("validateQcReport mewajibkan penjelasan bila ada NOK tanpa qty rusak atau kategori Lainnya", () => {
  const nokNoNote = validateQcReport({
    vendor: "Londo",
    items: [
      {
        namaItem: "Sendok Oval",
        qtyDiperiksa: 100,
        kriteriaStatus: { ATI: "NOK" }
      }
    ]
  });
  assert.equal(nokNoNote.valid, false);

  const lainnyaNoDetail = validateQcReport({
    vendor: "Londo",
    items: [
      {
        namaItem: "Sendok Oval",
        qtyDiperiksa: 100,
        rusak: [{ kriteriaId: "LAINNYA", label: "Lainnya", qty: 5 }]
      }
    ]
  });
  assert.equal(lainnyaNoDetail.valid, false);

  const lainnyaWithDetail = validateQcReport({
    vendor: "Londo",
    items: [
      {
        namaItem: "Sendok Oval",
        qtyDiperiksa: 100,
        rusak: [{ kriteriaId: "LAINNYA", label: "Retak ujung", qty: 5 }]
      }
    ]
  });
  assert.equal(lainnyaWithDetail.valid, true);
  assert.equal(lainnyaWithDetail.report.items[0].qtyLolos, 95);
});
