// src/qc/help-text.js — Generator template FORM QC (Gaya 4) dan teks bantuan WhatsApp
import { QC_CRITERIA, MC_LIMITS } from "./dictionary.js";

function buildTemplateItemBlock(index) {
  return `[ITEM ${index}]
Nama Barang   : 
Tahap    : Unfinish
Jumlah  : 
MC %     : 

[1. CACAT PERMUKAAN & SERAT]
Ati         : 
Pulur       : 
Teter       : 
Mata Mati   : 
Bluestain   : 
Cutter Mark : 
Gerinda     : 
Serat Balik : 

[2. TOLERANSI & PRESISI KONSTRUKSI]
Ukuran      : 
Kesikuan    : 
Doreng      : 
Crack       : 

[3. KUALITAS AKHIR (SIAP KIRIM)]
Warna       : 
Kehalusan   : 
Lubang      : 
Lainnya     : 

Catatan  : 
Keputusan: Lolos / Bersyarat / Tolak`;
}

export function getQcItemTemplateText(itemNumber = 2) {
  const num = Math.max(1, parseInt(itemNumber, 10) || 2);
  return buildTemplateItemBlock(num);
}

export function getQcTemplateText(itemCount = 1) {
  const count = Math.max(1, Math.min(20, parseInt(itemCount, 10) || 1));
  const itemBlocks = [];
  for (let i = 1; i <= count; i++) {
    itemBlocks.push(buildTemplateItemBlock(i));
  }

  return `FORM QC
Vendor   : 
PO       : 

${itemBlocks.join("\n---\n")}`;
}

export function getCriteriaText() {
  const grouped = new Map();
  for (const c of QC_CRITERIA) {
    if (!grouped.has(c.group)) grouped.set(c.group, []);
    grouped.get(c.group).push(c);
  }

  const lines = [
    "📋 *15 KRITERIA QC KAYU (DOK. QC-WOOD-01)*",
    "━━━━━━━━━━━━━━━━━━━━",
    ""
  ];

  for (const [group, items] of grouped.entries()) {
    lines.push(`*${group}:*`);
    for (const it of items) {
      lines.push(`• *${it.shortLabel}* — ${it.label}`);
    }
    lines.push("");
  }

  lines.push("*Kategori Tambahan:*");
  lines.push("• *Lainnya* — Cacat di luar 15 kriteria (contoh: `Retak ujung 5`)");
  lines.push("");
  lines.push("*Standar Kadar Air (MC):*");
  lines.push(`• Unfinish / Mentah: ≤ ${MC_LIMITS.Unfinish}%`);
  lines.push(`• Finish / Jadi: ≤ ${MC_LIMITS.Finish}%`);
  lines.push("");
  lines.push("_Di template FORM QC, isi angka rusak pada baris yang bermasalah. Baris kosong = aman (✓), tanda `-` = tidak berlaku._");

  return lines.join("\n");
}

export function getHelpText(productCount = 66) {
  return `🪵 *PANDUAN QC LAPANGAN KWaS (GAYA 4)*
━━━━━━━━━━━━━━━━━━━━

1️⃣ Ketik *qc* (atau *#QC*) untuk meminta template *FORM QC*.
2️⃣ Salin template tersebut, lalu isi:
   • *Vendor*, *PO*, *Barang*, *Tahap* (Unfinish/Finish), *Periksa*, *MC %*
   • Isi *angka pcs rusak* pada baris kerusakan yang ditemukan
   • Baris aman biarkan kosong (atau boleh dihapus)
   • Baris tidak berlaku isi *-* atau *NA*
   • Untuk lanjut ke item berikutnya pada laporan yang sama, kirim mulai *[ITEM 2]* (atau ketik *qc2*)
   • Untuk membuat laporan kunjungan baru, kirim *FORM QC* baru (atau ketik *qc*)

📌 *Contoh Singkat:*
FORM QC
Vendor   : Londo
PO       : PO-2026-112
Barang   : Sendok Oval
Tahap    : Unfinish
Periksa  : 1000
MC %     : 13.5
Bluestain   : 30
Cutter Mark : 20
Catatan  : 50 pcs disortir rework
Keputusan: Bersyarat

Sistem otomatis menghitung *Total Rusak = 50* & *Lolos = 950*, memakai *Keputusan* manual Anda (atau otomatis bila dikosongkan), lalu menyimpan form ke Google Drive.

🧭 *Perintah Bantuan:*
• *qc* / *#QC* — Kirim template FORM QC kosong (Item 1)
• *qc2* — Kirim template lanjutan [ITEM 2] untuk kunjungan yang sama
• *#QCPRODUK* — Daftar produk resmi di database
• *#QCVENDOR* — Daftar vendor rekanan di database
• *#QCKRITERIA* — Daftar 15 kriteria & batas MC
• *#QCSTATUS* — Cek koneksi bot & Google Apps Script
• *#QCGROUPID* — Cek ID grup untuk whitelist

_Catatan: Nama produk & vendor divalidasi terhadap database (typo ringan dikoreksi otomatis, typo sedang konfirmasi via *#OKQC*)._`;
}
