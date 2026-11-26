# Status Proyek — Automasi QC Lapangan KWaS (`wa-qc-sync`)

- **Mode Kerja:** Mode A (Proyek Baru) — Implementasi & Integrasi Live GAS Drive/Sheets Terverifikasi (Menunggu Re-deploy Patch GAS & Pairing QR WA)
- **Fase Saat Ini:** Pasca-Implementasi, Integrasi Live GAS Web App Teruji, Verifikasi Akhir
- **Terakhir Diperbarui:** 2026-11-26

## Ringkasan Implementasi
1. **Konfigurasi & Packaging CLI Global:** [`package.json`](../package.json) (`type: module`, `bin: wa-qc-sync`, whitelist `files`, skrip `setup`/`doctor`/`start`/`web`/`test`), [`.npmrc`](../.npmrc) ter-track (`allow-git=all` untuk npm 12+), [`.env.example`](../.env.example), dan [`.gitignore`](../.gitignore).
2. **Domain Murni (`src/qc/`):** `dictionary.js` (66 SKU Raw Body, 14 Vendor Pre, 9 Vendor Fin, 14 Kriteria `DOK. QC-WOOD-01` + `syncDictionaryFromWebhook()`), `matcher.js` (exact, buyer alias, fuzzy Levenshtein, `#OK` threshold `0.50–0.89`, fallback `Lainnya`), `qc-validator.js` (`Diperiksa -> Rusak -> Lolos`, MC `<= 15%`/`17%`, konsistensi keputusan), `qc-parser.js` (Gaya 4 `FORM QC`, multi-item `---`, hapus baris kosong, `-`/`NA`), dan `help-text.js`.
3. **Runtime, CLI Global & Cloud GAS (`src/runtime/`, `gas/Code_QC.gs`):** CLI global `wa-qc-sync` ([`cli.js`](../src/runtime/cli.js) + [`paths.js`](../src/runtime/paths.js): `start`, `web`, `setup`, `doctor` dengan penyimpanan data otomatis di `~/.wa-qc-sync` saat dijalankan global agar terisolasi dari proyek `wa`), Bot WhatsApp Baileys (`index.js`), mode web-only (`web-only.js`), `CorrectionStore`, `MessageQueue` atomic (`message_queue.json`, retry 30s), `gas-client.js`, serta `gas/Code_QC.gs` (`setupQcTemplate()`, validasi template native Google Sheets via `assertNativeGoogleSheetTemplate()`, auto-create `"REKAP QC PUSAT — KWaS"`, `LOG_QC_REPORT` multi-tab `> 4` item, PDF export `scale=4`, `REKAP_QC_*`, `LOG_KERUSAKAN`, `formatCellDate()`, `VOID_QC_REPORT`).
4. **Web Command Center & Mobile Form (`src/web/server.js`, `public/`):** Server Express 5 pada port `3001` dan UI 4-tab responsif (`Gateway WA`, `Input QC`, `Riwayat & Rekap`, `Pengaturan`) berbasis token `design_system.md` v1.0, lengkap dengan `formatDisplayDate()` pada riwayat & modal detail.

## Pekerjaan Berikutnya (Aksi User di Lingkungan Produksi)
1. Salin versi terbaru `gas/Code_QC.gs` ke editor Google Apps Script, lalu pilih **Deploy → Manage deployments → Edit → New version** agar patch `formatCellDate()`, `assertNativeGoogleSheetTemplate()`, dan PDF `scale=4` (1 halaman A4) aktif di endpoint `/exec`.
2. Verifikasi hasil uji live (`QC-20261126-1795650198220`, PO `UJI-KONEKSI-001`) di folder Drive output — dapat di-`Void` lewat tab `Riwayat & Rekap` jika tidak ingin disimpan sebagai contoh.
3. Jalankan `npm start` lalu pindai QR WhatsApp pada tab `Gateway WA` atau terminal menggunakan nomor khusus bot QC.

## Known Issues / Batasan Verifikasi
- Endpoint GAS `/exec` telah diuji E2E dari browser (`UJI-KONEKSI-001` sukses menulis Google Sheet & PDF nyata di Drive). Namun PDF live yang dibuat sebelum patch `scale=4` masih berukuran 2 halaman, dan patch `gas/Code_QC.gs` (`scale=4`, `formatCellDate()`, `assertNativeGoogleSheetTemplate()`) baru aktif di live `/exec` setelah user membuat deployment versi baru di Apps Script.
- Gateway WhatsApp Baileys teruji di level handler & queue; koneksi WhatsApp nyata tetap membutuhkan pemindaian QR pada perangkat nomor QC oleh user.
