// src/qc/dictionary.js — Kamus master QC Lapangan KWaS (produk, vendor, dan 14 kriteria DOK. QC-WOOD-01)
import axios from "axios";

export let VENDORS_PRE = [];

export let VENDORS_FIN = [];

export const MC_LIMITS = {
  Unfinish: 15,
  Finish: 17
};

export const QC_DECISIONS = ["Lolos", "Bersyarat", "Tolak"];

export const QC_CRITERIA = [
  {
    id: "ATI",
    row: 14,
    group: "Cacat Permukaan & Serat",
    shortLabel: "Ati",
    label: "Bebas Ati",
    aliases: ["ati", "bebas ati", "hati kayu"]
  },
  {
    id: "PULUR",
    row: 15,
    group: "Cacat Permukaan & Serat",
    shortLabel: "Pulur",
    label: "Bebas Pulur",
    aliases: ["pulur", "bebas pulur", "empulur"]
  },
  {
    id: "TETER",
    row: 16,
    group: "Cacat Permukaan & Serat",
    shortLabel: "Teter",
    label: "Bebas Teter",
    aliases: ["teter", "bebas teter", "bubuk kayu"]
  },
  {
    id: "MATA_MATI",
    row: 17,
    group: "Cacat Permukaan & Serat",
    shortLabel: "Mata Mati",
    label: "Bebas Mata Mati (Lubang)",
    aliases: ["mata mati", "matamati", "bebas mata mati", "bebas mata mati lubang", "mata kayu mati"]
  },
  {
    id: "BLUESTAIN",
    row: 18,
    group: "Cacat Permukaan & Serat",
    shortLabel: "Bluestain",
    label: "Bebas Bluestain / Jamur",
    aliases: ["bluestain", "blue stain", "jamur", "bebas bluestain", "bebas bluestain jamur"]
  },
  {
    id: "CUTTER_MARK",
    row: 19,
    group: "Cacat Permukaan & Serat",
    shortLabel: "Cutter Mark",
    label: "Bebas Cutter Mark",
    aliases: ["cutter mark", "cuttermark", "bekas pisau", "bebas cutter mark"]
  },
  {
    id: "BEKAS_GERINDA",
    row: 20,
    group: "Cacat Permukaan & Serat",
    shortLabel: "Gerinda",
    label: "Bebas Bekas Gerinda",
    aliases: ["gerinda", "bekas gerinda", "bebas bekas gerinda"]
  },
  {
    id: "SERAT_BALIK",
    row: 21,
    group: "Cacat Permukaan & Serat",
    shortLabel: "Serat Balik",
    label: "Bebas Serat Balik",
    aliases: ["serat balik", "seratbalik", "bebas serat balik"]
  },
  {
    id: "TOLERANSI_UKURAN",
    row: 23,
    group: "Toleransi & Presisi",
    shortLabel: "Ukuran",
    label: "Toleransi Ukuran (± 2mm)",
    aliases: ["ukuran", "toleransi ukuran", "dimensi", "toleransi ukuran 2mm"]
  },
  {
    id: "KESIKUAN",
    row: 24,
    group: "Toleransi & Presisi",
    shortLabel: "Kesikuan",
    label: "Kesikuan (90°)",
    aliases: ["kesikuan", "siku", "kesikuan 90"]
  },
  {
    id: "DORENG",
    row: 25,
    group: "Toleransi & Presisi",
    shortLabel: "Doreng",
    label: "Doreng (≤ 10%)",
    aliases: ["doreng", "gubal", "doreng 10"]
  },
  {
    id: "WARNA",
    row: 27,
    group: "Kualitas Akhir",
    shortLabel: "Warna",
    label: "Warna Sesuai Color Card",
    aliases: ["warna", "color card", "warna sesuai color card"]
  },
  {
    id: "KEHALUSAN",
    row: 28,
    group: "Kualitas Akhir",
    shortLabel: "Kehalusan",
    label: "Kehalusan Permukaan",
    aliases: ["kehalusan", "halus", "kasar", "kehalusan permukaan"]
  },
  {
    id: "BEBAS_LUBANG",
    row: 29,
    group: "Kualitas Akhir",
    shortLabel: "Lubang",
    label: "Bebas Lubang",
    aliases: ["lubang", "bebas lubang", "bolong"]
  }
];

export function isHeaderOrInvalidVendor(name) {
  if (!name || typeof name !== "string") return true;
  const clean = name.trim().toLowerCase();
  if (clean.length < 2) return true;
  const invalid = [
    "nama vendor",
    "nama",
    "kode vendor",
    "kode",
    "vendor",
    "tipe vendor",
    "contact person",
    "pre-finishing",
    "finishing",
    "header"
  ];
  return invalid.includes(clean);
}

export function normalizeVendorName(name) {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  if (lower.replace(/\s+/g, "") === "san-san" || lower.replace(/\s+/g, "") === "sansan") {
    return "San-San";
  }
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !trimmed.includes("PWJ") && !trimmed.includes("MGL") && !trimmed.includes("PKH")) {
    return trimmed.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }
  return trimmed;
}

export function addVendor(namaVendor, tipeVendor) {
  if (isHeaderOrInvalidVendor(namaVendor)) return;
  const norm = normalizeVendorName(namaVendor);
  if (tipeVendor === "Pre-Finishing" || tipeVendor === "Both") {
    if (!VENDORS_PRE.some((x) => x.toLowerCase() === norm.toLowerCase())) {
      VENDORS_PRE.push(norm);
    }
  }
  if (tipeVendor === "Finishing" || tipeVendor === "Both") {
    if (!VENDORS_FIN.some((x) => x.toLowerCase() === norm.toLowerCase())) {
      VENDORS_FIN.push(norm);
    }
  }
}

/**
 * Sinkronisasi dinamis produk dan vendor dari GAS Webhook (action: GET_MASTER_DATA).
 * Aman dipanggil saat offline atau URL belum diset: mengembalikan false tanpa crash.
 */
export async function syncDictionaryFromWebhook(webhookUrl, fetcher = null) {
  if (!webhookUrl) {
    return false;
  }

  const doPost = fetcher || ((url, body) =>
    axios.post(url, body, {
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      timeout: 10000,
      maxRedirects: 5
    }));

  try {
    const res = await doPost(webhookUrl, { action: "GET_MASTER_DATA", data: {} });
    if (res?.data?.status !== "success" || !res.data.data) {
      return false;
    }

    const { products, vendors } = res.data.data;

    if (Array.isArray(products)) {
      for (const p of products) {
        const sku = String(p.kodeRawBody || p.sku || "").trim();
        const nama = String(p.namaProduk || p.nama || "").trim();
        if (!sku || !nama || sku.toUpperCase() === "KODE RAW BODY" || nama.toUpperCase() === "NAMA PRODUK") {
          continue;
        }
        const exists = PRODUCT_MASTER.find((existing) => existing.sku.toUpperCase() === sku.toUpperCase());
        if (!exists) {
          PRODUCT_MASTER.push({
            sku,
            nama,
            kategori: p.kategori || "Kitchenware",
            alias: [sku.toLowerCase(), nama.toLowerCase(), nama.toLowerCase().replace(/\s+/g, "")]
          });
        }
      }
    }

    if (Array.isArray(vendors)) {
      for (const v of vendors) {
        const vNama = String(v.namaVendor || "").trim();
        if (!vNama || isHeaderOrInvalidVendor(vNama)) continue;

        const vTipe = String(v.tipeVendor || "").trim().toLowerCase();
        const vKode = String(v.kodeVendor || "").trim().toUpperCase();

        const isPre = vKode.startsWith("VPRE") || vTipe.includes("pre");
        const isFin = vKode.startsWith("VFIN") || (!vTipe.includes("pre") && vTipe.includes("fin"));
        const isBoth = vTipe === "both" || vTipe === "semua";
        const norm = normalizeVendorName(vNama);

        if ((isPre || isBoth) && !VENDORS_PRE.some((x) => x.toLowerCase() === norm.toLowerCase())) {
          VENDORS_PRE.push(norm);
        }
        if ((isFin || isBoth) && !VENDORS_FIN.some((x) => x.toLowerCase() === norm.toLowerCase())) {
          VENDORS_FIN.push(norm);
        }
      }
    }

    return true;
  } catch (_) {
    return false;
  }
}

export const CATALOG_RELATIONS = [];

export const PRODUCT_MASTER = [];

export const KEYWORD_ALIASES = {};
