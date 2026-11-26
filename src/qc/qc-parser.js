// src/qc/qc-parser.js — Parser perintah WA dan template FORM QC (Gaya 4)
import { matchProduct, matchVendorWithConfidence, matchCriterion } from "./matcher.js";
import { validateQcReport } from "./qc-validator.js";

const HEADER_KEY_MAP = new Map([
  ["vendor", "vendor"],
  ["namavendor", "vendor"],
  ["supplier", "vendor"],
  ["po", "noDokumenPo"],
  ["nopo", "noDokumenPo"],
  ["nodokumen", "noDokumenPo"],
  ["nodokumenpo", "noDokumenPo"],
  ["dokumen", "noDokumenPo"],
  ["tanggal", "tanggalPemeriksaan"],
  ["tgl", "tanggalPemeriksaan"],
  ["tanggalpemeriksaan", "tanggalPemeriksaan"],
  ["petugas", "petugasQc"],
  ["petugasqc", "petugasQc"],
  ["pic", "petugasQc"],
  ["catatanumum", "catatanUmum"],
  ["diketahui", "diketahuiVendor"],
  ["diketahuivendor", "diketahuiVendor"]
]);

const ITEM_KEY_MAP = new Map([
  ["barang", "barang"],
  ["produk", "barang"],
  ["namabarang", "barang"],
  ["namaitem", "barang"],
  ["item", "barang"],
  ["sku", "barang"],
  ["koderawbody", "barang"],
  ["tahap", "tahap"],
  ["tahapbarang", "tahap"],
  ["periksa", "periksa"],
  ["diperiksa", "periksa"],
  ["jumlahdiperiksa", "periksa"],
  ["qty", "periksa"],
  ["mc", "mc"],
  ["mc%", "mc"],
  ["mcpercent", "mc"],
  ["kadarair", "mc"],
  ["mcmentah", "mcMentah"],
  ["mcjadi", "mcJadi"],
  ["lolos", "lolos"],
  ["diterima", "lolos"],
  ["jumlahlolos", "lolos"],
  ["jumlahditerima", "lolos"],
  ["keputusan", "keputusan"],
  ["status", "keputusan"],
  ["catatan", "catatan"],
  ["catatansingkat", "catatan"],
  ["keterangan", "catatan"]
]);

function normalizeKey(raw) {
  return String(raw || "").toLowerCase().replace(/[^a-z0-9%]/g, "");
}

function parseIntegerQty(raw) {
  const cleaned = String(raw || "")
    .replace(/\b(pcs|buah|unit)\b/gi, "")
    .trim();
  if (!cleaned) return null;
  if (/^\d{1,3}([.,]\d{3})+$/.test(cleaned)) {
    return parseInt(cleaned.replace(/[.,]/g, ""), 10);
  }
  if (/^\d+$/.test(cleaned)) {
    return parseInt(cleaned, 10);
  }
  return NaN;
}

function parseLainnyaValue(rawVal) {
  const val = String(rawVal || "").trim();
  if (!val || val === "-" || /^n\/?a$/i.test(val) || /^t\/?b$/i.test(val)) {
    return null;
  }

  // Pola 1: hanya angka ("5")
  const pureNum = parseIntegerQty(val);
  if (pureNum !== null && !Number.isNaN(pureNum)) {
    return pureNum === 0 ? null : { qty: pureNum, label: "Lainnya" };
  }

  // Pola 2: angka di depan ("5 (Retak ujung)", "5 - Retak ujung", "5 pcs Retak ujung")
  let m = val.match(/^(\d+)\s*(?:pcs|buah|unit)?\s*[-–:(]?\s*(.+?)\)?$/i);
  if (m) {
    const qty = parseInt(m[1], 10);
    const label = m[2].trim();
    return { qty, label: label || "Lainnya" };
  }

  // Pola 3: teks diikuti angka ("Retak ujung 5", "Retak ujung: 5 pcs")
  m = val.match(/^(.+?)\s*[:\-–(]?\s*(\d+)\s*(?:pcs|buah|unit)?\)?$/i);
  if (m) {
    const label = m[1].trim();
    const qty = parseInt(m[2], 10);
    return { qty, label: label || "Lainnya" };
  }

  return { error: `Baris 'Lainnya' ("${val}") harus menyertakan jumlah pcs (contoh: "Retak ujung 5" atau "5 (Retak ujung)").` };
}

function isNaToken(val) {
  const clean = String(val || "").trim().toLowerCase();
  return clean === "-" || clean === "–" || clean === "na" || clean === "n/a" || clean === "t/b" || clean === "tidak berlaku";
}

function isOkToken(val) {
  const clean = String(val || "").trim().toLowerCase();
  return clean === "" || clean === "0" || clean === "ok" || clean === "aman" || clean === "✓" || clean === "v";
}

export function isQcRelevantMessage(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("#")) return true;
  if (/^qc$/i.test(trimmed)) return true;
  if (/^form\s+qc\b/i.test(trimmed)) return true;
  return false;
}

/**
 * Mengurai pesan WhatsApp (perintah bantu atau FORM QC Gaya 4).
 */
export function parseQcMessage(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();

  // 1. Trigger template kosong: "qc" atau "#QC"
  if (/^(?:#?QC)$/i.test(trimmed)) {
    return { command: "QC_TEMPLATE" };
  }

  // 2. Perintah bantu (#HELP, #KRITERIA, #PRODUK, #VENDOR, #STATUS)
  if (upper.startsWith("#HELP")) return { command: "HELP" };
  if (upper.startsWith("#KRITERIA")) return { command: "KRITERIA" };
  if (upper.startsWith("#PRODUK")) return { command: "LIST_PRODUCTS" };
  if (upper.startsWith("#STATUS")) return { command: "STATUS" };
  if (upper.startsWith("#VENDOR")) {
    return { command: "VENDOR", sub: trimmed.slice(7).trim() };
  }

  // 3. Cek pembuka FORM QC atau #QC dengan isi
  const lines = trimmed.split(/\r?\n/);
  const firstLineUpper = lines[0].trim().toUpperCase();
  let startIdx = 0;

  if (/^(?:FORM\s+QC|#QC)\b/.test(firstLineUpper)) {
    // Jika baris pertama hanya "FORM QC" atau "#QC"
    const remainder = lines[0].trim().replace(/^(?:FORM\s+QC|#QC)\s*:?\s*/i, "");
    if (!remainder) {
      startIdx = 1;
    } else {
      lines[0] = remainder;
    }
  } else {
    return null;
  }

  const bodyLines = lines.slice(startIdx);
  const blocks = [[]];
  for (const line of bodyLines) {
    if (/^\s*-{3,}\s*$/.test(line)) {
      blocks.push([]);
    } else {
      blocks[blocks.length - 1].push(line);
    }
  }

  const headerData = {};
  const parsedItems = [];
  const corrections = [];
  let hasCorrection = false;

  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const blockLines = blocks[bIdx];
    const itemRaw = {
      rusak: [],
      kriteriaStatus: {}
    };
    let hasItemFields = false;

    for (const rawLine of blockLines) {
      const line = rawLine.trim();
      if (!line) continue;
      // Lewati baris petunjuk "[Isi angka rusak...]"
      if (line.startsWith("[") && line.endsWith("]")) continue;

      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) {
        return {
          error: `Format baris tidak dikenali: "${line}". Gunakan pola "Field : Nilai" (contoh: "Bluestain : 30"). Ketik *qc* untuk template baru.`
        };
      }

      const rawKey = line.slice(0, colonIdx).trim();
      const rawVal = line.slice(colonIdx + 1).trim();
      const normKey = normalizeKey(rawKey);

      if (HEADER_KEY_MAP.has(normKey)) {
        const targetField = HEADER_KEY_MAP.get(normKey);
        if (rawVal) headerData[targetField] = rawVal;
        continue;
      }

      if (ITEM_KEY_MAP.has(normKey)) {
        const targetField = ITEM_KEY_MAP.get(normKey);
        hasItemFields = true;

        if (targetField === "periksa" || targetField === "lolos") {
          if (!rawVal) {
            if (targetField === "periksa") {
              return { error: `Baris "${rawKey}" pada Item #${bIdx + 1} wajib diisi angka bulat > 0.` };
            }
            continue;
          }
          const num = parseIntegerQty(rawVal);
          if (Number.isNaN(num) || num === null) {
            return { error: `Nilai "${rawKey}: ${rawVal}" pada Item #${bIdx + 1} harus berupa bilangan bulat.` };
          }
          if (targetField === "periksa") itemRaw.qtyDiperiksa = num;
          else itemRaw.qtyLolos = num;
        } else if (targetField === "mc") {
          itemRaw.mcPercent = rawVal;
        } else if (targetField === "mcMentah") {
          itemRaw.mcMentah = rawVal;
        } else if (targetField === "mcJadi") {
          itemRaw.mcJadi = rawVal;
        } else if (targetField === "barang") {
          itemRaw.barangInput = rawVal;
        } else if (targetField === "tahap") {
          itemRaw.tahapBarang = rawVal;
        } else if (targetField === "keputusan") {
          itemRaw.keputusan = rawVal;
        } else if (targetField === "catatan") {
          itemRaw.catatanSingkat = rawVal;
        }
        continue;
      }

      // Cek Lainnya
      if (normKey === "lainnya" || normKey === "other") {
        hasItemFields = true;
        const parsedOther = parseLainnyaValue(rawVal);
        if (parsedOther?.error) return { error: parsedOther.error };
        if (parsedOther) {
          itemRaw.rusak.push({
            kriteriaId: "LAINNYA",
            label: parsedOther.label,
            qty: parsedOther.qty
          });
        }
        continue;
      }

      // Cek 14 kriteria standar
      const matchedCrit = matchCriterion(rawKey);
      if (!matchedCrit.isOther) {
        hasItemFields = true;
        if (isNaToken(rawVal)) {
          itemRaw.kriteriaStatus[matchedCrit.id] = "NA";
        } else if (isOkToken(rawVal)) {
          itemRaw.kriteriaStatus[matchedCrit.id] = "OK";
        } else {
          const qty = parseIntegerQty(rawVal);
          if (Number.isNaN(qty) || qty === null || qty < 0) {
            return {
              error: `Nilai "${rawKey}: ${rawVal}" tidak valid. Isi angka rusak (> 0), kosongkan bila aman, atau isi "-" bila tidak berlaku.`
            };
          }
          if (qty === 0) {
            itemRaw.kriteriaStatus[matchedCrit.id] = "OK";
          } else {
            itemRaw.kriteriaStatus[matchedCrit.id] = "NOK";
            itemRaw.rusak.push({
              kriteriaId: matchedCrit.id,
              shortLabel: matchedCrit.shortLabel,
              label: matchedCrit.label,
              qty
            });
          }
        }
        continue;
      }

      return {
        error: `Field "${rawKey}" tidak dikenali di FORM QC. Ketik *qc* untuk melihat template standar atau *#KRITERIA* untuk daftar kriteria.`
      };
    }

    if (!hasItemFields && !itemRaw.barangInput) {
      if (blocks.length > 1) {
        return { error: `Blok Item #${bIdx + 1} setelah pemisah '---' kosong.` };
      }
      continue;
    }

    if (!itemRaw.barangInput) {
      return { error: `Field "Barang" pada Item #${bIdx + 1} wajib diisi. Ketik *#PRODUK* untuk daftar SKU.` };
    }
    if (itemRaw.qtyDiperiksa === undefined) {
      return { error: `Field "Periksa" (jumlah diperiksa) pada Item #${bIdx + 1} wajib diisi.` };
    }

    // Match produk
    const productMatch = matchProduct(itemRaw.barangInput);
    if (!productMatch) {
      return {
        error: `Produk "${itemRaw.barangInput}" pada Item #${bIdx + 1} tidak ditemukan (skor < 0.50). Ketik *#PRODUK* untuk daftar 66 SKU resmi.`
      };
    }

    if (productMatch.corrected) hasCorrection = true;
    if (productMatch.requiresConfirmation) {
      corrections.push({
        field: blocks.length > 1 ? `Barang (Item #${bIdx + 1})` : "Barang",
        original: itemRaw.barangInput,
        suggested: `${productMatch.product.nama} (${productMatch.product.sku})`,
        score: productMatch.score
      });
    }

    itemRaw.kodeRawBody = productMatch.product.sku;
    itemRaw.namaItem = productMatch.product.nama;
    parsedItems.push(itemRaw);
  }

  if (!headerData.vendor) {
    return { error: `Field "Vendor" wajib diisi. Ketik *#VENDOR* untuk melihat daftar vendor.` };
  }
  if (parsedItems.length === 0) {
    return { error: `Data barang ("Barang" dan "Periksa") belum diisi. Ketik *qc* untuk menyalin template.` };
  }

  // Match vendor (auto PRE/FIN, atau utamakan PRE/FIN berdasarkan item pertama bila konsisten)
  const vendorMatch = matchVendorWithConfidence(headerData.vendor);
  if (!vendorMatch) {
    return {
      error: `Vendor "${headerData.vendor}" tidak ditemukan (skor < 0.50). Ketik *#VENDOR* untuk daftar vendor rekanan.`
    };
  }
  if (vendorMatch.corrected) hasCorrection = true;
  if (vendorMatch.requiresConfirmation) {
    corrections.push({
      field: "Vendor",
      original: headerData.vendor,
      suggested: vendorMatch.vendor,
      score: vendorMatch.score
    });
  }

  const validation = validateQcReport({
    sumber: "WHATSAPP",
    vendor: vendorMatch.vendor,
    noDokumenPo: headerData.noDokumenPo,
    tanggalPemeriksaan: headerData.tanggalPemeriksaan,
    petugasQc: headerData.petugasQc,
    catatanUmum: headerData.catatanUmum,
    diketahuiVendor: headerData.diketahuiVendor,
    items: parsedItems
  });

  if (!validation.valid) {
    return { error: validation.error, details: validation.details };
  }

  return {
    type: "QC_REPORT",
    report: validation.report,
    warnings: validation.warnings,
    corrected: hasCorrection,
    requires_confirmation: corrections.length > 0,
    corrections
  };
}
