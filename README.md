# Automasi QC Lapangan KWaS (`wa-qc-sync`)

> Digitalisasi pemeriksaan kualitas (*Quality Control*) barang kayu **CV Karya Wahana Sentosa (KWaS)** via **WhatsApp (`Gaya 4 — FORM QC`)** dan **Web Command Center (`:3001`)** ke **Google Drive (`DOK. QC-WOOD-01`)** & **Google Sheets Rekap Pusat**.

**Status Proyek:** Implementasi v1.0.0 selesai dan terverifikasi (`35/35` unit, kontrak GAS, CLI, & API test + uji browser Chrome nyata + uji live Drive/Sheets). Lihat [docs/STATUS.md](docs/STATUS.md) dan [docs/panduan/setup_gas_drive.md](docs/panduan/setup_gas_drive.md) untuk pemasangan ke Google Workspace KWaS.

---

## 1. Peta Dokumen Proyek

| Kategori | Berkas | Kegunaan |
|---|---|---|
| **Kebutuhan Produk** | [PRD.md](PRD.md) | Scope, FR-001 s.d. FR-011, NFR-001 s.d. NFR-006, model data, dan kriteria sukses (`v1.1`) |
| **Desain UI** | [design_system.md](design_system.md) | Token CSS 3 lapis, spesifikasi komponen Web/Mobile Form, aksesibilitas (`v1.0`) |
| **Panduan User** | [docs/panduan/panduan_input_user.md](docs/panduan/panduan_input_user.md) | Template `FORM QC` Gaya 4 di WhatsApp, perintah bantu, validasi, & Web Form |
| **Panduan Setup Cloud** | [docs/panduan/setup_gas_drive.md](docs/panduan/setup_gas_drive.md) | Unggah template Excel, `setupQcTemplate()`, deploy GAS Web App, & `.env` |
| **Diagram Alur Input** | [docs/flow/flow_input_qc.html](docs/flow/flow_input_qc.html) | Visualisasi alur lapangan → validasi → Google Drive via Archify |
| **Arsitektur & Kontrak** | [docs/arsitektur/arsitektur.md](docs/arsitektur/arsitektur.md) | Keputusan arsitektur (ADR-001..004) & trade-off |
| **Diagram Arsitektur** | [docs/arsitektur/arsitektur.html](docs/arsitektur/arsitektur.html) | Visualisasi modul & batas jaringan via Archify |
| **Sumber Struktur** | [docs/arsitektur/arsitektur.json](docs/arsitektur/arsitektur.json) | Sumber kebenaran terstruktur modul, layer, dependensi, & `run_commands` |
| **Kontrak API & Sel** | [docs/arsitektur/kontrak_api.md](docs/arsitektur/kontrak_api.md) | Endpoint Express `:3001`, payload GAS Webhook, & mapping sel `DOK. QC-WOOD-01` |
| **Form Referensi** | [docs/referensi/Form Lap QC Lap-cetak.xlsx](docs/referensi/Form%20Lap%20QC%20Lap-cetak.xlsx) | Template cetak resmi KWaS (`DOK. QC-WOOD-01`, `REV. 2026-08`) |
| **Tracking & Kualitas** | [docs/STATUS.md](docs/STATUS.md), [docs/interview_notes.md](docs/interview_notes.md), [docs/test_matrix.md](docs/test_matrix.md), [docs/error_log.md](docs/error_log.md), [docs/agent_requests.md](docs/agent_requests.md) | Status sesi, catatan wawancara, cakupan test, log error, & permintaan lintas modul |

---

## 2. Struktur Direktori

```text
wa-qc-sync/
├── README.md                         # Dokumen ringkasan utama proyek ini
├── PRD.md                            # Product Requirements Document (v1.1)
├── design_system.md                  # Design System & Token UI (v1.0)
├── docs/
│   ├── STATUS.md                     # Status proyek & pekerjaan tertunda
│   ├── interview_notes.md            # Ringkasan wawancara & revisi UX Gaya 4
│   ├── agent_requests.md             # Log permintaan lintas-agent
│   ├── error_log.md                  # Catatan error & regression test
│   ├── test_matrix.md                # Pemetaan FR/NFR ke test otomatis
│   ├── arsitektur/                   # Arsitektur terstruktur, visualisasi Archify, & kontrak API
│   ├── flow/                         # Diagram alur input user (Archify)
│   ├── panduan/                      # Panduan input WhatsApp/Web & setup GAS/Drive
│   └── referensi/                    # Form Excel referensi DOK. QC-WOOD-01
├── gas/agents.md                     # Kontrak modul Google Apps Script (Code_QC.gs)
├── public/agents.md                  # Kontrak modul UI Web & Mobile Form
└── src/
    ├── qc/agents.md                  # Kontrak domain murni (kamus, matcher, validator, parser)
    ├── runtime/agents.md             # Kontrak runtime WhatsApp Baileys, queue, & klien GAS
    └── web/agents.md                 # Kontrak server Express 5 (:3001)
```

---

## 3. Isolasi dengan Proyek `/home/arrafi/Proyek/wa`
- **Port terpisah:** Web Command Center `wa-qc-sync` berjalan di port **`3001`** (proyek `wa` di `3000`).
- **Sesi WA terpisah:** Direktori `auth_info_baileys/` dan `config.json` terisolasi (gunakan nomor WA khusus QC atau jalankan hanya satu instans per nomor WA).
- **Tidak menyentuh `DASHBOARD_STOK`:** Di v1, laporan QC hanya menulis file `DOK. QC-WOOD-01` ke Google Drive dan Spreadsheet Rekap QC terpisah (`REKAP_QC_KUNJUNGAN`, `REKAP_QC_DETAIL_ITEM`, `LOG_KERUSAKAN`) agar tidak terjadi *double entry* dengan laporan mandor (`#PRE`/`#FIN`/`#REJECT`).

---

## 4. Cara Install & Menjalankan (`npm i` / CLI Global `wa-qc-sync`)

### Prasyarat
- **Node.js `18+`** dan **npm** (paket ini memakai `@whiskeysockets/baileys` `6.7.x` yang menarik `libsignal` dari GitHub, sehingga [`.npmrc`](.npmrc) menyertakan `allow-git=all` untuk npm v12+).
- Akun Google Workspace dengan Apps Script Web App ([`gas/Code_QC.gs`](gas/Code_QC.gs)).

### Opsi A — Install Global CLI (`wa-qc-sync`)
1. Dari GitHub langsung (membutuhkan `--allow-git=all` pada npm v12+ karena dependensi `libsignal` pada Baileys 6.x):
   ```bash
   npm install -g --allow-git=all github:ArrafiNurHafiz/wa-qc-sync
   ```
   *(Atau jika dari dalam folder proyek yang sudah di-clone, cukup `npm install -g .` karena `.npmrc` sudah menyertakan `allow-git=all`.)*
2. Jalankan wizard setup awal & diagnostik dari folder mana pun:
   ```bash
   wa-qc-sync setup
   wa-qc-sync doctor
   ```
3. Jalankan aplikasi:
   ```bash
   wa-qc-sync          # Bot WhatsApp + Web Command Center (:3001)
   wa-qc-sync web      # Web Command Center saja (tanpa koneksi WA)
   ```
   Saat dijalankan sebagai CLI global di luar folder proyek, sesi WhatsApp (`auth_info_baileys/`), `.env`, `config.json`, dan `message_queue.json` otomatis disimpan rapi di `~/.wa-qc-sync` (bisa diubah via `--data-dir <folder>` atau env `WA_QC_HOME`) sehingga tidak bentrok dengan proyek lain.

### Opsi B — Jalankan Langsung di Folder Proyek
- `npm install` — memasang dependensi (otomatis memakai `.npmrc` `allow-git=all`).
- `npm run setup` — wizard mengisi `.env` & `config.json` (atau isi manual dari `.env.example` / tab **Pengaturan** Web UI).
- `npm run doctor` — memeriksa kesiapan Node, port `3001`, queue, & GAS Webhook.
- `npm start` — menjalankan Bot WhatsApp + Web Console (`:3001`).
- `npm run web` — menjalankan Web Console saja untuk input/uji tanpa koneksi WA.
- `npm test` — menjalankan unit, kontrak GAS, CLI, & API test (`node --test test/*.test.js`).
