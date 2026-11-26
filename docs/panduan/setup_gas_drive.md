# Panduan Setup Google Drive, Spreadsheet Rekap, & Apps Script (`gas/Code_QC.gs`)

Versi: `1.0` | Tanggal: `2026-11-26` | Acuan: [`PRD.md`](../../PRD.md) (`v1.1`) · [`kontrak_api.md`](../arsitektur/kontrak_api.md) · [`Form Lap QC Lap-cetak.xlsx`](../referensi/Form%20Lap%20QC%20Lap-cetak.xlsx)

---

## 1. Tujuan
Menghubungkan aplikasi `wa-qc-sync` (Node.js) dengan **Google Drive** dan **Google Sheets** agar setiap laporan QC dari WhatsApp atau Web Form otomatis menghasilkan:
1. Salinan file form cetak `DOK. QC-WOOD-01` (+ salinan PDF opsional) di folder Google Drive target.
2. Catatan rekap terpusat di Spreadsheet Pusat (`REKAP_QC_KUNJUNGAN`, `REKAP_QC_DETAIL_ITEM`, `LOG_KERUSAKAN`).

---

## 2. Langkah Setup Google Drive & Spreadsheet

### Langkah 1 — Siapkan Folder Output & Master Template Form
1. Buat folder baru di Google Drive untuk arsip laporan QC, misalnya `QC Lapangan KWaS`. Salin **Folder ID** dari URL browser (`https://drive.google.com/drive/folders/<OUTPUT_FOLDER_ID>`).
2. Unggah berkas [`docs/referensi/Form Lap QC Lap-cetak.xlsx`](../referensi/Form%20Lap%20QC%20Lap-cetak.xlsx) ke Google Drive.
3. Buka file tersebut dengan **Google Sheets**, lalu pilih **File → Simpan sebagai Google Sheets** (*Save as Google Sheets*) agar menjadi format native Google Sheets (bukan `.xlsx` mentah).
4. Salin **Spreadsheet ID** file template tersebut (`TEMPLATE_FILE_ID`).

### Langkah 2 — Siapkan Spreadsheet Rekap Pusat
1. Buat (atau gunakan) Spreadsheet Rekap Pusat khusus QC di Google Drive (terpisah dari `DASHBOARD_STOK` proyek `wa` agar saldo stok tidak tercampur).
2. Salin **Spreadsheet ID**-nya (`REKAP_SPREADSHEET_ID`).

### Langkah 3 — Pasang & Konfigurasi `gas/Code_QC.gs`
1. Pada Spreadsheet Rekap Pusat, buka menu **Ekstensi (Extensions) → Apps Script**.
2. Salin isi berkas `gas/Code_QC.gs` *(dibuat pada Fase Implementasi)* ke editor Apps Script.
3. Buka **Project Settings (ikon gerigi) → Script Properties**, lalu isi properti berikut:
   | Properti | Wajib? | Keterangan |
   |---|---|---|
   | `TEMPLATE_FILE_ID` | Wajib | ID Google Sheet Master Template `Form QC Lap` |
   | `OUTPUT_FOLDER_ID` | Wajib | ID Folder Google Drive tempat menyimpan hasil salinan form & PDF |
   | `REKAP_SPREADSHEET_ID` | Opsional | ID Spreadsheet Rekap Pusat (default: spreadsheet tempat script terpasang) |
   | `GENERATE_PDF` | Opsional | `"true"` (default: buat salinan PDF selain Google Sheet) atau `"false"` |
   | `API_SECRET` | Opsional | Token rahasia opsional yang dicocokkan dengan `.env` Node.js |

### Langkah 4 — Jalankan `setupQcTemplate()` Satu Kali
1. Di editor Apps Script, pilih fungsi **`setupQcTemplate`** lalu klik **Run**.
2. Berikan izin akses Google Drive & Google Sheets saat diminta.
3. Fungsi ini otomatis:
   - Membuat/memverifikasi header 3 sheet rekap (`REKAP_QC_KUNJUNGAN`, `REKAP_QC_DETAIL_ITEM`, `LOG_KERUSAKAN`).
   - Mengonversi sel kriteria & keputusan (`0` / `FALSE` hasil unggahan Excel 365) pada `TEMPLATE_FILE_ID` menjadi **native Google Sheets checkbox** (`insertCheckboxes()`).
   - Mengatur page setup cetak A4 Portrait *fit-to-width* agar ekspor PDF muat rapi 1 halaman per 4 item.

### Langkah 5 — Deploy Web App GAS
1. Klik **Deploy → New deployment** → pilih jenis **Web app**.
2. Atur:
   - **Execute as:** `Me` (akun Google pemilik folder/spreadsheet).
   - **Who has access:** `Anyone` (mengikuti pola deployment proyek `wa`; gunakan `API_SECRET` bila ingin lapisan verifikasi token tambahan).
3. Salin **Web App URL** berakhiran `/exec`.

---

## 3. Menghubungkan ke Node.js (`wa-qc-sync`)
1. Jika menjalankan via CLI global (`npm i -g .` atau `npm i -g --allow-git=all <repo/tarball>`):
   ```bash
   wa-qc-sync setup
   wa-qc-sync doctor
   ```
   Wizard `setup` otomatis membuat/mengisi `.env` dan `config.json` di `~/.wa-qc-sync` (atau folder proyek lokal) serta mengecek ping ke `/exec`.
2. Atau secara manual, salin `.env.example` menjadi `.env`:
   ```env
   PORT=3001
   GAS_QC_WEBHOOK_URL="https://script.google.com/macros/s/DEPLOYMENT_ID_ANDA/exec"
   ALLOWED_GROUPS=""
   API_SECRET=""
   DEBUG=false
   ```
3. Atau tempelkan URL tersebut lewat Web Command Center (`http://localhost:3001`) → tab **Pengaturan** → klik **Uji Koneksi** → **Simpan**.
4. Di WhatsApp, kirim perintah `#STATUS` untuk memastikan bot dan GAS merespons `active`.

---

## 4. Catatan Operasional & Pemecahan Masalah
- **Checkbox tampil `FALSE`:** Pastikan template sudah dikonversi dari `.xlsx` ke Google Sheets native dan `setupQcTemplate()` sudah dijalankan pada `TEMPLATE_FILE_ID`.
- **Perubahan kode `Code_QC.gs`:** Setiap kali mengedit kode Apps Script, wajib pilih **Deploy → Manage deployments → Edit → New version** agar URL `/exec` memakai versi terbaru.
- **Sesi WhatsApp (`connectionReplaced`):** Jangan scan QR menggunakan nomor WhatsApp yang sedang aktif dipakai oleh proyek `/home/arrafi/Proyek/wa` secara bersamaan.
