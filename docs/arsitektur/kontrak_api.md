# Kontrak API, Webhook GAS, & Pemetaan Sel Form (`wa-qc-sync`)

Versi: `1.0` | Tanggal: `2026-11-26` | Acuan: [`PRD.md`](../../PRD.md) (`v1.1`) · [`arsitektur.json`](arsitektur.json) (`v1.0.1`) · [`Form Lap QC Lap-cetak.xlsx`](../referensi/Form%20Lap%20QC%20Lap-cetak.xlsx)

---

## 1. HTTP API Lokal — Express 5 (`src/web`, Port `3001`)

Mengikuti konvensi respons proyek KWaS:
- **Sukses:** `{ "success": true, ... }` (HTTP `200`/`201`).
- **Validasi / Input Salah:** `{ "success": false, "code": "VALIDATION_ERROR", "message": "...", "details": [...] }` (HTTP `400`).
- **Gangguan GAS / Jaringan saat Submit QC:** Payload disimpan ke `message_queue.json`, lalu server membalas HTTP `202` dengan `{ "success": true, "queued": true, "noLaporan": "...", "message": "..." }`.
- **Error Internal:** HTTP `500` dengan pesan aman (dilarang membocorkan stack trace ke klien).

### 1.1 Endpoint Gateway WhatsApp & Antrean
| Method & Path | Fungsi | Respons Utama |
|---|---|---|
| `GET /api/wa/status` | Status koneksi WA, QR DataURL, status konfigurasi GAS, versi mutasi data, & ringkasan antrean offline | `{ status, user, qrImage, gasConnected, dataVersion, queue }` |
| `POST /api/wa/restart` | Memulai ulang koneksi socket Baileys | `{ success, message }` |
| `POST /api/wa/logout` | Memutus sesi WA & menghapus auth agar bisa scan QR baru | `{ success, message }` |
| `GET /api/queue/status` | Memeriksa daftar & jumlah payload tertunda di `message_queue.json` | `{ success, pendingCount, items }` |
| `POST /api/queue/retry` | Memicu pengiriman ulang manual antrean offline yang masih `pending` | `{ success, processed, remaining }` |

### 1.2 Endpoint QC & Master Data
| Method & Path | Fungsi | Request / Query | Respons Utama |
|---|---|---|---|
| `GET /api/help` | Teks panduan `#HELP`, daftar 14 kriteria, & template `FORM QC` (Gaya 4) | — | `{ helpText, criteriaText, templateText }` |
| `GET /api/master` | Daftar 66 produk (`PRODUCT_MASTER`), `VENDORS_PRE`, `VENDORS_FIN`, & 14 `QC_CRITERIA` | — | `{ success, products, vendorsPre, vendorsFin, criteria }` |
| `GET /api/qc/reports` | Mengambil riwayat kunjungan & ringkasan rekap dari GAS (`GET_QC_DASHBOARD`, cache TTL 15s) | `?fresh=1` | `{ success, data: { summary, reports, items, defects }, cached?, stale? }` |
| `POST /api/qc/reports` | Validasi server via `src/qc` (`validateQcReport`), lalu kirim `LOG_QC_REPORT` ke GAS (fallback ke `MessageQueue`) | `QCReportPayload` (`vendor`, `noDokumenPo`, `tanggalPemeriksaan`, `petugasQc`, `catatanUmum`, `items[]`) | `{ success, queued?, noLaporan, sheetUrl?, pdfUrl?, dataVersion }` |
| `POST /api/qc/reports/void` | Membatalkan laporan salah input via GAS (`VOID_QC_REPORT`) | `{ noLaporan, alasanVoid, oleh }` | `{ success, message, status: "VOID" }` |

### 1.3 Endpoint Pengaturan (`appConfig`)
| Method & Path | Fungsi | Request | Respons Utama |
|---|---|---|---|
| `GET /api/config` | Membaca konfigurasi aman (tanpa membocorkan nilai `API_SECRET` penuh) | — | `{ success, config: { gasWebhookUrl, allowedGroups, hasApiSecret } }` |
| `POST /api/config/test` | Menguji koneksi ke `gasWebhookUrl` (`GET` / `GET_MASTER_DATA`) | `{ gasWebhookUrl, apiSecret? }` | `{ success, message, templateReady? }` |
| `POST /api/config` | Menyimpan `GAS_QC_WEBHOOK_URL` dan `ALLOWED_GROUPS` ke `config.json` secara atomic | `{ gasWebhookUrl, allowedGroups }` | `{ success, message }` |

---

## 2. Kontrak Webhook Google Apps Script (`gas/Code_QC.gs`)

- **Transport:** HTTPS `GET` (cek kesehatan) & HTTPS `POST` dengan `Content-Type: text/plain;charset=utf-8` (pola GAS tanpa preflight redirect issue).
- **Keamanan Opsional:** Jika `API_SECRET` diset di *Script Properties* GAS, payload menyertakan field `apiSecret` untuk dicocokkan sebelum eksekusi.
- **Konkurensi:** Seluruh `doPost` wajib memperoleh `LockService.getScriptLock().waitLock(30000)` dan melepasnya di blok `finally`.

### 2.1 `doGet(e)` — Health Check (`#STATUS`)
- **Respons:** `{ "status": "success", "service": "wa-qc-sync-gas", "templateConfigured": true, "generatePdf": true, "timestamp": "..." }`.

### 2.2 `doPost(e)` — Daftar `action`
| `action` | Payload `data` | Perilaku Wajib di `Code_QC.gs` | Respons Sukses |
|---|---|---|---|
| `GET_MASTER_DATA` | `{}` | Membaca sheet master produk & vendor (bila tersedia di Rekap Spreadsheet) | `{ status: "success", data: { products, vendors } }` |
| `GET_QC_DASHBOARD` | `{ limit? }` | Membaca `REKAP_QC_KUNJUNGAN`, `REKAP_QC_DETAIL_ITEM`, & `LOG_KERUSAKAN` | `{ status: "success", data: { summary, reports, items, defects } }` |
| `LOG_QC_REPORT` | `QCReportPayload` (wajib `noLaporan`, `idempotencyKey`, `vendor`, `items[]`) | Cek `idempotencyKey` / `noLaporan` di `REKAP_QC_KUNJUNGAN` dulu; jika sudah ada, kembalikan link eksisting tanpa `makeCopy()` ulang. Jika baru: salin template `Form QC Lap`, isi sel `DOK. QC-WOOD-01` (tambah tab `Form QC Lap (2)` jika `> 4` item), ekspor PDF jika `GENERATE_PDF === "true"`, append `REKAP_QC_*` & `LOG_KERUSAKAN` | `{ status: "success", duplicate: false, noLaporan, fileId, sheetUrl, pdfUrl }` |
| `VOID_QC_REPORT` | `{ noLaporan, alasanVoid, oleh }` | Jika sudah berstatus `VOID`, kembalikan error kode `ALREADY_VOID`; jika valid, ubah status di `REKAP_QC_KUNJUNGAN` menjadi `VOID`, catat alasan, dan rename file Drive dengan prefiks `[VOID] ` | `{ status: "success", statusLaporan: "VOID", message }` |

---

## 3. Pemetaan Sel Resmi `DOK. QC-WOOD-01` (`Form Lap QC Lap-cetak.xlsx`)

Berdasarkan inspeksi langsung struktur sheet `Form QC Lap` pada [`Form Lap QC Lap-cetak.xlsx`](../referensi/Form%20Lap%20QC%20Lap-cetak.xlsx):

### 3.1 Header & Footer Kunjungan
| Field Kunjungan | Posisi Label | Area Nilai di Sheet `Form QC Lap` |
|---|---|---|
| `vendor` | `A4` (`NAMA VENDOR / LOKASI`) | `B4` (rentang `B4:E4`) |
| `noDokumenPo` | `G4` (`NO. DOKUMEN / PO`) | `J4` (rentang `J4:M4`) |
| `tanggalPemeriksaan` | `A5` (`TANGGAL PEMERIKSAAN`) | `B5` (rentang `B5:E5`) |
| `petugasQc` | `G5` (`NAMA PETUGAS QC`) | `J5` (rentang `J5:M5`) |
| `catatanUmum` | `A35` (`CATATAN UMUM KUNJUNGAN`) | Baris di bawah `A35` (`A35:M35` / baris isi) |
| Tanda Tangan QC (`petugasQc`, `tanggal`) | `A38`, `E38` | `A37` (area nama) & `E37`/`F38` (tanggal) |
| Tanda Tangan Vendor (`diketahuiVendor`, `tanggal`) | `G38`, `M38` | `G37` (area nama) & `M37` (tanggal) |

### 3.2 Kolom 4 Item per Tab (`ITEM 1`..`ITEM 4`)
Setiap tab menampung **maksimal 4 item** (jika `items.length > 4`, GAS menduplikasi tab template menjadi `Form QC Lap (2)`, `Form QC Lap (3)`, dst.):

| Baris | Keterangan di Form | Item 1 (`B:D`) | Item 2 (`E:G`) | Item 3 (`H:J`) | Item 4 (`K:M`) |
|---|---|---|---|---|---|
| `8` | `Kode / Nama Item` | `B8` | `E8` | `H8` | `K8` |
| `9` | `Jumlah Barang Diperiksa` (`pcs` di D/G/J/M) | `B9` | `E9` | `H9` | `K9` |
| `11` | `MC Barang Mentah/Unfinish` (`%` di D/G/J/M) | `B11` | `E11` | `H11` | `K11` |
| `12` | `MC Barang Jadi/Finish` (`%` di D/G/J/M) | `B12` | `E12` | `H12` | `K12` |
| `14`–`21` | 8 Kriteria Cacat Permukaan & Serat (`Ati`..`Serat Balik`) | `C14:C21` | `F14:F21` | `I14:I21` | `L14:L21` |
| `23`–`25` | 3 Kriteria Toleransi & Presisi (`Ukuran`..`Doreng`) | `C23:C25` | `F23:F25` | `I23:I25` | `L23:L25` |
| `27`–`29` | 3 Kriteria Kualitas Akhir (`Warna`..`Bebas Lubang`) | `C27:C29` | `F27:F29` | `I27:I29` | `L27:L29` |
| `32` | Checkbox Keputusan (`Lolos` / `Bersyarat` / `Tolak`) | `B32` / `C32` / `D32` | `E32` / `F32` / `G32` | `H32` / `I32` / `J32` | `K32` / `L32` / `M32` |
| `33` | `Catatan Singkat` | `B33` | `E33` | `H33` | `K33` |
| `34` | `Jumlah Barang Diterima` (`pcs` di D/G/J/M) | `B34` | `E34` | `H34` | `K34` |

**Aturan nilai sel kriteria (`14`–`29`):** `OK` → `true` (native checkbox tercentang); `NOK` → `false` (kotak kosong); `NA` → menghapus validasi checkbox pada sel tersebut dan menulis `"–"`.
