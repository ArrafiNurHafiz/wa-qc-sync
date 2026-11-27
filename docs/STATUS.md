# Status Proyek — Automasi QC Lapangan KWaS (`wa-qc-sync`)

- **Mode Kerja:** Mode B (Pembaruan Fitur Terarah) — Reset Data, Grafik Sheets & Web, Database Master Produk/Vendor & Auto-Correct Siap Rilis
- **Fase Saat Ini:** Siap Release `v1.1.0` (GitHub Push & npm Publish)
- **Terakhir Diperbarui:** 2026-11-27

## Ringkasan Implementasi
1. **Konfigurasi & Packaging CLI Global:** [`package.json`](../package.json) (`type: module`, `bin: qc-kwas`, whitelist `files`, skrip `setup`/`doctor`/`start`/`web`/`test`), [`.npmrc`](../.npmrc) ter-track (`allow-git=all` untuk npm 12+), [`.env.example`](../.env.example), dan [`.gitignore`](../.gitignore).
2. **Domain Murni (`src/qc/`):** `dictionary.js` (66 SKU Raw Body resmi, 13 Vendor Pre-Finishing, 9 Vendor Finishing, 15 Kriteria `DOK. QC-WOOD-01`, `addProduct()`, `applyMasterData()`, `syncDictionaryFromWebhook()`), `matcher.js` (exact, fuzzy Levenshtein, `#OK` threshold `0.50–0.89`, auto-correct `>= 0.90`), `qc-validator.js` (validasi database + auto-correct, `Diperiksa -> Rusak -> Lolos`, MC `<= 15%`/`17%`), `qc-parser.js` (Gaya 4 `FORM QC`, multi-item `---`), dan `help-text.js`.
3. **Runtime, CLI Global & Cloud GAS (`src/runtime/`, `gas/Code_QC.gs`):** CLI global `qc-kwas` ([`cli.js`](../src/runtime/cli.js) + [`paths.js`](../src/runtime/paths.js)), Bot WhatsApp Baileys (`index.js`), mode web-only (`web-only.js`), `CorrectionStore`, `MessageQueue` atomic (`clear()` untuk reset), `gas-client.js`, serta `gas/Code_QC.gs` (`setupQcTemplate()`, subfolder terpisah `Laporan QC` di dalam `OUTPUT_FOLDER_ID`, `RESET_QC_DATA` / `resetAllQcData()`, `GRAFIK_QC` dengan 4 KPI cards & 3 charts, `DASHBOARD` otomatis terisi dari `VENDOR_MASTER`, `ADD_MASTER_PRODUCT` & `ADD_MASTER_VENDOR` dengan auto-seed `DB_Master` & `VENDOR_MASTER`).
4. **Web Command Center & Mobile Form (`src/web/server.js`, `public/`):** Server Express 5 pada port `3001`, UI 4-tab responsif (`Gateway WA`, `Input QC`, `Riwayat & Rekap` dengan 2 grafik SVG interaktif, `Pengaturan` dengan manajemen Master Data Barang/Vendor & tombol `Reset Semua Data QC`), serta endpoint `/api/master/products`, `/api/master/vendors`, dan `/api/qc/reset`.

## Pekerjaan Berikutnya (Aksi User di Lingkungan Produksi)
1. Salin versi terbaru `gas/Code_QC.gs` ke editor Google Apps Script, lalu pilih **Deploy → Manage deployments → Edit → New version** agar patch `formatCellDate()`, `assertNativeGoogleSheetTemplate()`, dan PDF `scale=4` (1 halaman A4) aktif di endpoint `/exec`.
2. Verifikasi hasil uji live (`QC-20261126-1795650198220`, PO `UJI-KONEKSI-001`) di folder Drive output — dapat di-`Void` lewat tab `Riwayat & Rekap` jika tidak ingin disimpan sebagai contoh.
3. Jalankan `npm start` lalu pindai QR WhatsApp pada tab `Gateway WA` atau terminal menggunakan nomor khusus bot QC.

## Known Issues / Batasan Verifikasi
- Endpoint GAS `/exec` telah diuji E2E dari browser (`UJI-KONEKSI-001` sukses menulis Google Sheet & PDF nyata di Drive). Namun PDF live yang dibuat sebelum patch `scale=4` masih berukuran 2 halaman, dan patch `gas/Code_QC.gs` (`scale=4`, `formatCellDate()`, `assertNativeGoogleSheetTemplate()`) baru aktif di live `/exec` setelah user membuat deployment versi baru di Apps Script.
- Gateway WhatsApp Baileys teruji di level handler & queue; koneksi WhatsApp nyata tetap membutuhkan pemindaian QR pada perangkat nomor QC oleh user.
