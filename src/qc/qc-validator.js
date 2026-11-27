// src/qc/qc-validator.js — Validasi domain QC Lapangan KWaS (FR-004)
import { QC_CRITERIA, MC_LIMITS, QC_DECISIONS, PRODUCT_MASTER, VENDORS_PRE, VENDORS_FIN } from "./dictionary.js";
import { matchProduct, matchVendorWithConfidence } from "./matcher.js";

const VALID_CRITERIA_IDS = new Set(QC_CRITERIA.map((c) => c.id));
const CRITERIA_BY_ID = new Map(QC_CRITERIA.map((c) => [c.id, c]));

export function formatTodayId() {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const y = now.getFullYear();
  return `${d}/${m}/${y}`;
}

export function normalizeTahap(rawTahap) {
  const clean = String(rawTahap || "").trim().toLowerCase();
  if (!clean) return "Unfinish";
  if (["finish", "finishing", "jadi", "siap kirim", "siap", "fin"].includes(clean)) {
    return "Finish";
  }
  return "Unfinish";
}

function parseOptionalNumber(val) {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : NaN;
  const cleaned = String(val).replace("%", "").replace(",", ".").trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : NaN;
}

function normalizeKeputusan(raw) {
  if (!raw) return null;
  const clean = String(raw).trim().toLowerCase();
  if (clean === "lolos" || clean === "pass" || clean === "terima") return "Lolos";
  if (clean === "bersyarat" || clean === "conditional" || clean === "rework") return "Bersyarat";
  if (clean === "tolak" || clean === "reject" || clean === "ditolak") return "Tolak";
  return null;
}

function buildDefectSummary(rusak) {
  if (!Array.isArray(rusak) || rusak.length === 0) return "";
  const total = rusak.reduce((sum, r) => sum + r.qty, 0);
  const parts = rusak.map((r) => {
    const name = r.shortLabel || r.label || r.kriteriaId;
    return `${name}: ${r.qty} pcs`;
  });
  return `Rusak: ${total} pcs (${parts.join(", ")})`;
}

/**
 * Validasi dan normalisasi payload laporan QC (dari WhatsApp maupun Web Form).
 * Mengembalikan { valid: true, report, warnings } atau { valid: false, error, details }.
 */
export function validateQcReport(input) {
  const errors = [];
  const warnings = [];

  if (!input || typeof input !== "object") {
    return { valid: false, error: "Payload laporan QC tidak valid.", details: ["Payload harus berupa objek."] };
  }

  let vendor = String(input.vendor || "").trim();
  if (!vendor) {
    errors.push("Nama vendor wajib diisi.");
  } else if (VENDORS_PRE.length > 0 || VENDORS_FIN.length > 0) {
    const vMatch = matchVendorWithConfidence(vendor);
    if (!vMatch) {
      errors.push(`Vendor "${vendor}" tidak ditemukan di database. Tambahkan di Pengaturan → Master Data terlebih dahulu.`);
    } else {
      if (vMatch.corrected && vMatch.vendor !== vendor) {
        warnings.push(`Vendor dikoreksi otomatis: "${vendor}" → "${vMatch.vendor}".`);
      }
      vendor = vMatch.vendor;
    }
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    errors.push("Minimal 1 item pemeriksaan QC wajib diisi.");
  }

  if (errors.length > 0) {
    return { valid: false, error: errors[0], details: errors };
  }

  const tanggalPemeriksaan = String(input.tanggalPemeriksaan || "").trim() || formatTodayId();
  const noDokumenPo = String(input.noDokumenPo || "").trim() || "-";
  const petugasQc = String(input.petugasQc || "").trim() || "-";
  const catatanUmum = String(input.catatanUmum || "").trim();
  const diketahuiVendor = String(input.diketahuiVendor || "").trim();
  const sumber = String(input.sumber || "WEB").trim().toUpperCase() === "WHATSAPP" ? "WHATSAPP" : "WEB";

  const validatedItems = [];

  input.items.forEach((rawItem, idx) => {
    const labelIdx = `Item #${idx + 1}`;
    const itemErrors = [];

    let namaItem = String(rawItem?.namaItem || rawItem?.nama || "").trim();
    let kodeRawBody = String(rawItem?.kodeRawBody || rawItem?.sku || "").trim().toUpperCase();
    if (!namaItem && !kodeRawBody) {
      itemErrors.push(`${labelIdx}: Kode atau nama item wajib diisi.`);
    } else if (PRODUCT_MASTER.length > 0) {
      const pMatch = matchProduct(kodeRawBody || namaItem) || matchProduct(namaItem || kodeRawBody);
      if (!pMatch) {
        itemErrors.push(`${labelIdx}: Produk "${namaItem || kodeRawBody}" tidak ditemukan di database. Tambahkan di Pengaturan → Master Data terlebih dahulu.`);
      } else {
        if (pMatch.corrected && namaItem && pMatch.product.nama !== namaItem) {
          warnings.push(`${labelIdx}: Barang dikoreksi otomatis: "${namaItem}" → "${pMatch.product.nama}".`);
        }
        kodeRawBody = pMatch.product.sku;
        namaItem = pMatch.product.nama;
      }
    }

    const tahapBarang = normalizeTahap(rawItem?.tahapBarang || rawItem?.tahap);
    const qtyDiperiksaRaw = rawItem?.qtyDiperiksa;
    const qtyDiperiksa = typeof qtyDiperiksaRaw === "number" ? qtyDiperiksaRaw : Number(qtyDiperiksaRaw);

    if (!Number.isInteger(qtyDiperiksa) || qtyDiperiksa <= 0) {
      itemErrors.push(`${labelIdx}: Jumlah Diperiksa harus berupa bilangan bulat > 0.`);
    }

    // Parse MC Mentah & MC Jadi
    let mcMentah = parseOptionalNumber(rawItem?.mcMentah);
    let mcJadi = parseOptionalNumber(rawItem?.mcJadi);
    const mcSingle = parseOptionalNumber(rawItem?.mcPercent);
    if (mcSingle !== null) {
      if (tahapBarang === "Finish" && mcJadi === null) mcJadi = mcSingle;
      if (tahapBarang === "Unfinish" && mcMentah === null) mcMentah = mcSingle;
    }

    if (Number.isNaN(mcMentah) || (mcMentah !== null && (mcMentah < 0 || mcMentah > 100))) {
      itemErrors.push(`${labelIdx}: MC Mentah harus angka valid 0–100%.`);
    }
    if (Number.isNaN(mcJadi) || (mcJadi !== null && (mcJadi < 0 || mcJadi > 100))) {
      itemErrors.push(`${labelIdx}: MC Jadi harus angka valid 0–100%.`);
    }

    const mcMentahExceeded = mcMentah !== null && !Number.isNaN(mcMentah) && mcMentah > MC_LIMITS.Unfinish;
    const mcJadiExceeded = mcJadi !== null && !Number.isNaN(mcJadi) && mcJadi > MC_LIMITS.Finish;
    const mcViolation = mcMentahExceeded || mcJadiExceeded;

    if (mcMentahExceeded) {
      warnings.push(`${labelIdx}: MC Mentah (${mcMentah}%) melebihi standar ≤ ${MC_LIMITS.Unfinish}%.`);
    }
    if (mcJadiExceeded) {
      warnings.push(`${labelIdx}: MC Jadi (${mcJadi}%) melebihi standar ≤ ${MC_LIMITS.Finish}%.`);
    }

    // Validasi rusak[]
    const rawRusak = Array.isArray(rawItem?.rusak) ? rawItem.rusak : [];
    const normalizedRusak = [];
    let totalRusak = 0;

    for (const r of rawRusak) {
      const kId = String(r?.kriteriaId || "").trim().toUpperCase();
      if (!kId || (kId !== "LAINNYA" && !VALID_CRITERIA_IDS.has(kId))) {
        itemErrors.push(`${labelIdx}: Kriteria kerusakan tidak dikenal (${r?.kriteriaId || "kosong"}).`);
        continue;
      }

      const qty = typeof r?.qty === "number" ? r.qty : Number(r?.qty);
      if (!Number.isInteger(qty) || qty <= 0) {
        itemErrors.push(`${labelIdx}: Jumlah kerusakan untuk ${kId} harus bilangan bulat > 0.`);
        continue;
      }

      const crit = CRITERIA_BY_ID.get(kId);
      const customLabel = String(r?.label || "").trim();
      const shortLabel = crit ? crit.shortLabel : (customLabel || "Lainnya");
      const label = crit ? crit.label : (customLabel || "Lainnya");

      normalizedRusak.push({
        kriteriaId: kId,
        shortLabel,
        label,
        qty
      });
      totalRusak += qty;
    }

    if (Number.isInteger(qtyDiperiksa) && qtyDiperiksa > 0 && totalRusak > qtyDiperiksa) {
      itemErrors.push(
        `${labelIdx}: Total kerusakan (${totalRusak} pcs) melebihi jumlah diperiksa (${qtyDiperiksa} pcs).`
      );
    }

    // Validasi qtyLolos (auto-compute jika tidak diisi)
    const maxLolos = Number.isInteger(qtyDiperiksa) ? Math.max(0, qtyDiperiksa - totalRusak) : 0;
    let qtyLolos;
    if (rawItem?.qtyLolos === undefined || rawItem?.qtyLolos === null || rawItem?.qtyLolos === "") {
      qtyLolos = maxLolos;
    } else {
      const explicitLolos = typeof rawItem.qtyLolos === "number" ? rawItem.qtyLolos : Number(rawItem.qtyLolos);
      if (!Number.isInteger(explicitLolos) || explicitLolos < 0 || explicitLolos > maxLolos) {
        itemErrors.push(
          `${labelIdx}: Jumlah lolos (${rawItem.qtyLolos}) harus antara 0 dan ${maxLolos} pcs (Diperiksa - Total Rusak).`
        );
      } else {
        qtyLolos = explicitLolos;
      }
    }

    // Sinkronisasi 14 kriteriaStatus
    const inputStatus = rawItem?.kriteriaStatus && typeof rawItem.kriteriaStatus === "object"
      ? rawItem.kriteriaStatus
      : {};
    const kriteriaStatus = {};
    for (const c of QC_CRITERIA) {
      const rawVal = String(inputStatus[c.id] || "OK").trim().toUpperCase();
      kriteriaStatus[c.id] = rawVal === "NOK" || rawVal === "NA" ? rawVal : "OK";
    }
    for (const d of normalizedRusak) {
      if (d.kriteriaId !== "LAINNYA" && kriteriaStatus[d.kriteriaId] !== undefined) {
        kriteriaStatus[d.kriteriaId] = "NOK";
      }
    }

    const hasExplicitNokWithoutQty = totalRusak === 0 && Object.values(kriteriaStatus).some((s) => s === "NOK");
    const rawUserNote = String(rawItem?.catatanSingkat || rawItem?.catatan || "").trim();

    if (hasExplicitNokWithoutQty && !rawUserNote) {
      itemErrors.push(`${labelIdx}: Catatan singkat wajib diisi jika terdapat kriteria NOK.`);
    }

    const hasUnspecifiedOther = normalizedRusak.some(
      (r) => r.kriteriaId === "LAINNYA" && (!r.label || r.label.toLowerCase() === "lainnya")
    );
    if (hasUnspecifiedOther && !rawUserNote) {
      itemErrors.push(`${labelIdx}: Kerusakan kategori 'Lainnya' wajib disertai keterangan jenis cacat atau Catatan.`);
    }

    if (mcViolation && !rawUserNote && !catatanUmum) {
      itemErrors.push(`${labelIdx}: Kadar Air (MC) melebihi standar; wajib isi Catatan penanganan (rework/jemur/tolak).`);
    }

    // Validasi & penentuan keputusan
    const hasAnyDefectOrNok = totalRusak > 0 || Object.values(kriteriaStatus).some((s) => s === "NOK");
    let keputusan = null;
    if (rawItem?.keputusan !== undefined && rawItem?.keputusan !== null && String(rawItem.keputusan).trim() !== "") {
      keputusan = normalizeKeputusan(rawItem.keputusan);
      if (!keputusan) {
        itemErrors.push(`${labelIdx}: Keputusan tidak valid. Gunakan ${QC_DECISIONS.join(", ")}.`);
      } else if (keputusan === "Lolos" && (mcViolation || hasAnyDefectOrNok || qtyLolos === 0)) {
        itemErrors.push(
          `${labelIdx}: Keputusan tidak boleh 'Lolos' penuh jika terdapat kerusakan, kriteria NOK, atau MC melebihi standar; gunakan 'Bersyarat' atau 'Tolak'.`
        );
      }
    } else {
      if (qtyDiperiksa > 0 && qtyLolos === 0) {
        keputusan = "Tolak";
      } else if (hasAnyDefectOrNok || mcViolation) {
        keputusan = "Bersyarat";
      } else {
        keputusan = "Lolos";
      }
    }

    // Format Catatan Singkat sesuai FR-005 AC(2)
    const defectSummary = buildDefectSummary(normalizedRusak);
    let catatanSingkat = rawUserNote;
    if (defectSummary) {
      catatanSingkat = rawUserNote && !rawUserNote.includes(defectSummary)
        ? `${defectSummary} — ${rawUserNote}`
        : defectSummary;
    }

    if (itemErrors.length > 0) {
      errors.push(...itemErrors);
      return;
    }

    validatedItems.push({
      kodeRawBody,
      namaItem: namaItem || kodeRawBody,
      tahapBarang,
      qtyDiperiksa,
      mcMentah: mcMentah === null ? null : mcMentah,
      mcJadi: mcJadi === null ? null : mcJadi,
      mcViolation,
      rusak: normalizedRusak,
      totalRusak,
      qtyLolos,
      kriteriaStatus,
      keputusan,
      catatanSingkat
    });
  });

  if (errors.length > 0) {
    return { valid: false, error: errors[0], details: errors };
  }

  const totalDiperiksa = validatedItems.reduce((s, it) => s + it.qtyDiperiksa, 0);
  const totalRusak = validatedItems.reduce((s, it) => s + it.totalRusak, 0);
  const totalLolos = validatedItems.reduce((s, it) => s + it.qtyLolos, 0);

  let keputusanUmum = "Lolos";
  if (validatedItems.every((it) => it.keputusan === "Tolak")) {
    keputusanUmum = "Tolak";
  } else if (validatedItems.some((it) => it.keputusan !== "Lolos")) {
    keputusanUmum = "Bersyarat";
  }

  const report = {
    noLaporan: String(input.noLaporan || "").trim(),
    idempotencyKey: String(input.idempotencyKey || "").trim(),
    sumber,
    vendor,
    noDokumenPo,
    tanggalPemeriksaan,
    petugasQc,
    catatanUmum,
    diketahuiVendor,
    totalItem: validatedItems.length,
    totalDiperiksa,
    totalRusak,
    totalLolos,
    keputusanUmum,
    items: validatedItems
  };

  return { valid: true, report, warnings };
}
