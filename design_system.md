# Design System — Automasi QC Lapangan KWaS (`wa-qc-sync`)

Versi: 1.0 | Tanggal: 2026-11-26 | Acuan: `PRD.md@v1.1`

---

## 1. Prinsip Desain
1. **Kecepatan Lapangan & Kejelasan Data:** Petugas QC di lokasi pengrajin harus bisa mengisi `Diperiksa` → `Kerusakan (Jenis + Qty)` → `Lolos` dari layar HP tanpa kesulitan sentuh atau salah baca angka.
2. **Konsistensi Keluarga KWaS Command:** Antarmuka Web Console mengikuti bahasa visual bersih dan fungsional milik [`/home/arrafi/Proyek/wa`](../wa/public/style.css) agar admin kantor merasa familiar saat berpindah antar aplikasi.
3. **Kesetiaan Dokumen Cetak `DOK. QC-WOOD-01`:** Elemen pratinjau/referensi dokumen cetak dan penulisan sel Google Sheets mempertahankan identitas *warm wood* dari [`docs/referensi/Form Lap QC Lap-cetak.xlsx`](docs/referensi/Form%20Lap%20QC%20Lap-cetak.xlsx).
4. **Dilarang Hardcode Nilai di Luar Token:** Seluruh CSS komponen UI wajib memakai CSS custom properties (`var(--...)`) yang didefinisikan pada Bagian 2.

---

## 2. Design Tokens (3-Layer: Primitive → Semantic → Component)

### 2.1 Primitive Tokens
```css
:root {
  /* Neutrals (Web Command Surface) */
  --p-slate-50: #f8fafc;
  --p-slate-100: #f1f5f9;
  --p-slate-200: #e2e8f0;
  --p-slate-400: #94a3b8;
  --p-slate-600: #475569;
  --p-slate-900: #0f172a;
  --p-slate-950: #090d16;
  --p-white: #ffffff;

  /* Brand & Status Accents */
  --p-sky-600: #0284c7;
  --p-sky-700: #0369a1;
  --p-sky-50: #f0f9ff;
  --p-emerald-600: #059669;
  --p-emerald-50: #ecfdf5;
  --p-amber-600: #d97706;
  --p-amber-50: #fffbeb;
  --p-rose-600: #e11d48;
  --p-rose-700: #be123c;
  --p-rose-50: #fff1f2;

  /* Warm Wood Palette (DOK. QC-WOOD-01 Print / Template Identity) */
  --p-wood-cream-light: #faf6ec;
  --p-wood-cream: #f6f0e0;
  --p-wood-sand: #eee4cb;
  --p-wood-border: #c9b98c;
  --p-wood-border-strong: #b99a5f;
  --p-wood-ink-dark: #2a2116;
  --p-wood-ink-brown: #7a5522;
  --p-wood-ink-ochre: #9c7135;
  --p-wood-ink-muted: #5c4f3c;
  --p-wood-ink-soft: #8a7a63;

  /* Typography */
  --p-font-sans: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --p-font-mono: "Geist Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;

  /* Spacing Scale */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-pill: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(9, 13, 22, 0.05);
  --shadow-md: 0 4px 12px rgba(9, 13, 22, 0.08);
  --shadow-lg: 0 12px 28px rgba(9, 13, 22, 0.14);

  /* Z-Index */
  --z-base: 1;
  --z-sticky: 40;
  --z-modal: 100;
  --z-toast: 200;
}
```

### 2.2 Semantic Tokens
```css
:root {
  --canvas: var(--p-slate-50);
  --surface: var(--p-white);
  --surface-raised: var(--p-slate-100);
  --surface-dim: var(--p-slate-200);

  --ink-primary: var(--p-slate-950);
  --ink-secondary: var(--p-slate-600);
  --ink-tertiary: var(--p-slate-400);
  --ink-border: var(--p-slate-200);

  --accent-base: var(--p-slate-900);
  --accent-action: var(--p-sky-600);
  --accent-hover: var(--p-sky-700);
  --accent-soft: var(--p-sky-50);

  --status-ok: var(--p-emerald-600);
  --status-ok-bg: var(--p-emerald-50);
  --status-warn: var(--p-amber-600);
  --status-warn-bg: var(--p-amber-50);
  --status-err: var(--p-rose-600);
  --status-err-hover: var(--p-rose-700);
  --status-err-bg: var(--p-rose-50);

  --font-sans: var(--p-font-sans);
  --font-mono: var(--p-font-mono);
}
```

### 2.3 Tipografi & Skala Ukuran
| Peran | Token / Ukuran | Bobot | Catatan |
|---|---|---|---|
| Judul Bar HUD | `0.95rem` (`15.2px`) | `700` | Tight tracking `-0.01em` |
| Judul Panel / Halaman | `1.25rem` (`20px`) | `700` | Line-height `1.3` |
| Judul Kartu | `1rem` (`16px`) | `600` | |
| Label Field / Tag | `0.72rem` (`11.5px`) | `700` | Uppercase + tracking `0.04em` |
| Teks Tubuh / Input | `0.875rem`–`0.95rem` | `400`–`500` | Input mobile minimal `16px` agar iOS/Android tidak auto-zoom |
| Angka / Kode SKU / PO / MC% | `--font-mono` | `500`–`600` | `font-variant-numeric: tabular-nums` |

### 2.4 Breakpoints Responsif
- **Mobile (`< 640px`):** Navigasi tab dapat di-scroll horizontal atau wrap rapi, layout 1 kolom, kontrol form full-width, tombol `min-height: 44px`.
- **Tablet (`640px–1023px`):** Grid 2 kolom untuk metadata kunjungan & kartu item.
- **Desktop (`≥ 1024px`):** Container maks `1360px` terpusat, HUD bar sticky `64px`, tabel riwayat penuh dengan horizontal scroll aman.

---

## 3. Spesifikasi Komponen & State

| Komponen | Varian | State Wajib (`default`, `hover`, `active`, `disabled`, `error`, `loading`) |
|---|---|---|
| **Button (`.btn`)** | `btn-primary` (`--accent-action`), `btn-neutral` (`--surface`), `btn-destruct` (`--status-err`) | `default`: warna token; `hover`: `--accent-hover` / `--surface-raised` / `--status-err-hover`; `active`: `scale(0.99)`; `disabled`: `opacity: 0.5; cursor: not-allowed`; `loading`: spinner + teks proses non-klik |
| **Input & Select (`.field-input`)** | Text, Number (`tabular-nums`), Date, Select/Datalist, Textarea | `default`: border `1px solid var(--ink-border)`; `focus-visible`: `border-color: var(--accent-action); box-shadow: 0 0 0 3px var(--accent-soft)`; `disabled`: `--surface-raised`; `error`: `border-color: var(--status-err); background: var(--status-err-bg)` + pesan teks error di bawah field |
| **3-State Criterion Toggle (`.crit-toggle`)** | `OK (✓)` / `NOK (✗)` / `NA (–)` | Touch target `≥ 44×44px`; `OK`: hijau `--status-ok-bg`; `NOK`: merah `--status-err-bg` + auto-fokus catatan; `NA`: abu `--surface-raised`; `disabled`: opacity `0.5` |
| **Defect Row Builder (`.defect-row`)** | Baris dinamis (Dropdown/Input Jenis Kerusakan + Qty Rusak + Tombol Hapus) | `error` jika Qty > sisa Diperiksa atau <= 0; mendukung tambah/hapus baris tanpa reload |
| **Card (`.card`)** | Default Card, Summary KPI Card, Item QC Card | Border `1px solid var(--ink-border)`, radius `--radius-md`, padding `--space-5`; KPI lolos/rusak memakai aksen warna semantik |
| **Modal / Dialog (`.dialog-box`)** | Konfirmasi Void/Reset, Detail/Preview Laporan, Panduan `#HELP` | Backdrop `rgba(9, 13, 22, 0.45)`, `z-index: var(--z-modal)`, tutup lewat tombol `×` atau `Escape` |
| **Table (`.grid-table`)** | Tabel Riwayat Kunjungan & Detail Item | Header sticky/surface-raised, empty state informatif, loading skeleton/spinner, angka rata kanan (`tabular-nums`) |
| **Navigation Pills (`.nav-pill`)** | Gateway WA, Input QC, Riwayat & Rekap, Pengaturan | `active`: background `--surface`, shadow `--shadow-sm`, ink `--ink-primary`; `hover`: `--ink-primary` |
| **Toast & Banner (`.toast`)** | `success`, `warn`, `error` | `z-index: var(--z-toast)`, muncul kanan bawah (desktop) / atas-bawah penuh (mobile), hilang otomatis 4–5 detik |

---

## 4. Layout, Ikonografi, & Aksesibilitas
- **Layout:** Top HUD Bar (`64px`) berisi Brand (`KWaS QC COMMAND`), 4 tab `.pill-nav`, metrik ringkas (Total Laporan / Pass Rate), badge status WhatsApp (`CONNECTED`/`SCAN QR`/`DISCONNECTED`), lalu `<main class="viewport">`.
- **Ikonografi:** Inline SVG 1.5–2px stroke (gaya Lucide) seperti pada proyek `wa`, tanpa library icon eksternal yang memblokir offline LAN.
- **Aksesibilitas (WCAG AA):**
  - Rasio kontras teks utama `--ink-primary` (`#090d16`) di atas `--surface` (`#ffffff`) dan `--canvas` (`#f8fafc`) > 15:1; `--ink-secondary` (`#475569`) > 7:1.
  - Semua `<input>` / `<select>` terhubung ke `<label for="...">`; tombol ikon punya `aria-label`; status WA & toast memakai `aria-live="polite"`.
  - Fokus keyboard terlihat jelas (`outline: 2px solid var(--accent-action); outline-offset: 2px`).

---

## 5. Tone, Copywriting, & Do/Don't
- **Bahasa UI:** Bahasa Indonesia operasional yang tegas dan ringkas (contoh: *"Jumlah Diperiksa"*, *"Rincian Kerusakan"*, *"Lolos / Diterima"*, *"Buka File Drive"*).
- **Pesan Error:** Selalu sebutkan apa yang salah dan cara memperbaikinya (contoh: *"Total kerusakan (1.050 pcs) melebihi jumlah diperiksa (1.000 pcs)."*).

| Do | Don't |
|---|---|
| Gunakan CSS custom properties (`var(--...)`) untuk semua warna, font, radius | Jangan menulis nilai hex mentah di CSS komponen atau inline style |
| Jadikan touch target form HP minimal `44×44 px` | Jangan memakai tabel sempit tidak responsif untuk input lapangan di HP |
| Daftarkan komponen baru di `design_system.md` sebelum dipakai di `public/` | Jangan memakai `alert()` / `confirm()` bawaan browser |
