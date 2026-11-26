# agents.md — gas

## Peran Folder
Menampung Google Apps Script Web App (`Code_QC.gs`) yang dijalankan di Google Workspace untuk menulis form `DOK. QC-WOOD-01` ke Google Drive dan merekap data QC ke Google Sheets.

## Scope
- **Boleh:** `doGet`/`doPost` dengan `LockService`, `setupQcTemplate()`, duplikasi template Drive `Form QC Lap`, exact cell mapping `DOK. QC-WOOD-01`, ekspor PDF Drive, tulis `REKAP_QC_*`, `LOG_KERUSAKAN`, dan `VOID_QC_REPORT`.
- **Dilarang:** Menyimpan credential sensitif secara hardcoded di repo; memanggil API eksternal tanpa izin atau mengubah sheet milik proyek `wa` (`DASHBOARD_STOK`).

## Dokumen Rujukan
- [`/home/arrafi/RAFI/agent.md`](/home/arrafi/RAFI/agent.md)
- [`../PRD.md`](../PRD.md) (FR-005, FR-006, FR-007, FR-008, FR-010, FR-011)
- [`../docs/referensi/Form Lap QC Lap-cetak.xlsx`](../docs/referensi/Form%20Lap%20QC%20Lap-cetak.xlsx)
- [`../docs/arsitektur/arsitektur.json`](../docs/arsitektur/arsitektur.json)
- [`../docs/arsitektur/kontrak_api.md`](../docs/arsitektur/kontrak_api.md)
- [`../docs/panduan/setup_gas_drive.md`](../docs/panduan/setup_gas_drive.md)

## Interface (Kontrak)
Webhook actions: `doGet(e)`, `doPost(e)` (`LOG_QC_REPORT`, `GET_QC_DASHBOARD`, `VOID_QC_REPORT`, `GET_MASTER_DATA`) + fungsi manual `setupQcTemplate()`.

## Aturan Lokal
- Pastikan `LockService.getScriptLock()` selalu dilepas di blok `finally`.
- Cek `idempotencyKey` / `noLaporan` sebelum `makeCopy()` agar retry tidak membuat file ganda di Google Drive.

## Validasi Lokal
- Verifikasi sintaks & kontrak payload mock terhadap `src/runtime` dan review manual cell mapping terhadap `Form Lap QC Lap-cetak.xlsx`.

## Agent Tetangga
| Agent | Folder | Hubungan | Delegasi |
|---|---|---|---|
| `runtime-gateway` | `src/runtime` | Pengirim payload laporan & sync master | [`../src/runtime/agents.md`](../src/runtime/agents.md) |
| `web-api` | `src/web` | Pengirim request dashboard, submit, & void | [`../src/web/agents.md`](../src/web/agents.md) |

## Catatan Sinkronisasi
2026-11-26 | Acuan: `PRD.md@v1.1`, `arsitektur.json@v1.0.1`
