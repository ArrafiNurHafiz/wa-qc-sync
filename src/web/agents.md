# agents.md — src/web

## Peran Folder
Menyediakan HTTP API dan static file server Express 5 (port default `3001`) untuk Web Command Center dan Mobile QC Form.

## Scope
- **Boleh:** Routing API `/api/wa/*`, `/api/qc/*`, `/api/master`, `/api/config*`, validasi request server-side dengan `src/qc`, pemanggilan GAS via `src/runtime`, serta penyajian aset `public/`.
- **Dilarang:** Menyimpan aturan bisnis QC duplikat di route handler, atau memanggil file Google Drive langsung tanpa melalui endpoint kontrak `gas`.

## Dokumen Rujukan
- [`/home/arrafi/RAFI/agent.md`](/home/arrafi/RAFI/agent.md)
- [`../../PRD.md`](../../PRD.md) (FR-004, FR-008, FR-009, FR-010, FR-011)
- [`../../docs/arsitektur/arsitektur.json`](../../docs/arsitektur/arsitektur.json)

## Interface (Kontrak)
Ekspor: `startWebServer()`, `updateWebQR()`, `updateWebStatus()`, `registerBotControls()`, `notifyDataMutation()`.

## Aturan Lokal
- Validasi payload di server sebelum memanggil GAS; jangan bocorkan stack trace ke respons JSON klien.
- Jika submit form QC gagal karena gangguan jaringan/GAS 5xx, simpan ke `MessageQueue` dan balas status `queued` yang jelas.

## Validasi Lokal
- `node --test test/web-api.test.js`

## Agent Tetangga
| Agent | Folder | Hubungan | Delegasi |
|---|---|---|---|
| `qc-domain` | `src/qc` | Validasi input form & kamus master | [`../qc/agents.md`](../qc/agents.md) |
| `runtime-gateway` | `src/runtime` | Kontrol bot, `appConfig`, `MessageQueue`, GAS client | [`../runtime/agents.md`](../runtime/agents.md) |
| `web-ui` | `public` | Konsumen API & aset HTML/CSS/JS | [`../../public/agents.md`](../../public/agents.md) |
| `gas-drive-writer` | `gas` | Target aksi dashboard, log QC, & void | [`../../gas/agents.md`](../../gas/agents.md) |

## Catatan Sinkronisasi
2026-11-26 | Acuan: `PRD.md@v1.0`, `arsitektur.json@v1.0.0`
