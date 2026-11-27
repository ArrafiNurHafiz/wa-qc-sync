// src/qc/qc-parser.js — Parser perintah WA dan template FORM QC (Gaya 4)
import { PRODUCT_MASTER, VENDORS_PRE, VENDORS_FIN } from "./dictionary.js";
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
  if (/^qc(?:\s*\d+)?$/i.test(trimmed)) return true;
  if (/^form\s+qc\b/i.test(trimmed)) return true;
  if (/^\[ITEM\s*\d+\]/i.test(trimmed)) return true;
  return false;
}

/**
 * Mengurai pesan WhatsApp (perintah bantu, FORM QC baru, atau lanjutan [ITEM 2]+).
 */
export function parseQcMessage(text, options = {}) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();

  // 1. Trigger template kosong: "qc" / "#QC" (Item 1) atau "qc2" / "qc 2" (Item lanjutan)
  if (/^(?:#?QC)$/i.test(trimmed)) {
    return { command: "QC_TEMPLATE" };
  }
  const itemTplMatch = trimmed.match(/^#?QC\s*(\d+)$/i);
  if (itemTplMatch) {
    return { command: "QC_ITEM_TEMPLATE", itemNumber: Math.max(2, parseInt(itemTplMatch[1], 10) || 2) };
  }

  // 2. Perintah bantu (#HELP, #KRITERIA, #PRODUK, #VENDOR, #STATUS)
  if (upper.startsWith("#HELP")) return { command: "HELP" };
  if (upper.startsWith("#KRITERIA")) return { command: "KRITERIA" };
  if (upper.startsWith("#PRODUK")) return { command: "LIST_PRODUCTS" };
  if (upper.startsWith("#STATUS")) return { command: "STATUS" };
  if (upper.startsWith("#VENDOR")) {
    return { command: "VENDOR", sub: trimmed.slice(7).trim() };
  }

  // 3. Cek pembuka FORM QC / #QC dengan isi ATAU lanjutan [ITEM 2]+
  const lines = trimmed.split(/\r?\n/);
  const firstLineTrimmed = lines[0].trim();
  const firstLineUpper = firstLineTrimmed.toUpperCase();
  const continuationMatch = firstLineTrimmed.match(/^\[ITEM\s*(\d+)\]\s*$/i);
  const isContinuation = Boolean(continuationMatch);
  const continuationItemNumber = continuationMatch ? parseInt(continuationMatch[1], 10) : null;
  let startIdx = 0;

  if (isContinuation) {
    if (!options.session || !options.session.vendor) {
      return {
        error: "Belum ada laporan *FORM QC* aktif sebelumnya untuk dilanjutkan. Ketik *qc* atau kirim *FORM QC* baru terlebih dahulu.",
        needsActiveSession: true
      };
    }
    startIdx = 1;
  } else if (/^(?:FORM\s+QC|#QC)\b/.test(firstLineUpper)) {
    // Jika baris pertama hanya "FORM QC" atau "#QC"
    const remainder = firstLineTrimmed.replace(/^(?:FORM\s+QC|#QC)\s*:?\s*/i, "");
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

  const headerData = isContinuation
    ? {
        vendor: options.session.vendor,
        noDokumenPo: options.session.noDokumenPo,
        tanggalPemeriksaan: options.session.tanggalPemeriksaan,
        petugasQc: options.session.petugasQc
      }
    : {};
  const parsedItems = [];
  const corrections = [];
  let hasCorrection = false;
  let requiresConfirmation = false;

  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const blockLines = blocks[bIdx];
    const itemRaw = {
      rusak: [],
      kriteriaStatus: {}
    };
    let hasFilledContent = false;

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
        if (!rawVal) continue;
        if (targetField !== "tahap") {
          hasFilledContent = true;
        }

        if (targetField === "periksa" || targetField === "lolos") {
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
        const parsedOther = parseLainnyaValue(rawVal);
        if (parsedOther?.error) return { error: parsedOther.error };
        if (parsedOther) {
          hasFilledContent = true;
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
        if (rawVal) hasFilledContent = true;
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

    if (!hasFilledContent && !itemRaw.barangInput) {
      continue;
    }

    if (!itemRaw.barangInput) {
      return { error: `Field "Barang" pada Item #${bIdx + 1} wajib diisi. Ketik *#PRODUK* untuk daftar SKU.` };
    }
    if (itemRaw.qtyDiperiksa === undefined) {
      return { error: `Field "Periksa" (jumlah diperiksa) pada Item #${bIdx + 1} wajib diisi.` };
    }

    const productMatch = matchProduct(itemRaw.barangInput);
    if (PRODUCT_MASTER.length > 0) {
      if (!productMatch) {
        return {
          error: `Produk "${itemRaw.barangInput.trim()}" tidak ditemukan di database. Tambahkan lewat Web (Pengaturan → Master Data) atau ketik *#PRODUK*.`
        };
      }
      itemRaw.kodeRawBody = productMatch.product.sku;
      itemRaw.namaItem = productMatch.product.nama;
      if (productMatch.corrected) {
        hasCorrection = true;
        corrections.push({
          field: `Barang (Item #${bIdx + 1})`,
          original: itemRaw.barangInput.trim(),
          suggested: `${productMatch.product.nama} (${productMatch.product.sku})`,
          score: productMatch.score
        });
        if (productMatch.requiresConfirmation) {
          requiresConfirmation = true;
        }
      }
    } else if (productMatch && productMatch.score === 1) {
      itemRaw.kodeRawBody = productMatch.product.sku;
      itemRaw.namaItem = productMatch.product.nama;
    } else {
      itemRaw.kodeRawBody = "";
      itemRaw.namaItem = itemRaw.barangInput.trim();
    }
    parsedItems.push(itemRaw);
  }

  if (!headerData.vendor) {
    return { error: `Field "Vendor" wajib diisi.` };
  }
  if (parsedItems.length === 0) {
    return { error: `Data barang ("Barang" dan "Periksa") belum diisi. Ketik *qc* untuk menyalin template.` };
  }

  const hasVendorDb = VENDORS_PRE.length > 0 || VENDORS_FIN.length > 0;
  const vendorMatch = matchVendorWithConfidence(headerData.vendor);
  let resolvedVendor;
  if (hasVendorDb) {
    if (!vendorMatch) {
      return {
        error: `Vendor "${headerData.vendor.trim()}" tidak ditemukan di database. Tambahkan lewat Web (Pengaturan → Master Data) atau ketik *#VENDOR*.`
      };
    }
    resolvedVendor = vendorMatch.vendor;
    if (vendorMatch.corrected) {
      hasCorrection = true;
      corrections.push({
        field: "Vendor",
        original: headerData.vendor.trim(),
        suggested: vendorMatch.vendor,
        score: vendorMatch.score
      });
      if (vendorMatch.requiresConfirmation) {
        requiresConfirmation = true;
      }
    }
  } else {
    resolvedVendor = vendorMatch && vendorMatch.score === 1
      ? vendorMatch.vendor
      : headerData.vendor.trim();
  }

  const validation = validateQcReport({
    sumber: "WHATSAPP",
    vendor: resolvedVendor,
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

  if (isContinuation) {
    return {
      type: "QC_ITEM_APPEND",
      itemNumber: continuationItemNumber,
      report: validation.report,
      item: validation.report.items[0],
      warnings: validation.warnings,
      corrected: hasCorrection,
      requires_confirmation: requiresConfirmation,
      corrections
    };
  }

  return {
    type: "QC_REPORT",
    report: validation.report,
    warnings: validation.warnings,
    corrected: hasCorrection,
    requires_confirmation: requiresConfirmation,
    corrections
  };
}
