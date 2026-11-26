// src/qc/help-text.js — Generator template FORM QC (Gaya 4) dan teks bantuan WhatsApp
import { QC_CRITERIA, MC_LIMITS } from "./dictionary.js";

function buildTemplateItemBlock(index) {
  return `[ITEM ${index}]
Barang   : 
Tahap    : Unfinish
Periksa  : 
MC %     : 

[Isi angka rusak, kosong = aman, "-" = T/B]
Ati         : 
Pulur       : 
Teter       : 
Mata Mati   : 
Bluestain   : 
Cutter Mark : 
Gerinda     : 
Serat Balik : 
Ukuran      : 
Kesikuan    : 
Doreng      : 
Warna       : 
Kehalusan   : 
Lubang      : 
Lainnya     : 

Catatan  : 
[Keputusan: Lolos / Bersyarat / Tolak]
Keputusan: `;
}

export function getQcTemplateText(itemCount = 4) {
  const count = Math.max(1, Math.min(20, parseInt(itemCount, 10) || 4));
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
    "📋 *14 KRITERIA QC KAYU (DOK. QC-WOOD-01)*",
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
  lines.push("• *Lainnya* — Cacat di luar 14 kriteria (contoh: `Retak ujung 5`)");
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
   • Untuk > 1 barang dalam 1 kunjungan, pisahkan dengan baris *---*

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
• *qc* / *#QC* — Kirim template FORM QC kosong (4 slot item)
• *#KRITERIA* — Daftar 14 kriteria & batas MC
• *#STATUS* — Cek koneksi bot & Google Apps Script

_Catatan: Nama produk & vendor bebas diketik langsung (tidak memakai database master)._`;
}
