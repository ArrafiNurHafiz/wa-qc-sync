// src/qc/matcher.js — Pencocokan produk, vendor, dan 14 kriteria QC menggunakan fastest-levenshtein
import { distance } from "fastest-levenshtein";
import {
  PRODUCT_MASTER,
  CATALOG_RELATIONS,
  KEYWORD_ALIASES,
  VENDORS_PRE,
  VENDORS_FIN,
  QC_CRITERIA
} from "./dictionary.js";

const FUZZY_ACCEPT_THRESHOLD = 0.50;
const FUZZY_CONFIRM_THRESHOLD = 0.90;

export function cleanString(str) {
  if (!str) return "";
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scoreSimilarity(cleanedA, cleanedB) {
  if (!cleanedA || !cleanedB) return 0;
  const maxLen = Math.max(cleanedA.length, cleanedB.length);
  if (maxLen === 0) return 0;
  return 1 - distance(cleanedA, cleanedB) / maxLen;
}

/**
 * Mencocokkan nama/SKU produk ke PRODUCT_MASTER dan CATALOG_RELATIONS.
 * Mengembalikan null jika skor < 0.50.
 */
export function matchProduct(inputName, targetBuyer = null) {
  if (!inputName || !String(inputName).trim()) return null;

  const raw = String(inputName).trim();
  const cleaned = cleanString(raw);
  if (!cleaned) return null;

  // 1. Exact SKU Raw Body
  const exactSku = PRODUCT_MASTER.find((p) => cleanString(p.sku) === cleaned);
  if (exactSku) {
    return { product: exactSku, confidence: "sku_exact", score: 1, corrected: false, requiresConfirmation: false, original: raw };
  }

  // 2. Exact SKU Buyer
  const matchBuyerSku = CATALOG_RELATIONS.find((c) => c.sku && cleanString(c.sku) === cleaned);
  if (matchBuyerSku) {
    const product = PRODUCT_MASTER.find((x) => x.sku === matchBuyerSku.rb);
    if (product) {
      return { product, buyerRelation: matchBuyerSku, confidence: "buyer_sku_exact", score: 1, corrected: true, requiresConfirmation: false, original: raw };
    }
  }

  // 3. Exact Nama Resmi KWaS
  const exactName = PRODUCT_MASTER.find((p) => cleanString(p.nama) === cleaned);
  if (exactName) {
    return { product: exactName, confidence: "name_exact", score: 1, corrected: false, requiresConfirmation: false, original: raw };
  }

  // 4. Exact Nama Buyer
  const matchBuyerName = CATALOG_RELATIONS.find((c) => {
    if (targetBuyer && cleanString(c.buyer) !== cleanString(targetBuyer)) return false;
    return cleanString(c.nama_buyer) === cleaned;
  });
  if (matchBuyerName) {
    const product = PRODUCT_MASTER.find((x) => x.sku === matchBuyerName.rb);
    if (product) {
      return { product, buyerRelation: matchBuyerName, confidence: "buyer_name_exact", score: 1, corrected: true, requiresConfirmation: false, original: raw };
    }
  }

  // 5. Shorthand Alias
  for (const [alias, sku] of Object.entries(KEYWORD_ALIASES)) {
    if (cleaned === cleanString(alias)) {
      const product = PRODUCT_MASTER.find((x) => x.sku === sku);
      if (product) {
        return { product, confidence: "alias_match", score: 1, corrected: true, requiresConfirmation: false, original: raw };
      }
    }
  }

  // 6. Exact Alias di PRODUCT_MASTER
  for (const p of PRODUCT_MASTER) {
    if (Array.isArray(p.alias) && p.alias.some((al) => cleanString(al) === cleaned)) {
      return { product: p, confidence: "alias_match", score: 1, corrected: true, requiresConfirmation: false, original: raw };
    }
  }

  // 7. Fuzzy Levenshtein terhadap nama KWaS & alias
  let best = null;
  let maxScore = 0;

  for (const p of PRODUCT_MASTER) {
    const candidates = [p.nama, ...(Array.isArray(p.alias) ? p.alias : [])];
    for (const candidate of candidates) {
      const score = scoreSimilarity(cleaned, cleanString(candidate));
      if (score > maxScore) {
        maxScore = score;
        best = p;
      }
    }
  }

  // 8. Fuzzy terhadap nama buyer bila belum tinggi
  if (maxScore < 0.55) {
    for (const c of CATALOG_RELATIONS) {
      if (targetBuyer && cleanString(c.buyer) !== cleanString(targetBuyer)) continue;
      const score = scoreSimilarity(cleaned, cleanString(c.nama_buyer));
      if (score > maxScore) {
        const product = PRODUCT_MASTER.find((x) => x.sku === c.rb);
        if (product) {
          maxScore = score;
          best = product;
        }
      }
    }
  }

  if (best && maxScore >= FUZZY_ACCEPT_THRESHOLD) {
    return {
      product: best,
      confidence: "fuzzy_match",
      score: maxScore,
      corrected: true,
      requiresConfirmation: maxScore < FUZZY_CONFIRM_THRESHOLD,
      original: raw
    };
  }

  return null;
}

/**
 * Mencocokkan vendor terhadap daftar PRE, FIN, atau gabungan (jika type null/"AUTO").
 * Mengembalikan null jika skor < 0.50 (FR-003).
 */
export function matchVendorWithConfidence(inputVendor, type = null) {
  if (!inputVendor || !String(inputVendor).trim()) return null;

  const raw = String(inputVendor).trim();
  const cleaned = cleanString(raw);
  if (!cleaned) return null;

  let list;
  if (type === "PRE") {
    list = VENDORS_PRE;
  } else if (type === "FIN") {
    list = VENDORS_FIN;
  } else {
    list = [...new Set([...VENDORS_PRE, ...VENDORS_FIN])];
  }

  for (const v of list) {
    if (cleanString(v) === cleaned) {
      return {
        vendor: v,
        confidence: "exact",
        score: 1,
        corrected: false,
        requiresConfirmation: false,
        original: raw
      };
    }
  }

  let best = null;
  let maxScore = 0;
  for (const v of list) {
    const score = scoreSimilarity(cleaned, cleanString(v));
    if (score > maxScore) {
      maxScore = score;
      best = v;
    }
  }

  if (!best || maxScore < FUZZY_ACCEPT_THRESHOLD) {
    return null;
  }

  return {
    vendor: best,
    confidence: "fuzzy_match",
    score: maxScore,
    corrected: true,
    requiresConfirmation: maxScore < FUZZY_CONFIRM_THRESHOLD,
    original: raw
  };
}

/**
 * Mencocokkan jenis kerusakan ke 14 kriteria standar DOK. QC-WOOD-01.
 * Jika skor < 0.50, dipetakan ke kategori 'LAINNYA' dengan teks asli disimpan.
 */
export function matchCriterion(inputText) {
  const raw = String(inputText || "").trim();
  const cleaned = cleanString(raw);

  if (!cleaned || cleaned === "lainnya" || cleaned === "other") {
    return {
      id: "LAINNYA",
      label: raw && cleaned !== "lainnya" && cleaned !== "other" ? raw : "Lainnya",
      shortLabel: "Lainnya",
      original: raw,
      isOther: true,
      corrected: false,
      score: cleaned ? 1 : 0
    };
  }

  // Exact match terhadap id, shortLabel, label, atau aliases
  for (const c of QC_CRITERIA) {
    const targets = [c.id, c.shortLabel, c.label, ...(c.aliases || [])];
    if (targets.some((t) => cleanString(t) === cleaned)) {
      return {
        ...c,
        isOther: false,
        corrected: false,
        score: 1,
        original: raw
      };
    }
  }

  // Fuzzy match via Levenshtein
  let best = null;
  let maxScore = 0;
  for (const c of QC_CRITERIA) {
    const targets = [c.shortLabel, c.label, ...(c.aliases || [])];
    for (const t of targets) {
      const score = scoreSimilarity(cleaned, cleanString(t));
      if (score > maxScore) {
        maxScore = score;
        best = c;
      }
    }
  }

  if (best && maxScore >= FUZZY_ACCEPT_THRESHOLD) {
    return {
      ...best,
      isOther: false,
      corrected: true,
      score: maxScore,
      original: raw
    };
  }

  return {
    id: "LAINNYA",
    label: "Lainnya",
    shortLabel: "Lainnya",
    original: raw,
    isOther: true,
    corrected: false,
    score: maxScore
  };
}
