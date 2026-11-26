# Ringkasan Wawancara Kebutuhan — Automasi QC Lapangan KWaS

Tanggal: 2026-11-26 | Mode: A (Proyek Baru) | Status: Terdokumentasi untuk Persetujuan Fase Perencanaan

---

## 1. Konteks & Referensi Proyek
- **Perusahaan:** CV Karya Wahana Sentosa (KWaS) — produksi & subkontraktor wooden kitchenware.
- **Dokumen Form Asli:** [`docs/referensi/Form Lap QC Lap-cetak.xlsx`](referensi/Form%20Lap%20QC%20Lap-cetak.xlsx) (`DOK. QC-WOOD-01`, Rev. 2026-08).
- **Sistem Acuan Arsitektur:** [`/home/arrafi/Proyek/wa`](../../wa) (`wa-sheets-sync` — Node.js ESM, `@whiskeysockets/baileys`, Express 5, `fastest-levenshtein`, `message_queue.json`, Google Apps Script Webhook).

---

## 2. Keputusan & Kebutuhan Hasil Wawancara

| # | Topik | Hasil / Jawaban User |
|---|---|---|
| 1 | **Tujuan utama** | Membuat automasi QC Lapangan mirip pola proyek `wa`, dengan output dokumen yang mengikuti bentuk form Excel referensi dan tersimpan di **Google Drive** melalui **Google Apps Script**. |
| 2 | **Alur kasus nyata** | Saat menerima barang dari supplier/vendor (contoh: `1.000 pcs` diperiksa) → dicatat **jumlah kerusakan** dan **jenis kerusakannya apa** → dicatat/dihitung **berapa yang lolos** → seluruh hasil ditulis ke Google Drive melalui Apps Script. |
| 3 | **Daftar jenis kerusakan** | Dikonfirmasi mengacu pada **14 kriteria standar di `Form Lap QC Lap-cetak.xlsx`** (8 cacat permukaan/serat, 3 toleransi/presisi, 3 kualitas akhir) ditambah kategori **`Lainnya`** untuk catatan bebas. |
| 4 | **Struktur output di Google Drive** | User belum memiliki gambaran baku → ditetapkan asumsi default yang *reversibel* di `PRD.md` (1 file salinan Google Sheet form `DOK. QC-WOOD-01` terisi per kunjungan/PO + opsi salinan PDF di folder Drive + 1 Spreadsheet Rekap Master untuk rekapitulasi angka bulanan). |
| 5 | **Kerapian folder dokumen** | User menyetujui merapikan folder `dosc/` menjadi `docs/referensi/`. |

---

## 3. Asumsi & Keputusan UX yang Ditetapkan ke `PRD.md`
1. **Dual-Input (WA Lapangan + Web Kantor):**
   - **WhatsApp (`Gaya 4 — FORM QC`):** Disesuaikan ulang pada sesi lanjutan (`2026-11-26`) karena petugas di lokasi vendor memakai kuota seluler dan menolak format `#KODE | ...` atau hafalan nama cacat. Petugas cukup ketik `qc` → bot balas template `FORM QC` berisi 14 kriteria → petugas salin & isi angka pada jenis yang rusak saja.
   - **Web & Mobile Form (`:3001`):** Digunakan untuk admin/tim QA di jaringan kantor (atau via tunnel bila diaktifkan) untuk input detail, pemantauan riwayat, dan aksi Void.
2. **Pemisahan dengan Sistem Stok `wa`:** Pada v1, automasi QC tidak langsung memotong/menambah saldo `DASHBOARD_STOK` proyek `wa` untuk mencegah *double entry* dengan laporan `#PRE`/`#FIN`/`#REJECT` mandor.
3. **Output Drive Terstruktur & Reversibel:** Default menghasilkan 1 Google Sheet terisi per kunjungan/PO (berdasarkan template `Form QC Lap` yang diunggah ke Drive) + ekspor PDF (`GENERATE_PDF=true`, dapat dimatikan via konfigurasi GAS) + 1 baris rekap di Spreadsheet Pusat (`REKAP_QC`).
4. **Master Data Bersama:** Menggunakan master 66+ SKU Raw Body dan daftar vendor KWaS yang sama dengan proyek `wa`, serta mendukung sinkronisasi dinamis dari Google Sheets.
