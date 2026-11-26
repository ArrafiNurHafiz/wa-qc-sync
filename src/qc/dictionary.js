// src/qc/dictionary.js — Kamus master QC Lapangan KWaS (produk, vendor, dan 14 kriteria DOK. QC-WOOD-01)
import axios from "axios";

export let VENDORS_PRE = [
  "Londo", "Titik PWJ", "Widodo Klaten", "Janu", "Diro", "Ruminto", "Dodo",
  "Bayu Wonosari", "Widodo MGL", "Lanjar", "PKH", "Inhouse", "Joko Boyolali", "Dolo"
];

export let VENDORS_FIN = [
  "Aris", "Baryadi", "Yuli", "Yoga", "Nyoto", "Bayu", "Sulis", "San-San", "Inhouse"
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

export const CATALOG_RELATIONS = [
  { rb: "RB102001", nama: "Sutil Kayu Panjang", kategori: "Kitchenware", buyer: "FORTUNA", nama_buyer: "SPATULA 35/6", sku: "" },
  { rb: "RB102001", nama: "Sutil Kayu Panjang", kategori: "Kitchenware", buyer: "JOGJA DEPT STORE", nama_buyer: "KWAS SOTHIL KAYU JATI PANJANG 35 CM", sku: "000000021006" },
  { rb: "RB102001", nama: "Sutil Kayu Panjang", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS WOODEN SPATULA 35X6", sku: "" },
  { rb: "RB102001", nama: "Sutil Kayu Panjang", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD SPATULA 35CM KW1-ST002", sku: "10428855" },
  { rb: "RB102001", nama: "Sutil Kayu Panjang", kategori: "Kitchenware", buyer: "REMUJUNG", nama_buyer: "SPATULA 35/6", sku: "" },
  { rb: "RB102001", nama: "Sutil Kayu Panjang", kategori: "Kitchenware", buyer: "RITAPASARAYA", nama_buyer: "SOTHIL KAYU PANJANG", sku: "" },
  { rb: "RB102001", nama: "Sutil Kayu Panjang", kategori: "Kitchenware", buyer: "SUPERINDO", nama_buyer: "365 SUTIL KAYU PANJANG", sku: "7030924" },
  { rb: "RB102002", nama: "Sutil kayu Lengkung", kategori: "Kitchenware", buyer: "FORTUNA", nama_buyer: "SPATULA CURVED 35/6", sku: "" },
  { rb: "RB102002", nama: "Sutil kayu Lengkung", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS WOODEN SPATULA CURVING 35X6", sku: "" },
  { rb: "RB102002", nama: "Sutil kayu Lengkung", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD SPATULA CURVED 35CM KW1-ST001", sku: "10428854" },
  { rb: "RB102002", nama: "Sutil kayu Lengkung", kategori: "Kitchenware", buyer: "REMUJUNG", nama_buyer: "SPATULA CURVING 35/6", sku: "" },
  { rb: "RB102002", nama: "Sutil kayu Lengkung", kategori: "Kitchenware", buyer: "RITAPASARAYA", nama_buyer: "SOTHIL KAYU LENGKUNG", sku: "" },
  { rb: "RB102003", nama: "Sutil Besar", kategori: "Kitchenware", buyer: "JOGJA DEPT STORE", nama_buyer: "KWAS SOTHIL KAYU JATI BESAR 30 CM", sku: "0000000021191" },
  { rb: "RB102003", nama: "Sutil Besar", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS WOODEN SPATULA FLIPPER 30X7,5", sku: "" },
  { rb: "RB102003", nama: "Sutil Besar", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD FLIPPER 30CM KW1-ST005", sku: "10428858" },
  { rb: "RB102003", nama: "Sutil Besar", kategori: "Kitchenware", buyer: "RITAPASARAYA", nama_buyer: "SOTHIL KAYU BESAR", sku: "" },
  { rb: "RB102004", nama: "Fliper Batok", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD FLIPER BATOK KW1-ST 008", sku: "10475826" },
  { rb: "RB102005", nama: "Spatula Batok", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD SPATULA BATOK KW1-ST 009", sku: "10475827" },
  { rb: "RB102006", nama: "Spatula Garpu Duco", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD SPATULA FORK TWOTONE KWD-ST010", sku: "10527260" },
  { rb: "RB102007", nama: "Spatula Oval Duco", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD SPATULA OVAL TWOTONE KWD-ST008", sku: "10527258" },
  { rb: "RB102008", nama: "Spatula Round Duco", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD SPATULA ROUND TWOTONE KWD-ST007", sku: "10527257" },
  { rb: "RB102009", nama: "Spatula Square Duco", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD SPATULA SQR TWOTONE KWD-ST006", sku: "10527256" },
  { rb: "RB102010", nama: "Spatula Strainer Duco", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD SPATULA STRAINR 2TONE KWD-ST009", sku: "10527259" },
  { rb: "RB102011", nama: "Sutil Besar Duco", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD FLIPPER TWOTONE KWD-ST005", sku: "10527255" },
  { rb: "RB102012", nama: "Sutil Lengkung Duco", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD SPATULA CRVED TWOTONE KWD-ST001", sku: "10527251" },
  { rb: "RB102013", nama: "Sutil Panjang Duco", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD SPATULA TWOTONE KWD-ST002", sku: "10527252" },
  { rb: "RB102014", nama: "Scrapper M", kategori: "Kitchenware", buyer: "JOGJA DEPT STORE", nama_buyer: "KWAS SOLET M 28 CM", sku: "0000000021197" },
  { rb: "RB102015", nama: "Scrapper s", kategori: "Kitchenware", buyer: "JOGJA DEPT STORE", nama_buyer: "KWAS SOLET S 24 CM", sku: "0000000021196" },
  { rb: "RB102016", nama: "Spatula Silikon", kategori: "Kitchenware", buyer: "JOGJA DEPT STORE", nama_buyer: "KWAS SPATULA SILICON 29 CM", sku: "0000000021198" },
  { rb: "RB103001", nama: "Sendok Nasi", kategori: "Kitchenware", buyer: "FORTUNA", nama_buyer: "SPOON RICE 22/6", sku: "" },
  { rb: "RB103001", nama: "Sendok Nasi", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS WOODEN RICE SPOON 24X6", sku: "" },
  { rb: "RB103001", nama: "Sendok Nasi", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD RICE SPOON 22CM KW1-ST004", sku: "10428857" },
  { rb: "RB103001", nama: "Sendok Nasi", kategori: "Kitchenware", buyer: "RITAPASARAYA", nama_buyer: "SENDOK NASI", sku: "" },
  { rb: "RB103002", nama: "Sendok Oval", kategori: "Kitchenware", buyer: "FORTUNA", nama_buyer: "SPATULA OVAL 32/6", sku: "" },
  { rb: "RB103002", nama: "Sendok Oval", kategori: "Kitchenware", buyer: "JOGJA DEPT STORE", nama_buyer: "KWAS SOTHIL KAYU JATI OVAL 32 CM", sku: "0000000021190" },
  { rb: "RB103002", nama: "Sendok Oval", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS WOODEN SPATULA ROUND 32X6", sku: "" },
  { rb: "RB103002", nama: "Sendok Oval", kategori: "Kitchenware", buyer: "MR DIY", nama_buyer: "KWAS SENDOK MASAK KW-ST003", sku: "3106613" },
  { rb: "RB103002", nama: "Sendok Oval", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD COOKING SPOON 32CM KW1-ST003", sku: "10428856" },
  { rb: "RB103002", nama: "Sendok Oval", kategori: "Kitchenware", buyer: "REMUJUNG", nama_buyer: "SPATULA ROUND 32/6", sku: "" },
  { rb: "RB103002", nama: "Sendok Oval", kategori: "Kitchenware", buyer: "RITAPASARAYA", nama_buyer: "SOTHIL KAYU OVAL", sku: "" },
  { rb: "RB103003", nama: "Sendok Oval Cekung", kategori: "Kitchenware", buyer: "MR DIY", nama_buyer: "KWAS  CURVED SPATULA KW-T304 31X6CM", sku: "3109704" },
  { rb: "RB103004", nama: "Sendok Pecel", kategori: "Kitchenware", buyer: "MR DIY", nama_buyer: "KWAS TURNER KW-T106 30X5CM", sku: "3109710" },
  { rb: "RB103004", nama: "Sendok Pecel", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD TURNER SPOON  30/5 KWN-ST002", sku: "" },
  { rb: "RB103005", nama: "Sendok Peyang", kategori: "Kitchenware", buyer: "MR DIY", nama_buyer: "KWAS SPOON KW-T202 23X4CM", sku: "3109707" },
  { rb: "RB103005", nama: "Sendok Peyang", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD SPOON 23/4 KWN-ST003", sku: "" },
  { rb: "RB103006", nama: "Sendok Sup", kategori: "Kitchenware", buyer: "FORTUNA", nama_buyer: "SOOP SPOON", sku: "" },
  { rb: "RB103006", nama: "Sendok Sup", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS WOODEN SOUP SPOON 30X7,5", sku: "" },
  { rb: "RB103006", nama: "Sendok Sup", kategori: "Kitchenware", buyer: "MR DIY", nama_buyer: "KWAS SENDOK SUP 30CM KW-ST010", sku: "3107243" },
  { rb: "RB103006", nama: "Sendok Sup", kategori: "Kitchenware", buyer: "RITAPASARAYA", nama_buyer: "SENDOK SOP", sku: "" },
  { rb: "RB103007", nama: "Sendok Takar Beras", kategori: "Kitchenware", buyer: "MR DIY", nama_buyer: "KWAS SERVER SPOON KW-T102 25X6CM", sku: "3109706" },
  { rb: "RB103007", nama: "Sendok Takar Beras", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD SERVER SPOON 25/6 KWN-ST001", sku: "" },
  { rb: "RB103008", nama: "Sendok Takar Tepung", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS WOODEN FLOUR SPOON 20X8", sku: "" },
  { rb: "RB103008", nama: "Sendok Takar Tepung", kategori: "Kitchenware", buyer: "MR DIY", nama_buyer: "KWAS RICE SPOON KW1-SD003 20X8.5CM", sku: "3109705" },
  { rb: "RB103008", nama: "Sendok Takar Tepung", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD FLOUR SPOONKW1-SD 003", sku: "10475813" },
  { rb: "RB103009", nama: "Sendok Tumpeng", kategori: "Kitchenware", buyer: "MR DIY", nama_buyer: "KWAS TURNER KW-T206 32x6.5CM", sku: "3109709" },
  { rb: "RB103009", nama: "Sendok Tumpeng", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD SPATULA 32/6,5 KWN-ST005", sku: "" },
  { rb: "RB103010", nama: "Sloted", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD SLOTTED SPOON KW1-ST 007", sku: "10475817" },
  { rb: "RB103011", nama: "Strainer", kategori: "Kitchenware", buyer: "MR DIY", nama_buyer: "KWAS STRAINER SPOON KW1-ST006 30X7.5CM", sku: "3109711" },
  { rb: "RB103011", nama: "Strainer", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD STREINER KW1-ST 006", sku: "10475816" },
  { rb: "RB103012", nama: "Garpu Kayu", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS WOODEN FORK 18/3", sku: "" },
  { rb: "RB103012", nama: "Garpu Kayu", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD FORK KW1-SD 005", sku: "10475815" },
  { rb: "RB103012", nama: "Garpu Kayu", kategori: "Kitchenware", buyer: "RITAPASARAYA", nama_buyer: "GARPU MAKAN KAYU", sku: "" },
  { rb: "RB103013", nama: "Sendok Makan", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS WOODEN SPOON 18X3", sku: "" },
  { rb: "RB103013", nama: "Sendok Makan", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD SPOON KW1-SD 004", sku: "10475814" },
  { rb: "RB103013", nama: "Sendok Makan", kategori: "Kitchenware", buyer: "RITAPASARAYA", nama_buyer: "SENDOK MAKAN KAYU", sku: "" },
  { rb: "RB103014", nama: "Sendok Bayi / Sendok Panjang", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS WOODEN BABY SPOON", sku: "" },
  { rb: "RB103014", nama: "Sendok Bayi / Sendok Panjang", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD STIR SPOON KW1-SD 002", sku: "10475812" },
  { rb: "RB103015", nama: "Sendok Madu", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD HONEY DEEPER KW1-SD 001", sku: "10475811" },
  { rb: "RB103016", nama: "Sendok Nasi Duco", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD RICE SPOON TWOTONE KWD-ST004", sku: "10527254" },
  { rb: "RB103017", nama: "Sendok Oval Duco", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD COOKING SPOON TWOTONE KWD-ST003", sku: "10527253" },
  { rb: "RB103018", nama: "Sendok Oval Cekung", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD SPATULA OVAL 31/6 KW-ST004", sku: "" },
  { rb: "RB103019", nama: "Sumpit", kategori: "Kitchenware", buyer: "RITAPASARAYA", nama_buyer: "SUMPIT KAYU", sku: "" },
  { rb: "RB109001", nama: "Penumbuk set", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS WOODEN REEF SET", sku: "" },
  { rb: "RB109001", nama: "Penumbuk set", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD MORTAL PESTLE SET KW1-LP 001", sku: "10475830" },
  { rb: "RB109002", nama: "Rolling Pin Putar", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD ROLLING PIN 40CM KW1-AK002", sku: "10428859" },
  { rb: "RB109003", nama: "Pemukul Daging", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD MEAT MALLET KW1-PD001", sku: "10428862" },
  { rb: "RB109004", nama: "Penjapit Kayu", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD TONGS KW1-PJ001", sku: "10428863" },
  { rb: "RB109004", nama: "Penjapit Kayu", kategori: "Kitchenware", buyer: "RITAPASARAYA", nama_buyer: "PENJEPIT MAKANAN KAYU", sku: "" },
  { rb: "RB109005", nama: "Penjapit Stainless", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD TONGS STAINLESS HANDLE KW1-P002", sku: "10428864" },
  { rb: "RB109006", nama: "Penggiling Adonan", kategori: "Kitchenware", buyer: "JOGJA DEPT STORE", nama_buyer: "KWAS GILINGAN ADONAN KUE JATI BESAR 45 CM", sku: "0000000021192" },
  { rb: "RB109006", nama: "Penggiling Adonan", kategori: "Kitchenware", buyer: "RITAPASARAYA", nama_buyer: "PENGGILING ADONAN KUE", sku: "" },
  { rb: "RB201001", nama: "Talenan Lubang Oval", kategori: "Kitchenware", buyer: "FORTUNA", nama_buyer: "CUTTING BOARD OVAL 30X20", sku: "" },
  { rb: "RB201001", nama: "Talenan Lubang Oval", kategori: "Kitchenware", buyer: "JOGJA DEPT STORE", nama_buyer: "KWAS TALENAN KAYU JATI", sku: "0000000021194" },
  { rb: "RB201001", nama: "Talenan Lubang Oval", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS CUTTING BOARD 30X20", sku: "" },
  { rb: "RB201001", nama: "Talenan Lubang Oval", kategori: "Kitchenware", buyer: "MR DIY", nama_buyer: "KWAS CUTTING BOARD KW-TL001 30*20*1.5CM", sku: "3106617" },
  { rb: "RB201001", nama: "Talenan Lubang Oval", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD OV CUT BOARD 30X20 KW1-TL001", sku: "10428860" },
  { rb: "RB201001", nama: "Talenan Lubang Oval", kategori: "Kitchenware", buyer: "REMUJUNG", nama_buyer: "CUTTING BOARD OVAL 30X21", sku: "" },
  { rb: "RB201001", nama: "Talenan Lubang Oval", kategori: "Kitchenware", buyer: "RITAPASARAYA", nama_buyer: "TALENAN OVAL", sku: "" },
  { rb: "RB201001", nama: "Talenan Lubang Oval", kategori: "Kitchenware", buyer: "SUPERINDO", nama_buyer: "365 TALENAN KAYU", sku: "7030903" },
  { rb: "RB201002", nama: "Talenan Besar MR DIY", kategori: "Kitchenware", buyer: "FORTUNA", nama_buyer: "CUTTING BOARD OVAL 40X25", sku: "" },
  { rb: "RB201002", nama: "Talenan Besar MR DIY", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS CUTTING BOARD 40X25", sku: "" },
  { rb: "RB201002", nama: "Talenan Besar MR DIY", kategori: "Kitchenware", buyer: "MR DIY", nama_buyer: "KWAS CUTTING BOARD KW-TL004 40*25*1.5CM", sku: "3107244" },
  { rb: "RB201002", nama: "Talenan Besar MR DIY", kategori: "Kitchenware", buyer: "REMUJUNG", nama_buyer: "CUTTING BOARD OVAL 40X26", sku: "" },
  { rb: "RB201003", nama: "Talenan Gagang", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS CUTTING BOARD WITH HANDLE 30X20", sku: "" },
  { rb: "RB201003", nama: "Talenan Gagang", kategori: "Kitchenware", buyer: "MR DIY", nama_buyer: "KWAS CUT BOARD KW-TL007 30X20X1,5CM", sku: "3109702" },
  { rb: "RB201003", nama: "Talenan Gagang", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD CUTTING BOARD SQUARE KW1-TL 004", sku: "10475829" },
  { rb: "RB201004", nama: "Talenan Jepang", kategori: "Kitchenware", buyer: "MR DIY", nama_buyer: "KWAS ROUND CUTTING BOARD 34X23X1,5CM", sku: "3109708" },
  { rb: "RB201004", nama: "Talenan Jepang", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD ROUND CUTTING BOARD WITH HANDLE 34/23 KWN-TL001", sku: "" },
  { rb: "RB201005", nama: "Talenan 13an", kategori: "Kitchenware", buyer: "MR DIY", nama_buyer: "KWAS OVAL CUT BOARD KW1-TL008 30X13CM", sku: "3109703" },
  { rb: "RB201005", nama: "Talenan 13an", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD BOARD 3 KW1-TL008", sku: "10527263" },
  { rb: "RB201006", nama: "Talenan Lubang Bulat", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD RN CUT BOARD 30X20 KW1-TL002", sku: "10428861" },
  { rb: "RB201007", nama: "Talenan Besar Pendopo", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD CUTTING BOARD 45 X 28 CM", sku: "10516516" },
  { rb: "RB201008", nama: "Talenan Lawas", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD CUTTING BOARD CURVY KW1-TL 003", sku: "10475828" },
  { rb: "RB201009", nama: "Talenan  Square Lubang Samping", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD BOARD 4 KW1-TL009", sku: "10527264" },
  { rb: "RB201010", nama: "Talenan  Square Lubang Tengah", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD BOARD 5 KW1-TL010", sku: "10527265" },
  { rb: "RB201011", nama: "Talenan Modif 1", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD BOARD 6 KW1-TL011", sku: "10527266" },
  { rb: "RB201012", nama: "Talenan Modif 2", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD BOARD 7 KW1-TL012", sku: "10527267" },
  { rb: "RB201013", nama: "Talenan Modif 3", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD BOARD 8 KW1-TL013", sku: "10527268" },
  { rb: "RB201014", nama: "Talenan Round Lubang Samping", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD BOARD 2 KW1-TL007", sku: "10527262" },
  { rb: "RB201015", nama: "Talenan Square Tanpa Lubang", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD BOARD 1 KW1-TL006", sku: "10527261" },
  { rb: "RB305001", nama: "Piring", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD PLATE 20 CMKW1-PK 001", sku: "10475824" },
  { rb: "RB305002", nama: "Mangkok", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD BOWL 17.5 CMKW1-MK 001", sku: "10475824" },
  { rb: "RB305003", nama: "Cobek", kategori: "Kitchenware", buyer: "REMUJUNG", nama_buyer: "Bowl", sku: "" },
  { rb: "RB306001", nama: "Cangkir + Tutup", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "Bungas Cup Model 3 With Lid 11,5/8", sku: "" },
  { rb: "RB306002", nama: "Gelas dia 8 tinggi 12", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "Glass 8/12", sku: "" },
  { rb: "RB306003", nama: "Gelas dia 8 tinggi 14", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "Glass 8/14", sku: "" },
  { rb: "RB404001", nama: "Nampan Pendek", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS WOODEN COFFEE BOX TRAY 25X15", sku: "" },
  { rb: "RB404001", nama: "Nampan Pendek", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD SMALL TRAY KW1-TR 001", sku: "10475818" },
  { rb: "RB404002", nama: "Nampan Panjang", kategori: "Kitchenware", buyer: "FORTUNA", nama_buyer: "COFFEE BOX TRAY 31/15", sku: "" },
  { rb: "RB404002", nama: "Nampan Panjang", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS WOODEN COFFEE BOX TRAY 31X15", sku: "" },
  { rb: "RB404002", nama: "Nampan Panjang", kategori: "Kitchenware", buyer: "MR DIY", nama_buyer: "KWAS COFFE BOX TRAY 31*15 KW-TR003", sku: "3107245" },
  { rb: "RB404002", nama: "Nampan Panjang", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD LONG TRAY KW1-TR 002", sku: "10475819" },
  { rb: "RB404002", nama: "Nampan Panjang", kategori: "Kitchenware", buyer: "REMUJUNG", nama_buyer: "COFFE BOX TRAY 31/15", sku: "" },
  { rb: "RB404003", nama: "Tray Bambu 40 cm", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS RECTANGULAR BAMBOO TRAY CLASSIC 40X20", sku: "" },
  { rb: "RB404003", nama: "Tray Bambu 40 cm", kategori: "Kitchenware", buyer: "MR DIY", nama_buyer: "KWAS TRAY ANYAM BAMBU 40*20*5CM KW-TR002", sku: "3107246" },
  { rb: "RB404003", nama: "Tray Bambu 40 cm", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD RECTANGLE BAMBOO 40/20 KW-TRB004", sku: "" },
  { rb: "RB404004", nama: "Tray Bambu 45 cm", kategori: "Kitchenware", buyer: "FORTUNA", nama_buyer: "Rectangular Bamboo Tray", sku: "" },
  { rb: "RB404004", nama: "Tray Bambu 45 cm", kategori: "Kitchenware", buyer: "KJ PERABOT", nama_buyer: "KWAS RECTANGULAR BAMBOO TRAY CLASSIC 45X25", sku: "" },
  { rb: "RB404004", nama: "Tray Bambu 45 cm", kategori: "Kitchenware", buyer: "PENDOPO", nama_buyer: "TEAKWOOD RECTANGLE BAMBOO 45/25 KW-TRB003", sku: "" },
  { rb: "RB404004", nama: "Tray Bambu 45 cm", kategori: "Kitchenware", buyer: "REMUJUNG", nama_buyer: "Rectangle Bamboo Tray Clasic 2 45/25", sku: "" }
];

export const PRODUCT_MASTER = [
  { sku: "RB102001", nama: "Sutil Kayu Panjang", kategori: "Kitchenware", alias: ["000000021006", "10428855", "365 sutil kayu panjang", "7030924", "kwas sothil kayu jati panjang 35 cm", "kwas wooden spatula 35x6", "sothil kayu panjang", "spatula 35/6", "sutil kayu panjang", "sutilkayupanjang", "teakwood spatula 35cm kw1-st002"] },
  { sku: "RB102002", nama: "Sutil kayu Lengkung", kategori: "Kitchenware", alias: ["10428854", "kwas wooden spatula curving 35x6", "sothil kayu lengkung", "spatula curved 35/6", "spatula curving 35/6", "sutil kayu lengkung", "sutilkayulengkung", "teakwood spatula curved 35cm kw1-st001"] },
  { sku: "RB102003", nama: "Sutil Besar", kategori: "Kitchenware", alias: ["0000000021191", "10428858", "kwas sothil kayu jati besar 30 cm", "kwas wooden spatula flipper 30x7,5", "sothil kayu besar", "sutil besar", "sutilbesar", "teakwood flipper 30cm kw1-st005"] },
  { sku: "RB102004", nama: "Fliper Batok", kategori: "Kitchenware", alias: ["10475826", "fliper batok", "fliperbatok", "teakwood fliper batok kw1-st 008"] },
  { sku: "RB102005", nama: "Spatula Batok", kategori: "Kitchenware", alias: ["10475827", "spatula batok", "spatulabatok", "teakwood spatula batok kw1-st 009"] },
  { sku: "RB102006", nama: "Spatula Garpu Duco", kategori: "Kitchenware", alias: ["10527260", "spatula garpu duco", "spatulagarpuduco", "teakwood spatula fork twotone kwd-st010"] },
  { sku: "RB102007", nama: "Spatula Oval Duco", kategori: "Kitchenware", alias: ["10527258", "spatula oval duco", "spatulaovalduco", "teakwood spatula oval twotone kwd-st008"] },
  { sku: "RB102008", nama: "Spatula Round Duco", kategori: "Kitchenware", alias: ["10527257", "spatula round duco", "spatularoundduco", "teakwood spatula round twotone kwd-st007"] },
  { sku: "RB102009", nama: "Spatula Square Duco", kategori: "Kitchenware", alias: ["10527256", "spatula square duco", "spatulasquareduco", "teakwood spatula sqr twotone kwd-st006"] },
  { sku: "RB102010", nama: "Spatula Strainer Duco", kategori: "Kitchenware", alias: ["10527259", "spatula strainer duco", "spatulastrainerduco", "teakwood spatula strainr 2tone kwd-st009"] },
  { sku: "RB102011", nama: "Sutil Besar Duco", kategori: "Kitchenware", alias: ["10527255", "sutil besar duco", "sutilbesarduco", "teakwood flipper twotone kwd-st005"] },
  { sku: "RB102012", nama: "Sutil Lengkung Duco", kategori: "Kitchenware", alias: ["10527251", "sutil lengkung duco", "sutillengkungduco", "teakwood spatula crved twotone kwd-st001"] },
  { sku: "RB102013", nama: "Sutil Panjang Duco", kategori: "Kitchenware", alias: ["10527252", "sutil panjang duco", "sutilpanjangduco", "teakwood spatula twotone kwd-st002"] },
  { sku: "RB102014", nama: "Scrapper M", kategori: "Kitchenware", alias: ["0000000021197", "kwas solet m 28 cm", "scrapper m", "scrapperm"] },
  { sku: "RB102015", nama: "Scrapper s", kategori: "Kitchenware", alias: ["0000000021196", "kwas solet s 24 cm", "scrapper s", "scrappers"] },
  { sku: "RB102016", nama: "Spatula Silikon", kategori: "Kitchenware", alias: ["0000000021198", "kwas spatula silicon 29 cm", "spatula silikon", "spatulasilikon"] },
  { sku: "RB103001", nama: "Sendok Nasi", kategori: "Kitchenware", alias: ["10428857", "kwas wooden rice spoon 24x6", "sendok nasi", "sendoknasi", "spoon rice 22/6", "teakwood rice spoon 22cm kw1-st004"] },
  { sku: "RB103002", nama: "Sendok Oval", kategori: "Kitchenware", alias: ["0000000021190", "10428856", "3106613", "kwas sendok masak kw-st003", "kwas sothil kayu jati oval 32 cm", "kwas wooden spatula round 32x6", "sendok oval", "sendokoval", "sothil kayu oval", "spatula oval 32/6", "spatula round 32/6", "teakwood cooking spoon 32cm kw1-st003"] },
  { sku: "RB103003", nama: "Sendok Oval Cekung", kategori: "Kitchenware", alias: ["3109704", "kwas  curved spatula kw-t304 31x6cm", "sendok oval cekung", "sendokovalcekung"] },
  { sku: "RB103004", nama: "Sendok Pecel", kategori: "Kitchenware", alias: ["3109710", "kwas turner kw-t106 30x5cm", "sendok pecel", "sendokpecel", "teakwood turner spoon  30/5 kwn-st002"] },
  { sku: "RB103005", nama: "Sendok Peyang", kategori: "Kitchenware", alias: ["3109707", "kwas spoon kw-t202 23x4cm", "sendok peyang", "sendokpeyang", "teakwood spoon 23/4 kwn-st003"] },
  { sku: "RB103006", nama: "Sendok Sup", kategori: "Kitchenware", alias: ["3107243", "kwas sendok sup 30cm kw-st010", "kwas wooden soup spoon 30x7,5", "sendok sop", "sendok sup", "sendoksup", "soop spoon"] },
  { sku: "RB103007", nama: "Sendok Takar Beras", kategori: "Kitchenware", alias: ["3109706", "kwas server spoon kw-t102 25x6cm", "sendok takar beras", "sendoktakarberas", "teakwood server spoon 25/6 kwn-st001"] },
  { sku: "RB103008", nama: "Sendok Takar Tepung", kategori: "Kitchenware", alias: ["10475813", "3109705", "kwas rice spoon kw1-sd003 20x8.5cm", "kwas wooden flour spoon 20x8", "sendok takar tepung", "sendoktakartepung", "teakwood flour spoonkw1-sd 003"] },
  { sku: "RB103009", nama: "Sendok Tumpeng", kategori: "Kitchenware", alias: ["3109709", "kwas turner kw-t206 32x6.5cm", "sendok tumpeng", "sendoktumpeng", "teakwood spatula 32/6,5 kwn-st005"] },
  { sku: "RB103010", nama: "Sloted", kategori: "Kitchenware", alias: ["10475817", "sloted", "teakwood slotted spoon kw1-st 007"] },
  { sku: "RB103011", nama: "Strainer", kategori: "Kitchenware", alias: ["10475816", "3109711", "kwas strainer spoon kw1-st006 30x7.5cm", "strainer", "teakwood streiner kw1-st 006"] },
  { sku: "RB103012", nama: "Garpu Kayu", kategori: "Kitchenware", alias: ["10475815", "garpu kayu", "garpu makan kayu", "garpukayu", "kwas wooden fork 18/3", "teakwood fork kw1-sd 005"] },
  { sku: "RB103013", nama: "Sendok Makan", kategori: "Kitchenware", alias: ["10475814", "kwas wooden spoon 18x3", "sendok makan", "sendok makan kayu", "sendokmakan", "teakwood spoon kw1-sd 004"] },
  { sku: "RB103014", nama: "Sendok Bayi / Sendok Panjang", kategori: "Kitchenware", alias: ["10475812", "kwas wooden baby spoon", "sendok bayi / sendok panjang", "sendokbayi/sendokpanjang", "teakwood stir spoon kw1-sd 002"] },
  { sku: "RB103015", nama: "Sendok Madu", kategori: "Kitchenware", alias: ["10475811", "sendok madu", "sendokmadu", "teakwood honey deeper kw1-sd 001"] },
  { sku: "RB103016", nama: "Sendok Nasi Duco", kategori: "Kitchenware", alias: ["10527254", "sendok nasi duco", "sendoknasiduco", "teakwood rice spoon twotone kwd-st004"] },
  { sku: "RB103017", nama: "Sendok Oval Duco", kategori: "Kitchenware", alias: ["10527253", "sendok oval duco", "sendokovalduco", "teakwood cooking spoon twotone kwd-st003"] },
  { sku: "RB103018", nama: "Sendok Oval Cekung", kategori: "Kitchenware", alias: ["sendok oval cekung", "sendokovalcekung", "teakwood spatula oval 31/6 kw-st004"] },
  { sku: "RB103019", nama: "Sumpit", kategori: "Kitchenware", alias: ["sumpit", "sumpit kayu"] },
  { sku: "RB109001", nama: "Penumbuk set", kategori: "Kitchenware", alias: ["10475830", "kwas wooden reef set", "penumbuk set", "penumbukset", "teakwood mortal pestle set kw1-lp 001"] },
  { sku: "RB109002", nama: "Rolling Pin Putar", kategori: "Kitchenware", alias: ["10428859", "rolling pin putar", "rollingpinputar", "teakwood rolling pin 40cm kw1-ak002"] },
  { sku: "RB109003", nama: "Pemukul Daging", kategori: "Kitchenware", alias: ["10428862", "pemukul daging", "pemukuldaging", "teakwood meat mallet kw1-pd001"] },
  { sku: "RB109004", nama: "Penjapit Kayu", kategori: "Kitchenware", alias: ["10428863", "penjapit kayu", "penjapitkayu", "penjepit makanan kayu", "teakwood tongs kw1-pj001"] },
  { sku: "RB109005", nama: "Penjapit Stainless", kategori: "Kitchenware", alias: ["10428864", "penjapit stainless", "penjapitstainless", "teakwood tongs stainless handle kw1-p002"] },
  { sku: "RB109006", nama: "Penggiling Adonan", kategori: "Kitchenware", alias: ["0000000021192", "kwas gilingan adonan kue jati besar 45 cm", "penggiling adonan", "penggiling adonan kue", "penggilingadonan"] },
  { sku: "RB201001", nama: "Talenan Lubang Oval", kategori: "Kitchenware", alias: ["0000000021194", "10428860", "3106617", "365 talenan kayu", "7030903", "cutting board oval 30x20", "cutting board oval 30x21", "kwas cutting board 30x20", "kwas cutting board kw-tl001 30*20*1.5cm", "kwas talenan kayu jati", "talenan lubang oval", "talenan oval", "talenanlubangoval", "teakwood ov cut board 30x20 kw1-tl001"] },
  { sku: "RB201002", nama: "Talenan Besar MR DIY", kategori: "Kitchenware", alias: ["3107244", "cutting board oval 40x25", "cutting board oval 40x26", "kwas cutting board 40x25", "kwas cutting board kw-tl004 40*25*1.5cm", "talenan besar mr diy", "talenanbesarmrdiy"] },
  { sku: "RB201003", nama: "Talenan Gagang", kategori: "Kitchenware", alias: ["10475829", "3109702", "kwas cut board kw-tl007 30x20x1,5cm", "kwas cutting board with handle 30x20", "talenan gagang", "talenangagang", "teakwood cutting board square kw1-tl 004"] },
  { sku: "RB201004", nama: "Talenan Jepang", kategori: "Kitchenware", alias: ["3109708", "kwas round cutting board 34x23x1,5cm", "talenan jepang", "talenanjepang", "teakwood round cutting board with handle 34/23 kwn-tl001"] },
  { sku: "RB201005", nama: "Talenan 13an", kategori: "Kitchenware", alias: ["10527263", "3109703", "kwas oval cut board kw1-tl008 30x13cm", "talenan 13an", "talenan13an", "teakwood board 3 kw1-tl008"] },
  { sku: "RB201006", nama: "Talenan Lubang Bulat", kategori: "Kitchenware", alias: ["10428861", "talenan lubang bulat", "talenanlubangbulat", "teakwood rn cut board 30x20 kw1-tl002"] },
  { sku: "RB201007", nama: "Talenan Besar Pendopo", kategori: "Kitchenware", alias: ["10516516", "talenan besar pendopo", "talenanbesarpendopo", "teakwood cutting board 45 x 28 cm"] },
  { sku: "RB201008", nama: "Talenan Lawas", kategori: "Kitchenware", alias: ["10475828", "talenan lawas", "talenanlawas", "teakwood cutting board curvy kw1-tl 003"] },
  { sku: "RB201009", nama: "Talenan  Square Lubang Samping", kategori: "Kitchenware", alias: ["10527264", "talenan  square lubang samping", "talenansquarelubangsamping", "teakwood board 4 kw1-tl009"] },
  { sku: "RB201010", nama: "Talenan  Square Lubang Tengah", kategori: "Kitchenware", alias: ["10527265", "talenan  square lubang tengah", "talenansquarelubangtengah", "teakwood board 5 kw1-tl010"] },
  { sku: "RB201011", nama: "Talenan Modif 1", kategori: "Kitchenware", alias: ["10527266", "talenan modif 1", "talenanmodif1", "teakwood board 6 kw1-tl011"] },
  { sku: "RB201012", nama: "Talenan Modif 2", kategori: "Kitchenware", alias: ["10527267", "talenan modif 2", "talenanmodif2", "teakwood board 7 kw1-tl012"] },
  { sku: "RB201013", nama: "Talenan Modif 3", kategori: "Kitchenware", alias: ["10527268", "talenan modif 3", "talenanmodif3", "teakwood board 8 kw1-tl013"] },
  { sku: "RB201014", nama: "Talenan Round Lubang Samping", kategori: "Kitchenware", alias: ["10527262", "talenan round lubang samping", "talenanroundlubangsamping", "teakwood board 2 kw1-tl007"] },
  { sku: "RB201015", nama: "Talenan Square Tanpa Lubang", kategori: "Kitchenware", alias: ["10527261", "talenan square tanpa lubang", "talenansquaretanpalubang", "teakwood board 1 kw1-tl006"] },
  { sku: "RB305001", nama: "Piring", kategori: "Kitchenware", alias: ["10475824", "piring", "teakwood plate 20 cmkw1-pk 001"] },
  { sku: "RB305002", nama: "Mangkok", kategori: "Kitchenware", alias: ["10475824", "mangkok", "teakwood bowl 17.5 cmkw1-mk 001"] },
  { sku: "RB305003", nama: "Cobek", kategori: "Kitchenware", alias: ["bowl", "cobek"] },
  { sku: "RB306001", nama: "Cangkir + Tutup", kategori: "Kitchenware", alias: ["bungas cup model 3 with lid 11,5/8", "cangkir + tutup", "cangkir+tutup"] },
  { sku: "RB306002", nama: "Gelas dia 8 tinggi 12", kategori: "Kitchenware", alias: ["gelas dia 8 tinggi 12", "gelasdia8tinggi12", "glass 8/12"] },
  { sku: "RB306003", nama: "Gelas dia 8 tinggi 14", kategori: "Kitchenware", alias: ["gelas dia 8 tinggi 14", "gelasdia8tinggi14", "glass 8/14"] },
  { sku: "RB404001", nama: "Nampan Pendek", kategori: "Kitchenware", alias: ["10475818", "kwas wooden coffee box tray 25x15", "nampan pendek", "nampanpendek", "teakwood small tray kw1-tr 001"] },
  { sku: "RB404002", nama: "Nampan Panjang", kategori: "Kitchenware", alias: ["10475819", "3107245", "coffe box tray 31/15", "coffee box tray 31/15", "kwas coffe box tray 31*15 kw-tr003", "kwas wooden coffee box tray 31x15", "nampan panjang", "nampanpanjang", "teakwood long tray kw1-tr 002"] },
  { sku: "RB404003", nama: "Tray Bambu 40 cm", kategori: "Kitchenware", alias: ["3107246", "kwas rectangular bamboo tray classic 40x20", "kwas tray anyam bambu 40*20*5cm kw-tr002", "teakwood rectangle bamboo 40/20 kw-trb004", "tray bambu 40 cm", "traybambu40cm"] },
  { sku: "RB404004", nama: "Tray Bambu 45 cm", kategori: "Kitchenware", alias: ["kwas rectangular bamboo tray classic 45x25", "rectangle bamboo tray clasic 2 45/25", "rectangular bamboo tray", "teakwood rectangle bamboo 45/25 kw-trb003", "tray bambu 45 cm", "traybambu45cm"] }
];

export const KEYWORD_ALIASES = {
  "sendokoval": "RB103002",
  "talenanoval": "RB201001",
  "sendupsup": "RB103006",
  "talenangagang": "RB201003",
  "talenan13": "RB201005",
  "nampanpanjang": "RB404002",
  "traybambu": "RB404003",
  "strainer": "RB103011",
  "sendoktumpeng": "RB103009",
  "sendokpecel": "RB103004"
};
