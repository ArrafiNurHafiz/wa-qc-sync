// src/qc/dictionary.js — Kamus master QC Lapangan KWaS (produk, vendor, dan 14 kriteria DOK. QC-WOOD-01)
import axios from "axios";

export let VENDORS_PRE = [
  "Londo",
  "Titik PWJ",
  "Widodo Klaten",
  "Janu",
  "Diro",
  "Ruminto",
  "Dodo",
  "Bayu Wonosari",
  "Widodo MGL",
  "Lanjar",
  "PKH",
  "Inhouse",
  "Joko Boyolali"
];

export let VENDORS_FIN = [
  "Aris",
  "Baryadi",
  "Yuli",
  "Yoga",
  "Nyoto",
  "Bayu",
  "Sulis",
  "San-San",
  "Inhouse"
];

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
    group: "Toleransi & Presisi Konstruksi",
    shortLabel: "Ukuran",
    label: "Toleransi Ukuran (± 2mm)",
    aliases: ["ukuran", "toleransi ukuran", "dimensi", "toleransi ukuran 2mm"]
  },
  {
    id: "KESIKUAN",
    row: 24,
    group: "Toleransi & Presisi Konstruksi",
    shortLabel: "Kesikuan",
    label: "Kesikuan (90°)",
    aliases: ["kesikuan", "siku", "kesikuan 90"]
  },
  {
    id: "DORENG",
    row: 25,
    group: "Toleransi & Presisi Konstruksi",
    shortLabel: "Doreng",
    label: "Doreng (≤ 10%)",
    aliases: ["doreng", "gubal", "doreng 10"]
  },
  {
    id: "CRACK",
    row: 26,
    group: "Toleransi & Presisi Konstruksi",
    shortLabel: "Crack",
    label: "Crack / Pecah",
    aliases: ["crack", "pecah", "retak", "belah"]
  },
  {
    id: "WARNA",
    row: 28,
    group: "Kualitas Akhir",
    shortLabel: "Warna",
    label: "Warna Sesuai Color Card",
    aliases: ["warna", "color card", "warna sesuai color card"]
  },
  {
    id: "KEHALUSAN",
    row: 29,
    group: "Kualitas Akhir",
    shortLabel: "Kehalusan",
    label: "Kehalusan Permukaan",
    aliases: ["kehalusan", "halus", "kasar", "kehalusan permukaan"]
  },
  {
    id: "BEBAS_LUBANG",
    row: 30,
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
  if (isHeaderOrInvalidVendor(namaVendor)) return false;
  const norm = normalizeVendorName(namaVendor);
  const tipeLower = String(tipeVendor || "Pre-Finishing").trim().toLowerCase();
  const isBoth = tipeLower === "both" || tipeLower === "semua";
  const isPre = isBoth || tipeLower.includes("pre");
  const isFin = isBoth || (!tipeLower.includes("pre") && tipeLower.includes("fin"));

  if (isPre || (!isPre && !isFin)) {
    if (!VENDORS_PRE.some((x) => x.toLowerCase() === norm.toLowerCase())) {
      VENDORS_PRE.push(norm);
    }
  }
  if (isFin) {
    if (!VENDORS_FIN.some((x) => x.toLowerCase() === norm.toLowerCase())) {
      VENDORS_FIN.push(norm);
    }
  }
  return true;
}

export function addProduct({ sku = "", nama = "", kategori = "Kitchenware" } = {}) {
  const cleanNama = String(nama || "").trim();
  if (!cleanNama || cleanNama.toUpperCase() === "NAMA PRODUK") return null;

  const hasExplicitSku = Boolean(String(sku || "").trim());
  let cleanSku = String(sku || "").trim().toUpperCase();
  if (!cleanSku) {
    cleanSku = `RB-${String(PRODUCT_MASTER.length + 1).padStart(3, "0")}`;
  }
  if (cleanSku === "KODE RAW BODY") return null;

  const existing = PRODUCT_MASTER.find((p) =>
    hasExplicitSku
      ? p.sku.toUpperCase() === cleanSku
      : p.sku.toUpperCase() === cleanSku || p.nama.toLowerCase() === cleanNama.toLowerCase()
  );
  if (existing) {
    existing.nama = cleanNama;
    existing.kategori = String(kategori || existing.kategori || "Kitchenware").trim();
    existing.alias = [
      existing.sku.toLowerCase(),
      cleanNama.toLowerCase(),
      cleanNama.toLowerCase().replace(/\s+/g, "")
    ];
    return existing;
  }

  const entry = {
    sku: cleanSku,
    nama: cleanNama,
    kategori: String(kategori || "Kitchenware").trim() || "Kitchenware",
    alias: [cleanSku.toLowerCase(), cleanNama.toLowerCase(), cleanNama.toLowerCase().replace(/\s+/g, "")]
  };
  PRODUCT_MASTER.push(entry);
  return entry;
}

export function applyMasterData({ products, vendors } = {}) {
  if (Array.isArray(products)) {
    for (const p of products) {
      addProduct({
        sku: p.kodeRawBody || p.sku || "",
        nama: p.namaProduk || p.nama || "",
        kategori: p.kategori || "Kitchenware"
      });
    }
  }

  if (Array.isArray(vendors)) {
    for (const v of vendors) {
      const vNama = String(v.namaVendor || v.nama || "").trim();
      if (!vNama || isHeaderOrInvalidVendor(vNama)) continue;
      const vTipe = String(v.tipeVendor || v.tipe || "").trim();
      const vKode = String(v.kodeVendor || "").trim().toUpperCase();
      const resolvedTipe = vTipe || (vKode.startsWith("VFIN") ? "Finishing" : "Pre-Finishing");
      addVendor(vNama, resolvedTipe);
    }
  }
}

/**
 * Sinkronisasi dinamis produk dan vendor dari GAS Webhook (action: GET_MASTER_DATA).
 * Aman dipanggil saat offline atau URL belum diset: mengembalikan false tanpa crash.
 */
export async function syncDictionaryFromWebhook(webhookUrl, fetcher = null, apiSecret = "") {
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
    const res = await doPost(webhookUrl, { action: "GET_MASTER_DATA", apiSecret, data: {} });
    if (res?.data?.status !== "success" || !res.data.data) {
      return false;
    }

    applyMasterData(res.data.data);
    return true;
  } catch (_) {
    return false;
  }
}

export const CATALOG_RELATIONS = [];

export const PRODUCT_MASTER = [
  ["RB102001", "Sutil Kayu Panjang", "Sutil & Spatula"],
  ["RB102002", "Sutil kayu Lengkung", "Sutil & Spatula"],
  ["RB102003", "Sutil Besar", "Sutil & Spatula"],
  ["RB102004", "Fliper Batok", "Sutil & Spatula"],
  ["RB102005", "Spatula Batok", "Sutil & Spatula"],
  ["RB102006", "Spatula Garpu Duco", "Sutil & Spatula"],
  ["RB102007", "Spatula Oval Duco", "Sutil & Spatula"],
  ["RB102008", "Spatula Round Duco", "Sutil & Spatula"],
  ["RB102009", "Spatula Square Duco", "Sutil & Spatula"],
  ["RB102010", "Spatula Strainer Duco", "Sutil & Spatula"],
  ["RB102011", "Sutil Besar Duco", "Sutil & Spatula"],
  ["RB102012", "Sutil Lengkung Duco", "Sutil & Spatula"],
  ["RB102013", "Sutil Panjang Duco", "Sutil & Spatula"],
  ["RB102014", "Scrapper M", "Sutil & Spatula"],
  ["RB102015", "Scrapper s", "Sutil & Spatula"],
  ["RB102016", "Spatula Silikon", "Sutil & Spatula"],
  ["RB103001", "Sendok Nasi", "Sendok & Garpu"],
  ["RB103002", "Sendok Oval", "Sendok & Garpu"],
  ["RB103003", "Sendok Oval Cekung", "Sendok & Garpu"],
  ["RB103004", "Sendok Pecel", "Sendok & Garpu"],
  ["RB103005", "Sendok Peyang", "Sendok & Garpu"],
  ["RB103006", "Sendok Sup", "Sendok & Garpu"],
  ["RB103007", "Sendok Takar Beras", "Sendok & Garpu"],
  ["RB103008", "Sendok Takar Tepung", "Sendok & Garpu"],
  ["RB103009", "Sendok Tumpeng", "Sendok & Garpu"],
  ["RB103010", "Sloted", "Sendok & Garpu"],
  ["RB103011", "Strainer", "Sendok & Garpu"],
  ["RB103012", "Garpu Kayu", "Sendok & Garpu"],
  ["RB103013", "Sendok Makan", "Sendok & Garpu"],
  ["RB103014", "Sendok Bayi / Sendok Panjang", "Sendok & Garpu"],
  ["RB103015", "Sendok Madu", "Sendok & Garpu"],
  ["RB103016", "Sendok Nasi Duco", "Sendok & Garpu"],
  ["RB103017", "Sendok Oval Duco", "Sendok & Garpu"],
  ["RB103018", "Sendok Oval Cekung", "Sendok & Garpu"],
  ["RB103019", "Sumpit", "Sendok & Garpu"],
  ["RB109001", "Penumbuk set", "Alat Dapur"],
  ["RB109002", "Rolling Pin Putar", "Alat Dapur"],
  ["RB109003", "Pemukul Daging", "Alat Dapur"],
  ["RB109004", "Penjapit Kayu", "Alat Dapur"],
  ["RB109005", "Penjapit Stainless", "Alat Dapur"],
  ["RB109006", "Penggiling Adonan", "Alat Dapur"],
  ["RB201001", "Talenan Lubang Oval", "Talenan"],
  ["RB201002", "Talenan Besar MR DIY", "Talenan"],
  ["RB201003", "Talenan Gagang", "Talenan"],
  ["RB201004", "Talenan Jepang", "Talenan"],
  ["RB201005", "Talenan 13an", "Talenan"],
  ["RB201006", "Talenan Lubang Bulat", "Talenan"],
  ["RB201007", "Talenan Besar Pendopo", "Talenan"],
  ["RB201008", "Talenan Lawas", "Talenan"],
  ["RB201009", "Talenan Square Lubang Samping", "Talenan"],
  ["RB201010", "Talenan Square Lubang Tengah", "Talenan"],
  ["RB201011", "Talenan Modif 1", "Talenan"],
  ["RB201012", "Talenan Modif 2", "Talenan"],
  ["RB201013", "Talenan Modif 3", "Talenan"],
  ["RB201014", "Talenan Round Lubang Samping", "Talenan"],
  ["RB201015", "Talenan Square Tanpa Lubang", "Talenan"],
  ["RB305001", "Piring", "Peralatan Makan"],
  ["RB305002", "Mangkok", "Peralatan Makan"],
  ["RB305003", "Cobek", "Peralatan Makan"],
  ["RB306001", "Cangkir + Tutup", "Gelas & Cangkir"],
  ["RB306002", "Gelas dia 8 tinggi 12", "Gelas & Cangkir"],
  ["RB306003", "Gelas dia 8 tinggi 14", "Gelas & Cangkir"],
  ["RB404001", "Nampan Pendek", "Nampan & Tray"],
  ["RB404002", "Nampan Panjang", "Nampan & Tray"],
  ["RB404003", "Tray Bambu 40 cm", "Nampan & Tray"],
  ["RB404004", "Tray Bambu 45 cm", "Nampan & Tray"]
].map(([sku, nama, kategori]) => ({
  sku,
  nama,
  kategori,
  alias: [sku.toLowerCase(), nama.toLowerCase(), nama.toLowerCase().replace(/\s+/g, "")]
}));

export const KEYWORD_ALIASES = {};
