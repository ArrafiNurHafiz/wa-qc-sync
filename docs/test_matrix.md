# Test Matrix — Automasi QC Lapangan KWaS (`wa-qc-sync`)

> Pemetaan `FR/NFR` ke test otomatis (`node --test`) dan lapisan verifikasi. Diperbarui setiap kali test ditambahkan atau dijalankan.

| FR/NFR | Test (`file::nama`) | Lapisan | Status terakhir | Tanggal |
|---|---|---|---|---|
| **FR-001** | `test/qc-parser.test.js` (perintah `qc`/`#QC`, `FORM QC` Gaya 4, hapus baris kosong, `-`/`NA`, `---` multi-item, `Lainnya`, error field wajib) | Unit | **PASS** (5 test) | 2026-11-26 |
| **FR-002** | `test/qc-parser.test.js` & `test/runtime-handler.test.js` (`#HELP`, `#KRITERIA`, `#PRODUK`, `#VENDOR PRE`/`FIN`, `#STATUS`) | Unit / Integrasi Lokal | **PASS** | 2026-11-26 |
| **FR-003** | `test/matcher.test.js` & `test/correction-store.test.js` & `test/runtime-handler.test.js` (66 SKU, exact/alias, `#OK <6-HEX>` TTL 5m per pengirim, `< 0.50` ditolak/fallback `Lainnya`) | Unit | **PASS** | 2026-11-26 |
| **FR-004** | `test/qc-validator.test.js` (hitung `Lolos`, MC Mentah `<= 15%` / Jadi `<= 17%`, larangan `Lolos` penuh saat pelanggaran MC/NOK, wajib detail `Lainnya`/NOK) | Unit | **PASS** (5 test) | 2026-11-26 |
| **FR-005..FR-007** | `test/gas-contract.test.js` (`setupQcTemplate()`, exact cell mapping `DOK. QC-WOOD-01`, multi-tab `> 4` item, PDF export `scale=4`, `REKAP_QC_*`, `LOG_KERUSAKAN`, format `Date` `dd/MM/yyyy`) + Live GAS E2E (`UJI-KONEKSI-001` di Google Sheets & Drive) | Kontrak Sandbox GAS & Live E2E | **PASS** *(patch terbaru `Code_QC.gs` menunggu re-deploy GAS user)* | 2026-11-26 |
| **FR-008** | `test/message-queue.test.js`, `test/runtime-handler.test.js`, `test/web-api.test.js`, `test/gas-contract.test.js` (atomic write, FIFO retry, dedup `idempotencyKey`, HTTP `202` queued) | Unit / Integrasi Lokal | **PASS** | 2026-11-26 |
| **FR-009, FR-011** | `test/web-api.test.js` (`/api/*`, `VOID_QC_REPORT`, `ALREADY_VOID` 409) + Chrome CDP E2E nyata (`1280x800` & `375x812`, baik mock maupun live GAS `:3001`, verifikasi tanggal `26/11/2026`, modal detail, nol console error) | Backend/API & Browser E2E | **PASS** | 2026-11-26 |
| **FR-010** | `test/matcher.test.js` (`syncDictionaryFromWebhook`), `test/correction-store.test.js` (`ALLOWED_GROUPS`), `test/runtime-handler.test.js` | Unit / Integrasi Lokal | **PASS** | 2026-11-26 |
| **CLI / Packaging** | `test/cli.test.js` (`parseCliArgs`, `resolveCliDataDir` isolasi proyek lain -> `~/.wa-qc-sync`, symlink `wa-qc-sync setup -y` + `doctor`) + uji `npm pack` & global install | CLI & Packaging E2E | **PASS** | 2026-11-26 |
| **NFR-001..NFR-006** | `.gitignore`, tidak bocor `API_SECRET`, port `3001`, touch target `>= 44px`, `node --test` 2x berturut-turut, diff & token check, serta PDF export parameter `scale=4` | Statis, Unit & Live E2E | **PASS** *(ekspor PDF live 1 halaman A4 perlu re-verify setelah user re-deploy `Code_QC.gs`)* | 2026-11-26 |
