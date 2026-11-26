# Arsitektur Sistem — Automasi QC Lapangan KWaS (`wa-qc-sync`)

Versi: 1.0.1 | Tanggal: 2026-11-26 | Acuan: [`PRD.md`](../../PRD.md) · [`arsitektur.json`](arsitektur.json) · [`kontrak_api.md`](kontrak_api.md) · Visualisasi Interaktif Archify: [`arsitektur.html`](arsitektur.html) (sumber IR: [`arsitektur.archify.json`](arsitektur.archify.json))

---

## 1. Ringkasan Arsitektur
Sistem memakai pola **Modular Chat-Ops & Web Console** yang mengadaptasi [`/home/arrafi/Proyek/wa`](../../../wa), dengan pemisahan ketat antara:
1. **Domain Murni (`src/qc`):** Logika kamus SKU/Vendor/Kriteria, fuzzy matching (`fastest-levenshtein`), validasi aturan QC (`Diperiksa` → `Rusak[]` → `Lolos`, ambang MC `≤ 15%`/`17%`), serta generator & parser template WhatsApp `FORM QC` (`Gaya 4`).
2. **Runtime & Gateway (`src/runtime`):** Koneksi WhatsApp Baileys, persistensi auth, konfirmasi koreksi `#OK`, antrean offline persisten `message_queue.json` (retry 30 detik), dan klien HTTP ke Apps Script.
3. **Web API & UI (`src/web`, `public`):** Server Express 5 pada port `3001` yang menyediakan dashboard admin, QR pairing, form input QC mobile-friendly, daftar riwayat dengan tautan langsung ke file Google Drive, serta kontrol Void.
4. **Cloud Writer (`gas/Code_QC.gs`):** Google Apps Script Web App yang menulis hasil pemeriksaan langsung ke salinan template `Form QC Lap` (`DOK. QC-WOOD-01`) di Google Drive dan memperbarui Spreadsheet Rekap Master.

---

## 2. Keputusan Arsitektur & Trade-Off

### ADR-001: Konsistensi Stack dengan Proyek `wa`
- **Pilihan:** Node.js 18+ (ESM), `@whiskeysockets/baileys`, Express 5, `fastest-levenshtein`, `axios`, `node --test`.
- **Trade-off:** Memakai stack yang sudah berjalan di KWaS memungkinkan pemakaian ulang master data dan pola pemeliharaan yang sama.

### ADR-002: Output Form di Google Drive via Apps Script (`makeCopy` + Cell Mapping)
- **Pilihan:** Apps Script menyalin Master Template Spreadsheet (`Form QC Lap`) per kunjungan ke folder Drive target dan mengisi sel form secara langsung (plus ekspor PDF opsional dan log baris ke Spreadsheet Rekap Pusat).
- **Catatan teknis:** Karena unggahan `.xlsx` ke Google Sheets mengubah checkbox Excel 365 menjadi `FALSE`, `Code_QC.gs` menyediakan `setupQcTemplate()` untuk mengonversi checkbox ke native Google Sheets checkbox dan merapikan page setup.

### ADR-003: Pemisahan `src/qc` sebagai Pure Domain Layer
- **Pilihan:** Memisahkan parser, matcher, dan validator dari Baileys & Express agar alur WhatsApp dan Web Form berbagi validasi identik dan mudah diuji via `node --test`.

### ADR-004: Isolasi Port (`3001`) & Pemisahan Saldo Stok di v1
- **Pilihan:** Port default `3001` dan tidak otomatis memotong/menambah saldo `DASHBOARD_STOK` proyek `wa` agar aman dari konflik sesi dan *double entry*.

---

## 3. Catatan `run_commands` & Generasi Diagram Archify
- `package.json` akan dibuat pada awal Fase Implementasi; nilai pada `arsitektur.json → run_commands` mengikuti pola [`/home/arrafi/Proyek/wa/package.json`](../../../wa/package.json).
- Visualisasi [`arsitektur.html`](arsitektur.html) dibuat dan divalidasi dengan **Archify (`tt-a1i/archify` v3.3.2)** via `finalize --quality showcase`.
