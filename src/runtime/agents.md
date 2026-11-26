# agents.md — src/runtime

## Peran Folder
Mengelola runtime aplikasi: bot WhatsApp Baileys, CLI global (`cli.js` + `paths.js`), persistensi sesi auth, konfigurasi lokal (`app-config.js`), store konfirmasi `#OK`, antrean offline (`message_queue.json`), dan klien HTTP GAS.

## Scope
- **Boleh:** Koneksi Baileys & pemrosesan `messages.upsert`, penyimpanan `auth_info_baileys/` & `message_queue.json`, retry 30 detik, HTTP request ke `GAS_QC_WEBHOOK_URL`.
- **Dilarang:** Menduplikasi aturan parsing/validasi QC (wajib panggil `src/qc`), mendefinisikan endpoint UI langsung tanpa melalui `src/web`, atau memodifikasi saldo `DASHBOARD_STOK` proyek `wa`.

## Dokumen Rujukan
- [`/home/arrafi/RAFI/agent.md`](/home/arrafi/RAFI/agent.md)
- [`../../PRD.md`](../../PRD.md) (FR-001 s.d. FR-003, FR-008, FR-010)
- [`../../docs/arsitektur/arsitektur.json`](../../docs/arsitektur/arsitektur.json)

## Interface (Kontrak)
Ekspor & entrypoint: `bootstrap()`, `startBot()`, `startWebOnly()`, `runCli()`, `resolveCliDataDir()`, `getDataDir()`, `appConfig`, `isChatAllowed()`, `MessageQueue`, `CorrectionStore`, `sendToGasWebhook()`, `checkGasStatus()`.

## Validasi Lokal (CLI)
- `node --test test/message-queue.test.js test/correction-store.test.js test/cli.test.js`

## Aturan Lokal
- Penulisan file state (`message_queue.json`, `config.json`) harus atomic atau tahan error; jangan pernah me-log secret/credential.
- Gunakan `PORT=3001` default agar tidak bentrok dengan proyek `wa`.

## Validasi Lokal
- `node --test test/message-queue.test.js test/correction-store.test.js`

## Agent Tetangga
| Agent | Folder | Hubungan | Delegasi |
|---|---|---|---|
| `qc-domain` | `src/qc` | Memanggil parser, matcher, validator | [`../qc/agents.md`](../qc/agents.md) |
| `web-api` | `src/web` | Meregistrasi kontrol bot & update QR/status | [`../web/agents.md`](../web/agents.md) |
| `gas-drive-writer` | `gas` | Mengirim payload JSON via GAS Webhook | [`../../gas/agents.md`](../../gas/agents.md) |

## Catatan Sinkronisasi
2026-11-26 | Acuan: `PRD.md@v1.1`, `arsitektur.json@v1.0.1`
