# agents.md — public

## Peran Folder
Menyajikan antarmuka Web Command Center dan Mobile QC Input Form berbasis HTML/CSS/JS murni tanpa build step.

## Scope
- **Boleh:** Tampilan Gateway WA (QR & panduan `#QC`), Form Input QC responsif (multi-item + multi-kerusakan + preview hitungan lolos), Tabel Riwayat & link Google Drive, Modal Pengaturan & Void.
- **Dilarang:** Mengubah atau mempercayai validasi frontend sebagai satu-satunya penjaga (validasi wajib ditegakkan server di `src/web` + `src/qc`), atau memakai warna/font hardcode di luar token `design_system.md`.

## Dokumen Rujukan
- [`/home/arrafi/RAFI/agent.md`](/home/arrafi/RAFI/agent.md)
- [`../PRD.md`](../PRD.md) (FR-009, FR-011)
- [`../design_system.md`](../design_system.md)
- [`../docs/arsitektur/arsitektur.json`](../docs/arsitektur/arsitektur.json)

## Interface (Kontrak)
Berkas: `index.html`, `style.css`, `app.js` berkomunikasi ke endpoint HTTP di `src/web`.

## Aturan Lokal
- Gunakan CSS custom properties dari `design_system.md`.
- Hindari `alert()`/`confirm()` bawaan browser; gunakan toast & dialog modal custom.
- Uji UI di viewport desktop (`1280px`) dan mobile (`375px`).

## Validasi Lokal
- Jalankan `npm run web`, periksa render, form hitung otomatis, console error, dan responsivitas di browser nyata.

## Agent Tetangga
| Agent | Folder | Hubungan | Delegasi |
|---|---|---|---|
| `web-api` | `src/web` | Penyedia endpoint JSON `/api/*` | [`../src/web/agents.md`](../src/web/agents.md) |

## Catatan Sinkronisasi
2026-11-26 | Acuan: `PRD.md@v1.1`, `design_system.md@v1.0`, `arsitektur.json@v1.0.1`
