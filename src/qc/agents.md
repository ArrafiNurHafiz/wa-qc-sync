# agents.md — src/qc

## Peran Folder
Menyimpan logika domain murni QC Lapangan KWaS: kamus SKU/Vendor/14 Kriteria, fuzzy matcher, validator hitungan & standar MC, generator & parser template WhatsApp `FORM QC` (Gaya 4), dan teks bantuan.

## Scope
- **Boleh:** Generasi & parsing template `FORM QC` (`qc`/`#QC`), fuzzy matching teks (`fastest-levenshtein`), validasi aturan domain QC (`diperiksa`, `rusak[]`, `lolos`, MC ≤ 15%/17%), penyusunan teks `#HELP`/`#KRITERIA`.
- **Dilarang:** Membuka socket WhatsApp, menjalankan HTTP server, membaca/menulis file lokal langsung (`fs`), atau memanggil webhook GAS langsung (kecuali helper sync dictionary yang menerima URL/fetcher).

## Dokumen Rujukan
- [`/home/arrafi/RAFI/agent.md`](/home/arrafi/RAFI/agent.md)
- [`../../PRD.md`](../../PRD.md) (FR-001 s.d. FR-004, FR-010)
- [`../../docs/panduan/panduan_input_user.md`](../../docs/panduan/panduan_input_user.md)
- [`../../docs/arsitektur/arsitektur.json`](../../docs/arsitektur/arsitektur.json)

## Interface (Kontrak)
Ekspor publik: `PRODUCT_MASTER`, `VENDORS_PRE`, `VENDORS_FIN`, `QC_CRITERIA`, `syncDictionaryFromWebhook()`, `matchProduct()`, `matchVendorWithConfidence()`, `matchCriterion()`, `validateQcReport()`, `parseQcMessage()`, `getQcTemplateText()`, `getHelpText()`, `getCriteriaText()`.

## Aturan Lokal
- Semua fungsi parser & validator harus deterministik dan dapat diuji unit via `node --test`.
- Jangan melempar exception tak tertangani untuk input user yang buruk; kembalikan objek `{ error }` terstruktur.

## Validasi Lokal
- `node --test test/matcher.test.js test/qc-validator.test.js test/qc-parser.test.js`

## Agent Tetangga
| Agent | Folder | Hubungan | Delegasi |
|---|---|---|---|
| `runtime-gateway` | `src/runtime` | Konsumen parser, matcher, validator | [`../runtime/agents.md`](../runtime/agents.md) |
| `web-api` | `src/web` | Konsumen validator & kamus master | [`../web/agents.md`](../web/agents.md) |

## Catatan Sinkronisasi
2026-11-26 | Acuan: `PRD.md@v1.1`, `arsitektur.json@v1.0.1`
