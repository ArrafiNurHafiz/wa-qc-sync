# Error Log — Automasi QC Lapangan KWaS (`wa-qc-sync`)

> Catat seluruh error yang ditemukan selama implementasi/pengujian beserta akar masalah, perbaikan, regression test, dan pencegahan sesuai `agent.md` Bagian 12.5.

## ERR-001 | 2026-11-26 | E4 | Modul: package.json / .npmrc | NFR-006
- Gejala: `npm install` gagal dengan `EALLOWGIT: Refusing to fetch "libsignal@git+https://github.com/whiskeysockets/libsignal-node.git"` pada npm v12 | Akar masalah: kebijakan default npm 12 menolak dependensi git tanpa `.npmrc` lokal | Perbaikan: tambahkan `.npmrc` dengan `allow-git=all` (sesuai `.gitignore`) & catat di `README.md` (`package.json`, `.npmrc`, `README.md`)
- Pencegahan: verifikasi `npm install` di lingkungan bersih & dokumentasikan syarat `.npmrc` untuk clone baru | Putaran fix: 1 | Status: resolved

## ERR-002 | 2026-11-26 | E3 | Modul: public/app.js | FR-009
- Gejala: (1) Memilih kriteria di `.defect-crit-select` meruntuhkan DOM row akibat pemanggilan penuh `renderQcItems()`; (2) `pollWaStatus()` memicu `GET /api/qc/reports?fresh=1` saat `gasConnected === false` sehingga menimbulkan HTTP 400 di console browser | Akar masalah: update state dropdown & status koneksi belum terisolasi dari teardown DOM dan guard koneksi GAS | Perbaikan: ubah handler `.defect-crit-select` dan `.crit-toggle` memakai pembaruan DOM in-place (`syncCriterionToggleDom`, `updateItemLiveDisplay`), tambahkan guard `state.gasConnected` di `pollWaStatus()`/`loadReports()`, serta clear inline error `#qcVendor` saat user mengetik (`public/app.js`, `public/style.css`)
- Pencegahan: verifikasi interaksi DOM nyata di Chrome CDP (desktop `1280px` & mobile `375px`) dengan pemantauan zero console/HTTP errors | Putaran fix: 1 | Status: resolved

## ERR-003 | 2026-11-26 | E3 | Modul: gas/Code_QC.gs & public/app.js | FR-009
- Gejala: Google Sheets mengkoersi string tanggal `"26/11/2026"` yang ditulis via `appendRow()` menjadi objek `Date`, sehingga respons `GET_QC_DASHBOARD` mengembalikan string JS `Date` panjang (`Thu Nov 26 2026 ... GMT+0700`) di tabel dan modal `Riwayat & Rekap` | Akar masalah: `handleGetQcDashboard()` hanya memanggil `String(...)` atas nilai sel tanggal dan UI langsung menampilkan `r.tanggal` tanpa normalisasi | Perbaikan: tambahkan `formatCellDate()` di `gas/Code_QC.gs` (`dd/MM/yyyy`) serta `formatDisplayDate()` di `public/app.js` agar baris lama maupun baru konsisten tampil `dd/MM/yyyy` (`gas/Code_QC.gs`, `public/app.js`, `test/gas-contract.test.js`)
- Pencegahan: regression test objek `Date` pada `GET_QC_DASHBOARD` di `test/gas-contract.test.js` dan verifikasi live Chrome CDP pada tab `Riwayat & Rekap` (`26/11/2026`) | Putaran fix: 1 | Status: resolved (UI aktif; perbaikan GAS aktif setelah user re-deploy versi baru)

## ERR-004 | 2026-11-26 | E2 | Modul: gas/Code_QC.gs | NFR-005
- Gejala: Ekspor PDF nyata pada Google Sheet hasil uji live menghasilkan `2` halaman alih-alih `1` halaman A4 Portrait | Akar masalah: URL `/export?format=pdf` hanya memakai `fitw=true` dan margin `0.35`, sehingga form `39` baris terpotong ke halaman ke-2 | Perbaikan: ubah parameter menjadi `scale=4` (fit to page) dan margin `0.25` di `exportSpreadsheetToPdf()` (`gas/Code_QC.gs`, `test/gas-contract.test.js`)
- Pencegahan: verifikasi query parameter URL ekspor PDF lewat unit test `test/gas-contract.test.js` dan uji ulang jumlah halaman PDF setelah user memperbarui deployment GAS | Putaran fix: 1 | Status: mitigated (menunggu user memperbarui deployment Web App GAS)
