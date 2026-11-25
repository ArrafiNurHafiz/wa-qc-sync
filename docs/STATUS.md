# Status Proyek — Automasi QC Lapangan KWaS (`wa-qc-sync`)

- **Mode Kerja:** Mode A (Proyek Baru)
- **Fase Saat Ini:** Akhir Fase Perencanaan (Mode A) — Dokumen dirapikan hanya file penting, menunggu persetujuan implementasi kode.
- **Terakhir Diperbarui:** 2026-11-26

## Keputusan Terakhir
1. Folder referensi dirapikan ke `docs/referensi/Form Lap QC Lap-cetak.xlsx`.
2. Jenis kerusakan mengacu pada 14 kriteria standar form `DOK. QC-WOOD-01` + `Lainnya`.
3. Output Drive default menggunakan 1 file salinan Google Sheet form `DOK. QC-WOOD-01` per kunjungan/PO (+ opsi salinan PDF) + Spreadsheet Rekap Pusat (`REKAP_QC_KUNJUNGAN`, `REKAP_QC_DETAIL_ITEM`, `LOG_KERUSAKAN`) via Google Apps Script.
4. Arsitektur mengadaptasi `/home/arrafi/Proyek/wa` (Node.js ESM, Baileys, Express 5 pada port `3001`, `fastest-levenshtein`, `message_queue.json`, GAS Webhook) tanpa memodifikasi saldo `DASHBOARD_STOK` proyek `wa` di v1.
5. Visualisasi arsitektur di `docs/arsitektur/arsitektur.html` dibuat dan divalidasi memakai **Archify (`tt-a1i/archify` v3.3.2)**.

## Pekerjaan Tertunda (Berikutnya Setelah Persetujuan)
1. Inisialisasi `package.json`, `.env.example`, `.gitignore`, dan instalasi dependensi (`npm install`).
2. Implementasi & test `src/qc` (dictionary, matcher, qc-validator, qc-parser, help-text).
3. Implementasi & test `src/runtime` & `src/web` + `public` + `gas/Code_QC.gs`.
4. Verifikasi berlapis (unit test 2x, API, uji browser nyata, dan update `docs/test_matrix.md`).

## Known Issues
- Belum ada kode runtime maupun `package.json`; seluruh skrip di `arsitektur.json -> run_commands` akan diaktifkan pada langkah awal implementasi.
