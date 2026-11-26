# Panduan & Spesifikasi Input User — Automasi QC Lapangan KWaS (`wa-qc-sync`)

Versi: `1.1` | Tanggal: `2026-11-26` | Status: **Siap Review (Gaya 4 — Template Isi Angka Saja)**  
Acuan: [`PRD.md`](../../PRD.md) (`v1.1`) · [`design_system.md`](../../design_system.md) (`v1.0`) · [`flow_input_qc.html`](../flow/flow_input_qc.html) · [`setup_gas_drive.md`](setup_gas_drive.md) · [`Form Lap QC Lap-cetak.xlsx`](../referensi/Form%20Lap%20QC%20Lap-cetak.xlsx) (`DOK. QC-WOOD-01`, `REV. 2026-08`)

---

## 1. Alur Singkat di WhatsApp (Cukup Ketik `qc` → Salin → Isi Angka)

Karena petugas QC berada di lokasi vendor menggunakan HP dan kuota seluler, input utama dirancang lewat **WhatsApp dengan Template Isi Angka (`Gaya 4`)**:

1. Petugas mengetik **`qc`** (atau `#QC`) di grup/chat WhatsApp bot.
2. Bot langsung membalas pesan **`FORM QC`** kosong yang sudah berisi daftar **14 kriteria standar `DOK. QC-WOOD-01` + `Lainnya`**.
3. Petugas **Salin (*Copy*)** pesan template tersebut, lalu isi:
   - Header (`Vendor`, `PO`, `Barang`, `Tahap`, `Periksa`, `MC %`).
   - **Cukup isi angka rusak** pada baris jenis kerusakan yang ditemukan.
   - Baris kriteria yang **tidak bermasalah dibiarkan kosong** *(atau boleh dihapus agar chat lebih pendek)*.
   - Baris kriteria yang **tidak berlaku** diisi `-` atau `NA`.
4. Kirim ke chat/grup → bot memvalidasi, otomatis menghitung `Lolos = Periksa - Total Rusak` & `Keputusan`, mengirim ke Google Apps Script, lalu membalas **ringkasan + link Google Sheet & PDF di Google Drive**.

---

## 2. Template Resmi WhatsApp (`FORM QC`)

### 2.1 Template Kosong yang Dikirim Bot Saat Ketik `qc`
```text
FORM QC
Vendor   : 
PO       : 
Barang   : 
Tahap    : Unfinish
Periksa  : 
MC %     : 

[Isi angka rusak, kosong = aman, "-" = T/B]
Ati         : 
Pulur       : 
Teter       : 
Mata Mati   : 
Bluestain   : 
Cutter Mark : 
Gerinda     : 
Serat Balik : 
Ukuran      : 
Kesikuan    : 
Doreng      : 
Warna       : 
Kehalusan   : 
Lubang      : 
Lainnya     : 

Catatan  : 
```

### 2.2 Contoh Pengisian Nyata (1 Item — Ada Kerusakan)
Kasus: Vendor `Londo`, `PO-2026-112`, `Sendok Oval`, `1000 pcs` diperiksa, `MC 13.5%`, ditemukan `Bluestain 30 pcs` dan `Cutter Mark 20 pcs`.

```text
FORM QC
Vendor   : Londo
PO       : PO-2026-112
Barang   : Sendok Oval
Tahap    : Unfinish
Periksa  : 1000
MC %     : 13.5

[Isi angka rusak, kosong = aman, "-" = T/B]
Ati         : 
Pulur       : 
Teter       : 
Mata Mati   : 
Bluestain   : 30
Cutter Mark : 20
Gerinda     : 
Serat Balik : 
Ukuran      : 
Kesikuan    : 
Doreng      : 
Warna       : -
Kehalusan   : 
Lubang      : 
Lainnya     : 

Catatan  : 50 pcs disortir untuk rework vendor
```

**Yang otomatis diisi sistem dari pesan di atas:**
- `Tanggal` → tanggal hari ini (`26/11/2026`); `Petugas QC` → nama & nomor WA pengirim.
- `Total Rusak` → `30 + 20 = 50 pcs`.
- `Jumlah Lolos / Diterima` → `1000 - 50 = 950 pcs`.
- `Keputusan` → `Bersyarat` (karena ada 50 pcs rusak untuk rework).
- Checkbox form `DOK. QC-WOOD-01`: `Bluestain` & `Cutter Mark` dikosongkan (`FALSE`), `Warna` tertulis `–`, dan 11 kriteria lainnya otomatis dicentang (`TRUE`).

> **Tips Cepat:** Jika ingin chat lebih pendek, baris kriteria yang kosong **boleh dihapus** sebelum dikirim — sistem tetap menganggap kriteria yang tidak tertulis sebagai **aman (`✓`)**.

### 2.3 Contoh Jika Barang Mulus Semua
Cukup isi bagian atas (baris kriteria kosong boleh dibiarkan kosong atau dihapus seluruhnya):
```text
FORM QC
Vendor   : Londo
PO       : PO-2026-113
Barang   : Sutil Besar
Tahap    : Unfinish
Periksa  : 500
MC %     : 14.0
```
Sistem otomatis menghitung `Total Rusak = 0`, `Lolos = 500`, `Keputusan = Lolos`, dan seluruh 14 kriteria dicentang (`✓`).

### 2.4 Contoh Input Multi-Item (> 1 Barang dalam 1 Kunjungan)
Untuk memeriksa beberapa item sekaligus dalam satu file form `DOK. QC-WOOD-01`, tambahkan pemisah `---` lalu ulangi mulai dari `Barang:`:
```text
FORM QC
Vendor   : Londo
PO       : PO-2026-112
Barang   : Sendok Oval
Tahap    : Unfinish
Periksa  : 1000
MC %     : 13.5
Bluestain   : 30
Cutter Mark : 20
Catatan  : 50 pcs rework
---
Barang   : Sutil Besar
Tahap    : Unfinish
Periksa  : 500
MC %     : 14.0
Catatan  : Mulus semua
```
*(Bila dalam 1 pesan terdapat lebih dari **4 item**, GAS otomatis membuat tab tambahan `Form QC Lap (2)` pada file Google Sheet kunjungan tersebut.)*

---

## 3. Penjelasan Field & Pemetaan ke Form `DOK. QC-WOOD-01`

### 3.1 Bagian Header & Item
| Baris di `FORM QC` | Wajib? | Keterangan & Nilai yang Diterima |
|---|---|---|
| `Vendor` | Wajib | Nama vendor Pre/Fin (toleransi typo / fuzzy match aktif) |
| `PO` | Opsional | Nomor PO / Dokumen (jika kosong diisi `"-"` / nomor laporan) |
| `Barang` | Wajib | Nama item KWaS (`Sendok Oval`), kode SKU (`RB103002`), atau alias buyer |
| `Tahap` | Opsional | `Unfinish` / `Mentah` (batas MC `≤ 15%`) atau `Finish` / `Jadi` (batas MC `≤ 17%`). Default: `Unfinish` |
| `Periksa` | Wajib | Jumlah barang diperiksa (bilangan bulat `> 0`, satuan `pcs`) |
| `MC %` | Opsional | Kadar air (misal `13.5` atau `13.5%`), otomatis masuk kolom MC Mentah atau MC Jadi sesuai `Tahap` |
| `Lolos` *(opsional)* | Opsional | Tidak perlu ditulis di template; jika ditambahkan manual, wajib `0 ≤ Lolos ≤ Periksa - Total Rusak` |
| `Keputusan` *(opsional)* | Opsional | `Lolos` / `Bersyarat` / `Tolak`; otomatis ditentukan sistem jika tidak diisi |
| `Catatan` | Kondisional | Wajib diisi jika ada `Lainnya` atau MC melebihi standar; jika hanya ada rusak standar, ringkasan otomatis dibuatkan |
| `Tanggal` / `Petugas` / `Catatan Umum` *(opsional)* | Opsional | Boleh ditambahkan di header bila berbeda dari default hari ini & akun WA pengirim |

### 3.2 Pemetaan 14 Kriteria Standar + `Lainnya`
| Baris di `FORM QC` | Kriteria Resmi Form `DOK. QC-WOOD-01` | ID Sistem | Arti Nilai yang Diisi |
|---|---|---|---|
| `Ati` | Bebas Ati | `ATI` | Angka `> 0` = jumlah rusak (`FALSE`); kosong/`0` = aman (`✓`); `-`/`NA` = tidak berlaku (`–`) |
| `Pulur` | Bebas Pulur | `PULUR` | Sama seperti di atas |
| `Teter` | Bebas Teter | `TETER` | Sama seperti di atas |
| `Mata Mati` | Bebas Mata Mati (Lubang) | `MATA_MATI` | Sama seperti di atas |
| `Bluestain` | Bebas Bluestain / Jamur | `BLUESTAIN` | Sama seperti di atas |
| `Cutter Mark` | Bebas Cutter Mark | `CUTTER_MARK` | Sama seperti di atas |
| `Gerinda` | Bebas Bekas Gerinda | `BEKAS_GERINDA` | Sama seperti di atas |
| `Serat Balik` | Bebas Serat Balik | `SERAT_BALIK` | Sama seperti di atas |
| `Ukuran` | Toleransi Ukuran (± 2mm) | `TOLERANSI_UKURAN` | Sama seperti di atas |
| `Kesikuan` | Kesikuan (90°) | `KESIKUAN` | Sama seperti di atas |
| `Doreng` | Doreng (≤ 10%) | `DORENG` | Sama seperti di atas |
| `Warna` | Warna Sesuai Color Card | `WARNA` | Sama seperti di atas |
| `Kehalusan` | Kehalusan Permukaan | `KEHALUSAN` | Sama seperti di atas |
| `Lubang` | Bebas Lubang | `BEBAS_LUBANG` | Sama seperti di atas |
| `Lainnya` | Kerusakan di luar 14 kriteria | `LAINNYA` | Format bebas: `Retak ujung 5` atau `5 (Retak ujung)` atau `5` + penjelasan di `Catatan` |

---

## 4. Perintah Bantuan & Penanganan Kesalahan WA

| Perintah | Fungsi |
|---|---|
| `qc` atau `#QC` *(kosong)* | Bot mengirim template `FORM QC` kosong siap salin-tempel |
| `#HELP` | Panduan singkat cara pakai `qc` & daftar perintah |
| `#PRODUK` | Daftar 66 SKU Raw Body & nama resmi |
| `#VENDOR` | Daftar vendor (`#VENDOR PRE` / `#VENDOR FIN`) |
| `#KRITERIA` | Penjelasan 14 kriteria standar & batas kadar air |
| `#STATUS` | Cek status bot WA & koneksi Google Apps Script |
| `#OK <KODE>` | Konfirmasi koreksi nama `Barang` / `Vendor` jika skor kemiripan `0.50–0.89` (berlaku **5 menit**) |

### Validasi & Ketahanan Otomatis
1. **Hitungan:** `Total Rusak ≤ Periksa`; jika `Lolos` tidak ditulis, dihitung `Periksa - Total Rusak`.
2. **Kadar Air (MC):** `Unfinish ≤ 15%`, `Finish ≤ 17%`. Jika melewati batas, status tidak boleh `Lolos` penuh (wajib `Bersyarat` atau `Tolak` + catatan).
3. **Typo Produk/Vendor:** Exact/alias atau skor `≥ 0.90` langsung jalan; `0.50–0.89` minta `#OK <6-HEX>`; `< 0.50` ditolak dengan saran `#PRODUK`/`#VENDOR`.
4. **Offline Queue & Idempotensi:** Jika koneksi ke GAS terputus, laporan disimpan aman ke `message_queue.json` dan dikirim ulang otomatis tiap 30 detik. Pesan identik tidak diproses ganda.

---

## 5. Kanal Kantor — Web Command Center (`http://<IP-LAN>:3001`)
Untuk tim QA/admin di kantor (jaringan LAN/Wi-Fi kantor):
- **Gateway WA:** Scan QR pairing & pantau status koneksi WhatsApp.
- **Input QC:** Form web dengan dropdown master produk/vendor, *3-State Criterion Toggle* (`OK ✓` / `NOK ✗` / `NA –`), baris kerusakan dinamis, dan kalkulasi real-time.
- **Riwayat & Rekap:** Tabel riwayat kunjungan, link langsung ke file Google Sheet & PDF di Drive, serta tombol **Void** (konfirmasi via modal custom) untuk membatalkan laporan salah input.
- **Pengaturan:** Konfigurasi `GAS_QC_WEBHOOK_URL` dan whitelist grup `ALLOWED_GROUPS`.
