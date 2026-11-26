# PRD — Automasi QC Lapangan KWaS (`wa-qc-sync`)
Versi: 1.1 | Tanggal: 2026-11-26 | Status: Disetujui & Terimplementasi (v1.0.0)

---

## 1. Ringkasan & Tujuan
Sistem **Automasi QC Lapangan KWaS** (`wa-qc-sync`) adalah aplikasi Node.js (WhatsApp Bot Baileys + Web Console Express) yang terintegrasi dengan Google Apps Script untuk mendigitalkan proses pemeriksaan kualitas (*Quality Control*) barang kayu KWaS di lokasi vendor/pengrajin maupun penerimaan gudang, serta menulis output laporan resmi berformat `DOK. QC-WOOD-01` ke **Google Drive**.

**Tujuan terukur:**
1. Menghilangkan pencatatan & rekap manual dari form kertas/Excel ke Google Drive.
2. Mencatat secara akurat alur pemeriksaan barang masuk/kunjungan: **Jumlah Diperiksa** → **Rincian Jumlah & Jenis Kerusakan** → **Jumlah Lolos / Diterima**.
3. Menghasilkan dokumen laporan resmi di Google Drive yang identik strukturnya dengan [`docs/referensi/Form Lap QC Lap-cetak.xlsx`](docs/referensi/Form%20Lap%20QC%20Lap-cetak.xlsx), sekaligus rekap master terpusat yang siap diaudit.

---

## 2. Masalah yang Diselesaikan
1. **Rekap Manual & Rawan Salah Hitung:** Pengisian form Excel/kertas terpisah menyulitkan pelacakan berapa banyak barang yang rusak, apa jenis cacatnya, dan berapa yang benar-benar lolos diterima per PO/vendor.
2. **Risiko Kehilangan Catatan Lapangan:** Catatan di lokasi pengrajin/jaringan lemah sering tercecer atau tertunda masuk ke arsip kantor.
3. **Kesalahan Penulisan Nama SKU/Vendor:** Di lapangan petugas kerap menyingkat atau salah ketik nama produk (`Sutil Beser`) atau vendor.
4. **Masalah Cetak Template Excel Asli:** Pada [`docs/referensi/Form Lap QC Lap-cetak.xlsx`](docs/referensi/Form%20Lap%20QC%20Lap-cetak.xlsx), fitur checkbox Excel 365 tampil sebagai `FALSE` di alat non-Excel dan halaman cetak terpecah menjadi 4 halaman.

---

## 3. Pengguna & Persona
| Persona | Peran | Kebutuhan Utama |
|---|---|---|
| **Petugas QC Lapangan** | Melakukan inspeksi di lokasi vendor/pabrik dan melaporkan hasil | Input cepat lewat WhatsApp `#QC` atau form HP; tidak perlu hafal kode SKU persis; langsung dapat konfirmasi hasil & link file Drive |
| **Admin / Tim QA Kantor** | Memantau rekap hasil QC, mencetak/membagikan form ke vendor, koreksi data | Web Dashboard untuk lihat riwayat, akses link Google Sheet & PDF di Drive, input/koreksi laporan, serta kelola master & koneksi GAS |
| **Manajemen / Gudang** | Meninjau pass rate vendor, tren cacat, dan jumlah barang lolos diterima | Spreadsheet Rekap Master di Google Drive yang ter-update real-time dan akurat |

---

## 4. Scope

### 4.1 In-Scope (Must-Have v1)
- Bot WhatsApp Baileys dengan pola **Template `FORM QC` Isi-Angka (`Gaya 4`)**: user ketik `qc` / `#QC` kosong → bot membalas template kosong berisi 14 kriteria standar untuk disalin & diisi angkanya (mendukung multi-item dipisah `---`, penghapusan baris kosong, serta perintah bantu `#HELP`, `#KRITERIA`, `#PRODUK`, `#VENDOR`, `#STATUS`, `#OK <TOKEN>`).
- Fuzzy matching Produk (SKU Raw Body, nama KWaS, alias), Vendor (Pre-Finishing & Finishing), dan 14 Jenis Kerusakan (+ `Lainnya`).
- Engine validasi hitungan (`Diperiksa` → `Rusak[]` per jenis & qty → `Lolos/Diterima`), ambang Kadar Air (`MC Mentah ≤ 15%`, `MC Jadi ≤ 17%`), dan konsistensi keputusan (`Lolos` / `Bersyarat` / `Tolak`).
- Offline Queue persisten (`message_queue.json`) dengan retry otomatis & idempotensi anti-double entry.
- Google Apps Script (`gas/Code_QC.gs`) yang menyalin Master Template `Form QC Lap` di Google Drive, mengisi seluruh sel `DOK. QC-WOOD-01` (+ duplikasi tab otomatis bila > 4 item), mengekspor salinan PDF opsional di Drive, dan menulis rekap ke Spreadsheet Pusat (`REKAP_QC_KUNJUNGAN`, `REKAP_QC_DETAIL_ITEM`, `LOG_KERUSAKAN`).
- Web Command Center & Mobile QC Form (Express 5, Port `3001`): QR pairing WA, form input QC multi-item + multi-kerusakan, tabel riwayat & link Google Drive, fitur Void laporan, dan Pengaturan Webhook/Whitelist.

### 4.2 In-Scope (Nice-to-Have / Opsional Fase Lanjut)
- Lampiran foto bukti QC dari WhatsApp/Web yang ikut diarsipkan ke folder Google Drive kunjungan.
- Tombol/opsi sinkronisasi satu arah ke webhook [`/home/arrafi/Proyek/wa`](../wa) (draf mutasi atau opt-in flag).
- Packaging Windows `.exe` dan script `.bat` seperti proyek `wa`.

### 4.3 Out-of-Scope (Dilarang di v1)
1. **Tidak mengubah saldo `DASHBOARD_STOK` di proyek `wa` secara otomatis** (mencegah *double entry* dengan laporan `#PRE`/`#FIN`/`#REJECT` mandor).
2. **Tidak ada modul keuangan/pembayaran/invoice vendor** maupun manajemen stok bahan baku internal.
3. **Tidak ada tanda tangan biometrik/canvas digital** pada form v1 (identitas QC dan tanggal ditulis otomatis sebagai teks; tanda tangan basah dilakukan pada hasil cetak bila perlu).
4. **Tidak ada multi-tenant SaaS atau autentikasi user cloud eksternal** (berjalan lokal/LAN KWaS terhubung ke Google Workspace KWaS via GAS Web App).
5. **Tidak ada fitur AI/OCR pembacaan foto form kertas otomatis.**

---

## 5. Kebutuhan Fungsional (`FR`)

| ID | Nama Fitur | Deskripsi & Acceptance Criteria yang Dapat Diuji | Prioritas |
|---|---|---|---|
| **FR-001** | **Parser & Generator Template QC WhatsApp (`qc` / `FORM QC`)** | Saat user mengirim `qc` atau `#QC` kosong, bot membalas template `FORM QC` (Gaya 4) berisi header ringkas dan daftar 14 kriteria standar + `Lainnya`. Saat user mengirim template yang sudah diisi (mendukung >1 item dipisah `---` serta baris kosong dihapus/dipertahankan), parser mengurai angka kerusakan, `-`/`NA`, dan data item.<br>**AC:** (1) Pesan `qc` atau `#QC` tanpa body mengembalikan teks template `FORM QC` tanpa memanggil GAS. (2) Input `FORM QC` dengan `Periksa: 1000`, `Bluestain: 30`, `Cutter Mark: 20` (baris kriteria lain kosong/dihapus) terurai menjadi `items.length === 1`, `qtyDiperiksa === 1000`, `rusak.length === 2`, `qtyLolos === 950`. (3) Input multi-item dengan 2 blok `---` menghasilkan `items.length === 2`. (4) Nilai `-` / `NA` memetakan kriteria ke `"NA"`. (5) Format tanpa field wajib menghasilkan pesan error panduan terstruktur. | Must |
| **FR-002** | **Perintah Bantuan & Navigasi WA** | Mendukung perintah `#HELP`, `#KRITERIA`, `#PRODUK`, `#VENDOR` (`#VENDOR PRE`/`FIN`), dan `#STATUS`.<br>**AC:** Setiap perintah mengembalikan teks bantuan yang sesuai tanpa mengirim payload ke GAS; `#STATUS` melakukan HTTP `GET` ke `GAS_QC_WEBHOOK_URL` dan melaporkan status aktif/gagal. | Must |
| **FR-003** | **Fuzzy Matching SKU, Vendor, & Jenis Kerusakan** | Mencocokkan input ke `PRODUCT_MASTER` (SKU/nama/alias), `VENDORS_PRE`/`VENDORS_FIN`, dan 14 kriteria kerusakan (+ `Lainnya`) menggunakan `fastest-levenshtein`.<br>**AC:** (1) Exact/alias match langsung diproses. (2) Fuzzy match dengan skor `0.50 ≤ score < 0.90` untuk produk/vendor memicu token konfirmasi `#OK <6-HEX>` dengan TTL 5 menit lewat `CorrectionStore`. (3) Skor `< 0.50` ditolak dengan pesan error jelas. (4) Input jenis kerusakan di luar 14 kriteria yang tidak mirip (`< 0.50`) dipetakan ke kategori `Lainnya` dengan menyimpan teks aslinya. | Must |
| **FR-004** | **Validasi Domain & Hitungan QC** | Memvalidasi integritas angka dan aturan standar `DOK. QC-WOOD-01`.<br>**AC:** (1) `qtyDiperiksa > 0` integer. (2) Setiap `rusak[i].qty > 0` integer, dan `sum(rusak[].qty) <= qtyDiperiksa`. (3) Jika `qtyLolos` tidak diisi, dihitung otomatis `qtyDiperiksa - totalRusak`; jika diisi eksplisit, wajib `0 <= qtyLolos <= qtyDiperiksa - totalRusak`. (4) MC Mentah > `15%` atau MC Jadi > `17%` menandai pelanggaran standar MC dan melarang keputusan `Lolos` penuh (wajib `Bersyarat`/`Tolak` + catatan). (5) Jika `totalRusak > 0` atau ada kriteria `NOK`, `catatan` atau rincian kerusakan wajib terisi. | Must |
| **FR-005** | **Penulisan Form QC ke Google Drive via Apps Script** | GAS `Code_QC.gs` menerima `LOG_QC_REPORT`, membuat salinan Master Template `Form QC Lap` di folder Drive target, dan mengisi semua sel form `DOK. QC-WOOD-01` (header, baris 8–38, >4 item membuat tab tambahan `Form QC Lap (2)`).<br>**AC:** (1) Kriteria tanpa kerusakan ditandai centang (`TRUE`); kriteria dengan kerusakan dikosongkan (`FALSE`); kriteria tidak berlaku ditandai `–`. (2) `Catatan Singkat` berisi ringkasan otomatis `Rusak: <total> pcs (<Jenis>: <qty> pcs, ...)`. (3) `Jumlah Barang Diterima` diisi `qtyLolos`. (4) Mengembalikan `sheetUrl` (dan `pdfUrl` jika `GENERATE_PDF=true`). | Must |
| **FR-006** | **Rekap Terpusat di Google Sheets** | Selain file form per kunjungan di Drive, GAS mencatat ringkasan kunjungan dan detail per item ke spreadsheet pusat (`REKAP_QC_KUNJUNGAN`, `REKAP_QC_DETAIL_ITEM`, `LOG_KERUSAKAN`).<br>**AC:** Satu kunjungan dengan N item menulis 1 baris di `REKAP_QC_KUNJUNGAN`, N baris di `REKAP_QC_DETAIL_ITEM`, dan M baris di `LOG_KERUSAKAN` (satu per jenis kerusakan > 0), termasuk hyperlink `sheetUrl` file Drive. | Must |
| **FR-007** | **Fungsi Setup Template & Rekap GAS (`setupQcTemplate`)** | GAS menyediakan fungsi setup untuk menyiapkan sheet rekap dan menormalisasi template hasil upload `Form Lap QC Lap-cetak.xlsx`.<br>**AC:** Menjalankan `setupQcTemplate()` memastikan header sheet rekap tersedia, sel centang memakai native Google Sheets checkbox, dan page setup A4 Portrait `fitToWidth` aktif. | Must |
| **FR-008** | **Antrean Offline Persisten & Idempotensi** | Gagal jaringan / GAS 5xx menyimpan payload ke `message_queue.json` (atomic write) dan retry tiap 30 detik; pesan/kunjungan dengan `idempotencyKey` / `noLaporan` sama tidak diproses ganda.<br>**AC:** (1) Simulasi error jaringan menulis entry `pending` ke `message_queue.json`. (2) Worker memproses urutan FIFO saat pulih. (3) Pengiriman ulang `noLaporan` yang sudah tercatat di GAS mengembalikan data eksisting tanpa membuat salinan file baru di Drive. | Must |
| **FR-009** | **Web Command Center & Mobile QC Form** | Express 5 Web Console (Port `3001`) untuk monitoring WA (QR/status/restart/logout), pengisian laporan QC interaktif (tambah multi-item & multi-kerusakan), daftar riwayat + link Google Drive, Void laporan, dan Settings.<br>**AC:** (1) Form web menghitung `Lolos = Diperiksa - Total Rusak` secara real-time, mendukung submit via `POST /api/qc/reports`, dan menampilkan hasil/antrean. (2) Riwayat menampilkan metrik & tautan ke Drive. (3) Dapat diakses di viewport mobile (`375px`) dan desktop (`1280px+`) tanpa overflow horizontal. | Must |
| **FR-010** | **Sinkronisasi Master Data & Whitelist Grup** | Mendukung `syncDictionaryFromWebhook()` saat startup & `ALLOWED_GROUPS` whitelist.<br>**AC:** Chat di luar `ALLOWED_GROUPS` (bila whitelist diisi) diabaikan; master produk/vendor tetap jalan memakai data lokal bila GAS belum terkonfigurasi. | Must |
| **FR-011** | **Pembatalan / Void Laporan QC (`VOID_QC_REPORT`)** | Admin dapat membatalkan laporan yang salah input dari Web Dashboard.<br>**AC:** Memanggil `POST /api/qc/reports/void` menandai status `VOID` di `REKAP_QC_*` dan memberi penanda `[VOID]` pada nama file Drive terkait; transaksi yang sudah `VOID` menolak void ulang (`ALREADY_VOID`). | Must |

---

## 6. Kebutuhan Non-Fungsional (`NFR`)

| ID | Kategori | Kriteria Terukur |
|---|---|---|
| **NFR-001** | **Keamanan & Privasi** | `.env`, `auth_info_baileys/`, `config.json` tidak ter-commit (`.gitignore`). Validasi input ketat di Node.js & GAS. Error ke user tidak membocorkan stack trace. |
| **NFR-002** | **Keandalan & Atomisitas** | Atomic file write (`tmp` + `renameSync`) di `message_queue.json`; `LockService` (timeout 30s) di `Code_QC.gs`; zero data loss saat jaringan terputus. |
| **NFR-003** | **Koeksistensi Sistem** | Port Web default `3001` (tidak bentrok dengan proyek `wa` di `3000`); direktori sesi WA `auth_info_baileys/` independen. |
| **NFR-004** | **Usability Lapangan** | Target sentuh kontrol di Mobile QC Form `≥ 44×44 px`; di WhatsApp petugas tidak perlu menghafal 14 nama kerusakan (cukup ketik `qc`, salin `FORM QC`, dan isi angka pada baris yang rusak). |
| **NFR-005** | **Kualitas Cetak PDF Drive** | File salinan template di Drive saat diekspor ke PDF muat rapi 1 halaman A4 Portrait per ≤ 4 item. |
| **NFR-006** | **Testability** | Seluruh modul logika murni dan API memiliki test otomatis dengan `node --test` (0 error, lolos 2x berturut-turut). |

---

## 7. Alur Pengguna Utama
1. **Alur WhatsApp Lapangan (`Gaya 4 — FORM QC`):** Petugas QC membuka WA di lokasi vendor → ketik `qc` → bot mengirim template `FORM QC` berisi 14 kriteria → petugas salin, isi `Vendor`, `PO`, `Barang`, `Periksa: 1000`, `MC %: 13.5`, lalu isi angka `30` di baris `Bluestain` dan `20` di `Cutter Mark` → Bot parse & fuzzy match → jika ada koreksi skor `< 0.9`, bot minta balas `#OK <KODE>` → Bot hitung `Lolos: 950` otomatis & validasi MC → Bot POST ke GAS → GAS salin template di Drive, isi form `DOK. QC-WOOD-01`, buat PDF (opsional), catat ke `REKAP_QC`, kembalikan URL Drive → Bot balas ringkasan + link Drive ke chat WA.
2. **Alur Web Form (Mobile / Admin):** Petugas/Admin buka `http://<IP-LAN>:3001` → tab **Input QC** → isi info vendor/PO → isi item, qty diperiksa, tambahkan baris jenis kerusakan & qty rusak → nilai `Lolos` & saran `Keputusan` muncul otomatis → klik **Simpan ke Google Drive** → lihat hasil link Drive di toast & tab **Riwayat QC**.
3. **Alur Offline / Gangguan:** Jika saat submit koneksi ke GAS terputus, payload masuk `message_queue.json` dengan status `pending` → background worker mengirim ulang otomatis tiap 30 detik → saat berhasil, bot mengirim notifikasi susulan ke chat asal + link Drive.

---

## 8. Model Data (Ringkas)

### Objek Laporan Kunjungan (`QCReportPayload`)
```json
{
  "noLaporan": "QC-20261126-1732569000",
  "idempotencyKey": "62812xxx:msgId123",
  "sumber": "WHATSAPP",
  "vendor": "Londo",
  "noDokumenPo": "PO-2026-112",
  "tanggalPemeriksaan": "26/11/2026",
  "petugasQc": "Budi (+62812xxxx)",
  "catatanUmum": "Sortir di lokasi vendor",
  "diketahuiVendor": "",
  "items": [
    {
      "kodeRawBody": "RB103002",
      "namaItem": "Sendok Oval",
      "tahapBarang": "Unfinish",
      "qtyDiperiksa": 1000,
      "mcMentah": 13.5,
      "mcJadi": null,
      "rusak": [
        { "kriteriaId": "BLUESTAIN", "label": "Bebas Bluestain / Jamur", "qty": 30 },
        { "kriteriaId": "CUTTER_MARK", "label": "Bebas Cutter Mark", "qty": 20 }
      ],
      "totalRusak": 50,
      "qtyLolos": 950,
      "kriteriaStatus": { "ATI": "OK", "BLUESTAIN": "NOK", "CUTTER_MARK": "NOK", "WARNA": "NA" },
      "keputusan": "Bersyarat",
      "catatanSingkat": "50 pcs disortir untuk rework vendor"
    }
  ]
}
```

### Struktur Sheet di Google Drive
1. **File per Kunjungan (Copy dari Master Template `Form QC Lap`):** Layout identik [`Form Lap QC Lap-cetak.xlsx`](docs/referensi/Form%20Lap%20QC%20Lap-cetak.xlsx).
2. **Spreadsheet Rekap Pusat:**
   - `REKAP_QC_KUNJUNGAN`: `Tanggal | No Laporan | No PO | Vendor | Petugas QC | Total Item | Total Diperiksa | Total Rusak | Total Lolos | Keputusan Umum | Link File Drive | Link PDF | Status | Catatan Umum`
   - `REKAP_QC_DETAIL_ITEM`: `Tanggal | No Laporan | Vendor | No PO | Kode Raw Body | Nama Item | Tahap | Diperiksa | MC Mentah | MC Jadi | Total Rusak | Rincian Kerusakan | Lolos Diterima | Keputusan | Catatan Item`
   - `LOG_KERUSAKAN`: `Tanggal | No Laporan | Vendor | Kode Raw Body | Nama Item | Kriteria ID | Jenis Kerusakan | Qty Rusak | Petugas QC`

---

## 9. Autentikasi & Otorisasi
- **WhatsApp Bot:** Whitelist grup melalui `ALLOWED_GROUPS` (jika diisi, hanya grup terdaftar yang diproses); autentikasi perangkat via QR pairing Baileys lokal.
- **Google Apps Script:** Deployment Web App (`Execute as: Me`, `Who has access: Anyone` sesuai pola proyek `wa`) dengan opsional shared `API_SECRET` token di header/payload bila diaktifkan di Script Properties.
- **Web Dashboard:** Berjalan lokal/LAN kantor KWaS (tidak diekspos ke internet publik secara default).

---

## 10. Integrasi & Dependensi
- **WhatsApp:** `@whiskeysockets/baileys`, `qrcode`, `qrcode-terminal`
- **Web & HTTP:** `express` (v5), `axios`, `dotenv`, `pino`
- **Pencocokan Teks:** `fastest-levenshtein`
- **Cloud:** Google Apps Script (`DriveApp`, `SpreadsheetApp`, `LockService`, `UrlFetchApp` PDF export)

---

## 11. Asumsi, Risiko & Known Issues
- **Asumsi A1:** User akan mengunggah [`docs/referensi/Form Lap QC Lap-cetak.xlsx`](docs/referensi/Form%20Lap%20QC%20Lap-cetak.xlsx) ke Google Drive sebagai Google Sheet Master Template, lalu mengisi `TEMPLATE_FILE_ID` & `OUTPUT_FOLDER_ID` (atau menjalankan `setupQcTemplate()`) di Apps Script.
- **Asumsi A2:** Output default GAS adalah 1 Google Sheet hasil copy template per kunjungan + 1 file PDF + 1 entri rekap di Spreadsheet Pusat (dapat diubah lewat flag `GENERATE_PDF`).
- **Asumsi A3:** Kategori jenis kerusakan mencakup 14 kriteria standar form + `"Lainnya"`.
- **Risiko R1 (Konversi Checkbox Excel 365):** Saat `.xlsx` diunggah ke Google Drive, checkbox Excel 365 (`featurePropertyBag.xml`) bisa terbaca sebagai teks `FALSE`. Mitigasi: `setupQcTemplate()` di `Code_QC.gs` mengonversi sel centang ke native Google Sheets checkbox.
- **Risiko R2 (Koeksistensi Sesi WA):** Memakai sesi WA yang sama dengan proyek `wa` akan memutus koneksi satu sama lain (`connectionReplaced`). Mitigasi: Gunakan nomor WA khusus QC atau jalankan hanya satu bot per nomor WA.

---

## 12. Kriteria Sukses (Terukur)
1. Laporan contoh kasus (`Periksa: 1000`, `Bluestain: 30`, `Cutter Mark: 20`) dapat di-input via template `FORM QC` (Gaya 4) WA maupun Web Form, otomatis menghasilkan `Lolos: 950`, tervalidasi akurat, dan membentuk payload GAS yang valid.
2. `gas/Code_QC.gs` memetakan seluruh sel form `DOK. QC-WOOD-01` dengan tepat (termasuk auto-duplikasi sheet bila > 4 item) dan menulis ke `REKAP_QC_*`.
3. Seluruh test otomatis (`node --test test/*.test.js`) lulus 100% dalam 2 kali eksekusi berturut-turut.
4. Web Console & Mobile Form terverifikasi berjalan dan diuji di browser nyata tanpa error console/network.

---

## 13. Riwayat Perubahan
| Versi | Tanggal | Perubahan |
|---|---|---|
| `1.1` | `2026-11-26` | Pembaruan pola input WhatsApp ke **Gaya 4 (`FORM QC` Template Isi-Angka)** sesuai keputusan user (`docs/panduan/panduan_input_user.md`, `docs/flow/flow_input_qc.html`), serta penambahan panduan setup GAS & kontrak API. |
| `1.0` | `2026-11-26` | Versi awal PRD berdasarkan form referensi `DOK. QC-WOOD-01`, arsitektur `/home/arrafi/Proyek/wa`, dan hasil wawancara kebutuhan user. |
