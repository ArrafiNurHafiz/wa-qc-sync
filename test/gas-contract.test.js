import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

function createMockGasEnv({ apiSecret = "", generatePdf = "true" } = {}) {
  const props = {
    TEMPLATE_FILE_ID: "tpl-sheet-1",
    OUTPUT_FOLDER_ID: "folder-qc-1",
    REKAP_SPREADSHEET_ID: "rekap-ss-1",
    GENERATE_PDF: generatePdf,
    API_SECRET: apiSecret
  };

  class MockRange {
    constructor(sheet, r, c, nr, nc) {
      this.sheet = sheet;
      this.r = r;
      this.c = c;
      this.nr = nr;
      this.nc = nc;
    }
    setValue(val) {
      this.sheet._setCell(this.r, this.c, val);
      return this;
    }
    setValues(vals) {
      for (let i = 0; i < vals.length; i++) {
        for (let j = 0; j < vals[i].length; j++) {
          this.sheet._setCell(this.r + i, this.c + j, vals[i][j]);
        }
      }
      return this;
    }
    getValue() {
      return this.sheet._getCell(this.r, this.c);
    }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = [];
        for (let j = 0; j < this.nc; j++) {
          row.push(this.sheet._getCell(this.r + i, this.c + j));
        }
        out.push(row);
      }
      return out;
    }
    insertCheckboxes() {
      for (let i = 0; i < this.nr; i++) {
        for (let j = 0; j < this.nc; j++) {
          this.sheet._checkboxes.add(`${this.r + i},${this.c + j}`);
        }
      }
      return this;
    }
    clearDataValidations() {
      for (let i = 0; i < this.nr; i++) {
        for (let j = 0; j < this.nc; j++) {
          this.sheet._checkboxes.delete(`${this.r + i},${this.c + j}`);
        }
      }
      return this;
    }
    clearContent() {
      for (let i = 0; i < this.nr; i++) {
        for (let j = 0; j < this.nc; j++) {
          this.sheet._setCell(this.r + i, this.c + j, "");
        }
      }
      return this;
    }
    setFontWeight() { return this; }
    setFontColor() { return this; }
    setFontSize() { return this; }
    setBackground() { return this; }
    setWrap() { return this; }
    setVerticalAlignment() { return this; }
    setHorizontalAlignment() { return this; }
    setNumberFormat() { return this; }
    setBorder() { return this; }
    merge() { return this; }
    setFormula(f) { return this.setValue(f); }
  }

  class MockSheet {
    constructor(name) {
      this.name = name;
      this.rows = [];
      this._checkboxes = new Set();
      this._charts = [];
      this.frozenRows = 0;
    }
    getCharts() { return [...this._charts]; }
    removeChart(chart) {
      this._charts = this._charts.filter((c) => c !== chart);
    }
    insertChart(chart) {
      this._charts.push(chart);
      return chart;
    }
    newChart() {
      const cfg = { chartType: null, ranges: [], options: {}, position: null, numHeaders: 0 };
      const builder = {
        setChartType: (t) => { cfg.chartType = t; return builder; },
        addRange: (r) => { cfg.ranges.push(r); return builder; },
        setNumHeaders: (n) => { cfg.numHeaders = n; return builder; },
        setOption: (k, v) => { cfg.options[k] = v; return builder; },
        setPosition: (r, c, ox, oy) => { cfg.position = { r, c, ox, oy }; return builder; },
        build: () => cfg
      };
      return builder;
    }
    setHiddenGridlines() { return this; }
    setRowHeight() { return this; }
    _colToNum(colStr) {
      let n = 0;
      for (const ch of colStr.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
      return n;
    }
    _parseA1(a1) {
      const parts = a1.split(":");
      const parseSingle = (s) => {
        const m = s.match(/^([A-Z]+)(\d+)$/i);
        return [parseInt(m[2], 10), this._colToNum(m[1])];
      };
      const [r1, c1] = parseSingle(parts[0]);
      const [r2, c2] = parts[1] ? parseSingle(parts[1]) : [r1, c1];
      return [r1, c1, r2 - r1 + 1, c2 - c1 + 1];
    }
    _setCell(r, c, val) {
      while (this.rows.length < r) this.rows.push([]);
      while (this.rows[r - 1].length < c) this.rows[r - 1].push("");
      this.rows[r - 1][c - 1] = val;
    }
    _getCell(r, c) {
      return this.rows[r - 1]?.[c - 1] ?? "";
    }
    getName() { return this.name; }
    setName(name) { this.name = name; return this; }
    getRange(a1OrRow, col, nr = 1, nc = 1) {
      if (typeof a1OrRow === "string") {
        const [r, c, rCount, cCount] = this._parseA1(a1OrRow);
        return new MockRange(this, r, c, rCount, cCount);
      }
      return new MockRange(this, a1OrRow, col, nr, nc);
    }
    appendRow(arr) {
      this.rows.push([...arr]);
      return this;
    }
    getLastRow() { return this.rows.length; }
    getDataRange() {
      const maxCols = Math.max(1, ...this.rows.map((r) => r.length));
      return new MockRange(this, 1, 1, Math.max(1, this.rows.length), maxCols);
    }
    setFrozenRows(n) { this.frozenRows = n; }
    hideSheet() { this.hidden = true; return this; }
    insertRowAfter(afterRow) {
      this.rows.splice(afterRow, 0, []);
      return this;
    }
    deleteRows(startRow, numRows) {
      this.rows.splice(startRow - 1, numRows);
      return this;
    }
    copyTo(targetSs) {
      const copy = new MockSheet(this.name + " (copy)");
      copy.rows = this.rows.map((r) => [...r]);
      copy._checkboxes = new Set(this._checkboxes);
      targetSs.sheets.push(copy);
      return copy;
    }
  }

  class MockSpreadsheet {
    constructor(id, url, initialSheets = ["Form QC Lap"]) {
      this.id = id;
      this.url = url;
      this.sheets = initialSheets.map((s) => new MockSheet(s));
    }
    getId() { return this.id; }
    getUrl() { return this.url; }
    getSheets() { return this.sheets; }
    getSheetByName(name) { return this.sheets.find((s) => s.name === name) || null; }
    insertSheet(name) {
      const s = new MockSheet(name);
      this.sheets.push(s);
      return s;
    }
  }

  const spreadsheets = new Map();
  spreadsheets.set("tpl-sheet-1", new MockSpreadsheet("tpl-sheet-1", "https://docs.google.com/spreadsheets/d/tpl-sheet-1", ["Form QC Lap"]));
  spreadsheets.set("rekap-ss-1", new MockSpreadsheet("rekap-ss-1", "https://docs.google.com/spreadsheets/d/rekap-ss-1", ["REKAP_QC_KUNJUNGAN"]));

  const driveFiles = new Map();
  const fetchedUrls = [];
  let copyCounter = 0;
  let pdfCounter = 0;
  let lockCount = 0;

  const makeDriveFile = (id, name, url, mimeType = "application/vnd.google-apps.spreadsheet", folderId = null) => ({
    id,
    name,
    url,
    mimeType,
    folderId,
    trashed: false,
    movedTo: null,
    getId: () => id,
    getName: () => name,
    getMimeType: () => mimeType,
    isTrashed: () => driveFiles.get(id).trashed,
    setTrashed: (val) => {
      driveFiles.get(id).trashed = Boolean(val);
    },
    moveTo: (targetFolder) => {
      driveFiles.get(id).movedTo = targetFolder;
      driveFiles.get(id).folderId = targetFolder?.getId ? targetFolder.getId() : null;
    },
    setName: (nextName) => {
      name = nextName;
      driveFiles.get(id).name = nextName;
    },
    getUrl: () => url,
    makeCopy: (copyName, targetFolder) => {
      copyCounter++;
      const newId = `copy-${copyCounter}`;
      const newUrl = `https://docs.google.com/spreadsheets/d/${newId}`;
      const tpl = spreadsheets.get(id);
      const cloned = new MockSpreadsheet(newId, newUrl, []);
      cloned.sheets = tpl.sheets.map((s) => {
        const ns = new MockSheet(s.name);
        ns.rows = s.rows.map((r) => [...r]);
        ns._checkboxes = new Set(s._checkboxes);
        return ns;
      });
      spreadsheets.set(newId, cloned);
      const targetFolderId = targetFolder?.getId ? targetFolder.getId() : null;
      const f = makeDriveFile(newId, copyName, newUrl, "application/vnd.google-apps.spreadsheet", targetFolderId);
      driveFiles.set(newId, f);
      return f;
    }
  });

  driveFiles.set("tpl-sheet-1", makeDriveFile("tpl-sheet-1", "Template Form QC", "https://docs.google.com/spreadsheets/d/tpl-sheet-1"));

  const makeMockFolder = (folderId, folderName) => {
    const subFolders = [];
    const folderObj = {
      id: folderId,
      name: folderName,
      getId: () => folderId,
      getName: () => folderName,
      getFoldersByName: (name) => {
        const matches = subFolders.filter((sf) => sf.name === name);
        let idx = 0;
        return {
          hasNext: () => idx < matches.length,
          next: () => matches[idx++]
        };
      },
      createFolder: (name) => {
        const sub = makeMockFolder(`${folderId}/sub-${subFolders.length + 1}`, name);
        subFolders.push(sub);
        return sub;
      },
      getFiles: () => {
        const matches = Array.from(driveFiles.values()).filter((f) => f.folderId === folderId);
        let idx = 0;
        return {
          hasNext: () => idx < matches.length,
          next: () => matches[idx++]
        };
      },
      createFile: (blob) => {
        pdfCounter++;
        const pid = `pdf-${pdfCounter}`;
        const f = makeDriveFile(pid, blob.name, `https://drive.google.com/file/d/${pid}/view`, "application/pdf", folderId);
        driveFiles.set(pid, f);
        return f;
      }
    };
    return folderObj;
  };

  const folder = makeMockFolder("out-folder-1", "arsip");

  const sandbox = {
    JSON,
    Date,
    Math,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    Logger: { log: () => {} },
    Charts: {
      ChartType: {
        COLUMN: "COLUMN",
        BAR: "BAR",
        PIE: "PIE"
      }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => props[k] || null,
        setProperty: (k, v) => { props[k] = String(v); }
      })
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { lockCount++; },
        releaseLock: () => { lockCount--; }
      })
    },
    DriveApp: {
      getFileById: (id) => {
        if (!driveFiles.has(id)) throw new Error("File not found: " + id);
        return driveFiles.get(id);
      },
      getFolderById: () => folder
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheets.get("rekap-ss-1"),
      openById: (id) => {
        if (!spreadsheets.has(id)) throw new Error("Spreadsheet not found: " + id);
        return spreadsheets.get(id);
      },
      create: (title) => {
        const nid = `created-${spreadsheets.size + 1}`;
        const nurl = `https://docs.google.com/spreadsheets/d/${nid}`;
        const ss = new MockSpreadsheet(nid, nurl, ["Sheet1"]);
        spreadsheets.set(nid, ss);
        driveFiles.set(nid, makeDriveFile(nid, title, nurl));
        return ss;
      },
      flush: () => {}
    },
    ScriptApp: {
      getOAuthToken: () => "mock-oauth-token"
    },
    UrlFetchApp: {
      fetch: (url) => {
        fetchedUrls.push(String(url));
        return {
          getResponseCode: () => 200,
          getBlob: () => ({ setName: (name) => ({ name }) })
        };
      }
    },
    ContentService: {
      MimeType: { JSON: "JSON" },
      createTextOutput: (txt) => ({
        _txt: txt,
        setMimeType() { return this; },
        getContent() { return this._txt; }
      })
    }
  };

  const gsCode = fs.readFileSync(path.resolve("gas/Code_QC.gs"), "utf8");
  vm.runInNewContext(gsCode, sandbox);

  return {
    sandbox,
    spreadsheets,
    driveFiles,
    getCopyCount: () => copyCounter,
    getPdfCount: () => pdfCounter,
    getLockCount: () => lockCount,
    getFetchedUrls: () => fetchedUrls
  };
}

test("gas/Code_QC.gs mengeksekusi setupQcTemplate, LOG_QC_REPORT (multi-tab >4 item), idempotency, dashboard, dan VOID", () => {
  const env = createMockGasEnv({ apiSecret: "rahasia-qc" });
  const getResp = JSON.parse(env.sandbox.doGet({}).getContent());
  assert.equal(getResp.status, "success");
  assert.equal(getResp.templateConfigured, true);

  // 1. Setup template & sheets rekap
  const setupRes = env.sandbox.setupQcTemplate();
  assert.equal(setupRes.status, "success");
  const rekapSs = env.spreadsheets.get("rekap-ss-1");
  assert.ok(rekapSs.getSheetByName("REKAP_QC_KUNJUNGAN"));
  assert.ok(rekapSs.getSheetByName("REKAP_QC_DETAIL_ITEM"));
  assert.ok(rekapSs.getSheetByName("LOG_KERUSAKAN"));
  assert.ok(rekapSs.getSheetByName("_LOG_META")?.hidden);
  const kHeaders = rekapSs.getSheetByName("REKAP_QC_KUNJUNGAN").rows[0];
  assert.equal(kHeaders[11], "Ati");
  assert.equal(kHeaders[15], "Bluestain");
  assert.equal(kHeaders[22], "Crack");
  assert.equal(kHeaders[26], "Lainnya");
  assert.equal(kHeaders.includes("Link PDF"), false);
  assert.equal(kHeaders.includes("Idempotency Key"), false);

  // 2. Reject jika API_SECRET salah
  const badSecret = JSON.parse(env.sandbox.doPost({
    postData: { contents: JSON.stringify({ action: "LOG_QC_REPORT", apiSecret: "salah", data: {} }) }
  }).getContent());
  assert.equal(badSecret.status, "error");
  assert.equal(env.getLockCount(), 0);

  // 3. Submit laporan 5 item (>4 item -> harus duplikasi tab Form QC Lap (2))
  const items = [1, 2, 3, 4, 5].map((i) => ({
    kodeRawBody: `RB10300${i}`,
    namaItem: `Produk ${i}`,
    tahapBarang: "Unfinish",
    qtyDiperiksa: 1000,
    mcMentah: 13.5,
    mcJadi: null,
    rusak: i === 1 ? [{ kriteriaId: "BLUESTAIN", label: "Bebas Bluestain / Jamur", qty: 30 }] : [],
    totalRusak: i === 1 ? 30 : 0,
    qtyLolos: i === 1 ? 970 : 1000,
    kriteriaStatus: i === 1 ? { BLUESTAIN: "NOK", WARNA: "NA" } : { WARNA: "OK" },
    keputusan: i === 1 ? "Bersyarat" : "Lolos",
    catatanSingkat: i === 1 ? "Rusak: 30 pcs (Bluestain: 30 pcs)" : "Mulus"
  }));

  const payload = {
    action: "LOG_QC_REPORT",
    apiSecret: "rahasia-qc",
    data: {
      noLaporan: "QC-20261126-001",
      idempotencyKey: "62812:msg001",
      vendor: "Londo",
      noDokumenPo: "PO-112",
      tanggalPemeriksaan: "26/11/2026",
      petugasQc: "Budi",
      catatanUmum: "Sortir",
      diketahuiVendor: "Pak Londo",
      items
    }
  };

  const logRes = JSON.parse(env.sandbox.doPost({
    postData: { contents: JSON.stringify(payload) }
  }).getContent());

  assert.equal(logRes.status, "success");
  assert.equal(logRes.duplicate, false);
  assert.equal(env.getCopyCount(), 1);
  assert.equal(env.getPdfCount(), 1);
  assert.equal(env.getLockCount(), 0);

  const copiedSs = env.spreadsheets.get(logRes.fileId);
  assert.equal(copiedSs.getSheets().length, 2);
  assert.equal(copiedSs.getSheets()[1].getName(), "Form QC Lap (2)");

  const tab1 = copiedSs.getSheets()[0];
  assert.equal(tab1.getRange("B4").getValue(), "Londo");
  assert.equal(tab1.getRange("J4").getValue(), "PO-112");
  assert.equal(tab1.getRange("B9").getValue(), 1000);
  assert.equal(tab1.getRange("C18").getValue(), 30); // BLUESTAIN 30 pcs rusak
  assert.equal(tab1.getRange("C27").getValue(), "–"); // WARNA NA
  assert.equal(tab1.getRange("C14").getValue(), 0); // ATI 0 rusak
  assert.equal(tab1.getRange("C32").getValue(), true); // Bersyarat
  assert.equal(tab1.getRange("B34").getValue(), 970);

  const tab2 = copiedSs.getSheets()[1];
  assert.equal(tab2.getRange("B8").getValue(), "RB103005 - Produk 5");
  assert.equal(tab2.getRange("B32").getValue(), true); // Lolos

  // 4. Idempotency check: kirim ulang payload yang sama -> tidak makeCopy ulang
  const dupRes = JSON.parse(env.sandbox.doPost({
    postData: { contents: JSON.stringify(payload) }
  }).getContent());
  assert.equal(dupRes.status, "success");
  assert.equal(dupRes.duplicate, true);
  assert.equal(dupRes.sheetUrl, logRes.sheetUrl);
  assert.equal(env.getCopyCount(), 1);

  // 5. GET_QC_DASHBOARD
  const dashRes = JSON.parse(env.sandbox.doPost({
    postData: { contents: JSON.stringify({ action: "GET_QC_DASHBOARD", apiSecret: "rahasia-qc", data: {} }) }
  }).getContent());
  assert.equal(dashRes.status, "success");
  assert.equal(dashRes.data.reports.length, 1);
  assert.equal(dashRes.data.items.length, 5);
  assert.equal(dashRes.data.defects.length, 1);
  const kRow = rekapSs.getSheetByName("REKAP_QC_KUNJUNGAN").rows[1];
  assert.equal(kRow[11], 0); // Ati = 0
  assert.equal(kRow[15], 30); // Bluestain = 30
  assert.equal(kRow[22], 0); // Crack = 0
  assert.equal(kRow[26], 0); // Lainnya = 0

  // 6. VOID_QC_REPORT + tolak void kedua (ALREADY_VOID)
  const voidRes = JSON.parse(env.sandbox.doPost({
    postData: {
      contents: JSON.stringify({
        action: "VOID_QC_REPORT",
        apiSecret: "rahasia-qc",
        data: { noLaporan: "QC-20261126-001", alasanVoid: "Salah ketik PO", oleh: "Admin" }
      })
    }
  }).getContent());
  assert.equal(voidRes.status, "success");
  assert.equal(voidRes.statusLaporan, "VOID");
  assert.match(env.driveFiles.get(logRes.fileId).name, /^\[VOID\] /);

  const voidAgain = JSON.parse(env.sandbox.doPost({
    postData: {
      contents: JSON.stringify({
        action: "VOID_QC_REPORT",
        apiSecret: "rahasia-qc",
        data: { noLaporan: "QC-20261126-001", alasanVoid: "Ulang", oleh: "Admin" }
      })
    }
  }).getContent());
  assert.equal(voidAgain.status, "error");
  assert.equal(voidAgain.code, "ALREADY_VOID");
});

test("gas/Code_QC.gs menolak TEMPLATE_FILE_ID yang masih berformat .xlsx mentah", () => {
  const env = createMockGasEnv();
  const xlsxId = "tpl-xlsx-raw";
  env.driveFiles.set(xlsxId, {
    id: xlsxId,
    name: "Form Lap QC Lap-cetak.xlsx",
    getId: () => xlsxId,
    getName: () => "Form Lap QC Lap-cetak.xlsx",
    getMimeType: () => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  env.sandbox.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => ({
        TEMPLATE_FILE_ID: xlsxId,
        OUTPUT_FOLDER_ID: "folder-qc-1",
        REKAP_SPREADSHEET_ID: "rekap-ss-1"
      }[k] || null)
    })
  };
  assert.throws(() => env.sandbox.setupQcTemplate(), /Simpan sebagai Google Sheets/);
});

test("gas/Code_QC.gs otomatis membuat Spreadsheet Rekap terpisah jika script terpasang di TEMPLATE_FILE_ID", () => {
  const env = createMockGasEnv();
  const savedProps = {
    TEMPLATE_FILE_ID: "tpl-sheet-1",
    OUTPUT_FOLDER_ID: "folder-qc-1"
  };
  env.sandbox.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => savedProps[k] || null,
      setProperty: (k, v) => { savedProps[k] = String(v); }
    })
  };
  env.sandbox.SpreadsheetApp.getActiveSpreadsheet = () => env.spreadsheets.get("tpl-sheet-1");

  const res = env.sandbox.setupQcTemplate();
  assert.equal(res.status, "success");
  assert.ok(savedProps.REKAP_SPREADSHEET_ID && savedProps.REKAP_SPREADSHEET_ID !== "tpl-sheet-1");
  const tplSs = env.spreadsheets.get("tpl-sheet-1");
  assert.equal(tplSs.getSheetByName("REKAP_QC_KUNJUNGAN"), null);
  const rekapSs = env.spreadsheets.get(savedProps.REKAP_SPREADSHEET_ID);
  assert.ok(rekapSs.getSheetByName("REKAP_QC_KUNJUNGAN"));
});

test("gas/Code_QC.gs memformat objek Date dari Sheets menjadi dd/MM/yyyy di GET_QC_DASHBOARD", () => {
  const env = createMockGasEnv();
  env.sandbox.setupQcTemplate();
  const rekapSs = env.spreadsheets.get("rekap-ss-1");
  rekapSs.getSheetByName("REKAP_QC_KUNJUNGAN").appendRow([
    new Date(2026, 10, 26), "QC-DATE-1", "PO-1", "Londo", "Budi",
    1, 100, 0, 100, "Lolos", "https://s", "https://p", "ACTIVE", "", "k1", "f1", "p1", ""
  ]);
  const dash = JSON.parse(env.sandbox.doPost({
    postData: { contents: JSON.stringify({ action: "GET_QC_DASHBOARD", data: {} }) }
  }).getContent());
  assert.equal(dash.status, "success");
  assert.equal(dash.data.reports[0].tanggal, "26/11/2026");
});

test("gas/Code_QC.gs mengekspor PDF dengan parameter fit-to-page (scale=4) dan margin ringkas A4", () => {
  const env = createMockGasEnv({ generatePdf: "true" });
  env.sandbox.setupQcTemplate();
  const res = JSON.parse(env.sandbox.doPost({
    postData: {
      contents: JSON.stringify({
        action: "LOG_QC_REPORT",
        data: {
          noLaporan: "QC-PDF-SCALE-1",
          idempotencyKey: "idem-pdf-scale-1",
          tanggalPemeriksaan: "26/11/2026",
          vendor: "Londo",
          noDokumenPo: "PO-PDF-1",
          petugasQc: "Budi",
          catatanUmum: "",
          diketahuiVendor: "-",
          items: [
            {
              kodeRawBody: "RB103002",
              namaItem: "Sendok Oval",
              tahapBarang: "Unfinish",
              qtyDiperiksa: 100,
              mcMentah: 13.5,
              rusak: [],
              totalRusak: 0,
              qtyLolos: 100,
              kriteriaStatus: {},
              keputusan: "Lolos",
              catatanSingkat: "Mulus"
            }
          ]
        }
      })
    }
  }).getContent());
  assert.equal(res.status, "success");
  const urls = env.getFetchedUrls();
  assert.equal(urls.length, 1);
  assert.match(urls[0], /format=pdf/);
  assert.match(urls[0], /size=A4/);
  assert.match(urls[0], /portrait=true/);
  assert.match(urls[0], /scale=4/);
  assert.match(urls[0], /top_margin=0\.25/);
  assert.match(urls[0], /bottom_margin=0\.25/);
});

test("gas/Code_QC.gs mengubah A22 ke TOLERANSI & PRESISI KONSTRUKSI, menyisipkan baris Crack, dan mengisi angka rusak tepat barisnya", () => {
  const env = createMockGasEnv({ generatePdf: "false" });
  const tplSheet = env.spreadsheets.get("tpl-sheet-1").getSheetByName("Form QC Lap");
  const rows = [
    [14, "Bebas Ati"], [15, "Bebas Pulur"], [16, "Bebas Teter"], [17, "Bebas Mata Mati (Lubang)"],
    [18, "Bebas Bluestain / Jamur"], [19, "Bebas Cutter Mark"], [20, "Bebas Bekas Gerinda"], [21, "Bebas Serat Balik"],
    [22, "TOLERANSI & PRESISI — CENTANG BILA SESUAI"],
    [23, "Toleransi Ukuran (± 2mm)"], [24, "Kesikuan (90°)"], [25, "Doreng (≤ 10%)"],
    [26, "KUALITAS AKHIR"], [27, "Warna Sesuai Color Card"], [28, "Kehalusan Permukaan"], [29, "Bebas Lubang"],
    [30, "HASIL PEMERIKSAAN"], [31, "Keputusan"], [33, "Catatan Singkat"], [34, "Jumlah Barang Diterima"],
    [35, "CATATAN UMUM KUNJUNGAN"], [36, "DIPERIKSA OLEH (QC)"]
  ];
  for (const [r, label] of rows) tplSheet.getRange(`A${r}`).setValue(label);

  env.sandbox.setupQcTemplate();
  assert.equal(tplSheet.getRange("A22").getValue(), "TOLERANSI & PRESISI KONSTRUKSI");
  assert.equal(tplSheet.getRange("A26").getValue(), "Crack");
  assert.equal(tplSheet.getRange("A32").getValue(), "Keputusan");

  const res = JSON.parse(env.sandbox.doPost({
    postData: {
      contents: JSON.stringify({
        action: "LOG_QC_REPORT",
        data: {
          noLaporan: "QC-CRACK-1",
          idempotencyKey: "idem-crack-1",
          tanggalPemeriksaan: "27/11/2026",
          vendor: "Londo",
          noDokumenPo: "PO-CRK-1",
          petugasQc: "Budi",
          items: [
            {
              kodeRawBody: "",
              namaItem: "Produk Custom",
              tahapBarang: "Unfinish",
              qtyDiperiksa: 1000,
              rusak: [
                { kriteriaId: "BLUESTAIN", label: "Bebas Bluestain / Jamur", qty: 30 },
                { kriteriaId: "CRACK", label: "Crack / Pecah", qty: 15 }
              ],
              totalRusak: 45,
              qtyLolos: 955,
              kriteriaStatus: { BLUESTAIN: "NOK", CRACK: "NOK" },
              keputusan: "Bersyarat",
              catatanSingkat: "Rusak: 45 pcs"
            }
          ]
        }
      })
    }
  }).getContent());
  assert.equal(res.status, "success");

  const tab1 = env.spreadsheets.get(res.fileId).getSheets()[0];
  assert.equal(tab1.getRange("C18").getValue(), 30);
  assert.equal(tab1.getRange("C26").getValue(), 15);
  assert.equal(tab1.getRange("C30").getValue(), 0);
  assert.equal(tab1.getRange("C33").getValue(), true); // Keputusan Bersyarat tergeser ke baris 33
  assert.equal(tab1.getRange("B35").getValue(), 955); // Jumlah Barang Diterima tergeser ke baris 35

  const kRow = env.spreadsheets.get("rekap-ss-1").getSheetByName("REKAP_QC_KUNJUNGAN").rows[1];
  assert.equal(kRow[22], 15); // Kolom Crack = 15

  // APPEND_QC_ITEM: tambahkan Item #2 ke file Sheet yang sama
  const appendRes = JSON.parse(env.sandbox.doPost({
    postData: {
      contents: JSON.stringify({
        action: "APPEND_QC_ITEM",
        data: {
          noLaporan: "QC-CRACK-1",
          fileId: res.fileId,
          tanggalPemeriksaan: "27/11/2026",
          vendor: "Londo",
          noDokumenPo: "PO-CRK-1",
          petugasQc: "Budi",
          item: {
            kodeRawBody: "",
            namaItem: "Produk Lanjutan 2",
            tahapBarang: "Unfinish",
            qtyDiperiksa: 200,
            rusak: [{ kriteriaId: "CRACK", label: "Crack / Pecah", qty: 10 }],
            totalRusak: 10,
            qtyLolos: 190,
            kriteriaStatus: { CRACK: "NOK" },
            keputusan: "Bersyarat",
            catatanSingkat: "Rusak: 10 pcs"
          }
        }
      })
    }
  }).getContent());
  assert.equal(appendRes.status, "success");
  assert.equal(appendRes.totalItem, 2);
  assert.equal(tab1.getRange("E8").getValue(), "Produk Lanjutan 2");
  assert.equal(tab1.getRange("F26").getValue(), 10);
  assert.equal(tab1.getRange("E35").getValue(), 190);
  assert.equal(kRow[5], 2); // Total Item = 2
  assert.equal(kRow[22], 25); // Crack akumulasi = 15 + 10
});

test("gas/Code_QC.gs default GENERATE_PDF=false hanya menyimpan Google Sheet tanpa PDF", () => {
  const env = createMockGasEnv({ generatePdf: "" });
  const res = JSON.parse(env.sandbox.doPost({
    postData: {
      contents: JSON.stringify({
        action: "LOG_QC_REPORT",
        data: {
          noLaporan: "QC-20261127-SHEET-ONLY",
          idempotencyKey: "sheet:only:1",
          vendor: "CV Kayu",
          noDokumenPo: "PO-SO-1",
          tanggalPemeriksaan: "27/11/2026",
          petugasQc: "Budi",
          items: [
            {
              kodeRawBody: "",
              namaItem: "Kursi",
              tahapBarang: "Unfinish",
              qtyDiperiksa: 100,
              rusak: [],
              totalRusak: 0,
              qtyLolos: 100,
              kriteriaStatus: {},
              keputusan: "Lolos",
              catatanSingkat: "Aman"
            }
          ]
        }
      })
    }
  }).getContent());

  assert.equal(res.status, "success");
  assert.ok(res.sheetUrl);
  assert.equal(res.pdfUrl, "");
  assert.equal(env.getCopyCount(), 1);
  assert.equal(env.getPdfCount(), 0);
});

test("gas/Code_QC.gs membuat dan menyinkronkan sheet DASHBOARD, ROWBODY, dan FINISHING termasuk saat APPEND dan VOID", () => {
  const env = createMockGasEnv({ generatePdf: "false" });
  const setupRes = env.sandbox.setupQcTemplate();
  assert.equal(setupRes.status, "success");

  const rekapSs = env.spreadsheets.get("rekap-ss-1");
  const dashSheet = rekapSs.getSheetByName("DASHBOARD");
  const rowbodySheet = rekapSs.getSheetByName("ROWBODY");
  const finishingSheet = rekapSs.getSheetByName("FINISHING");
  assert.ok(dashSheet);
  assert.ok(rowbodySheet);
  assert.ok(finishingSheet);
  assert.equal(rowbodySheet.rows[0][7], "Total Rusak Rowbody");
  assert.equal(rowbodySheet.rows[0][19], "Crack");
  assert.equal(finishingSheet.rows[0][7], "Total Rusak Finishing");
  assert.equal(finishingSheet.rows[0][8], "Warna");
  assert.equal(finishingSheet.rows[0][10], "Lubang");

  // Submit laporan dengan kerusakan Rowbody (Crack: 12, Bluestain: 5) dan Finishing (Warna: 3)
  const logRes = JSON.parse(env.sandbox.doPost({
    postData: {
      contents: JSON.stringify({
        action: "LOG_QC_REPORT",
        data: {
          noLaporan: "QC-20261127-STAGE-1",
          idempotencyKey: "stage:1",
          vendor: "CV Kayu Jaya",
          noDokumenPo: "PO-STG-1",
          tanggalPemeriksaan: "27/11/2026",
          petugasQc: "Rafi",
          keputusanUmum: "Bersyarat",
          items: [
            {
              kodeRawBody: "",
              namaItem: "Meja Kayu",
              tahapBarang: "Unfinish",
              qtyDiperiksa: 100,
              rusak: [
                { kriteriaId: "BLUESTAIN", label: "Bebas Bluestain / Jamur", qty: 5 },
                { kriteriaId: "CRACK", label: "Crack / Pecah", qty: 12 },
                { kriteriaId: "WARNA", label: "Warna Sesuai Color Card", qty: 3 }
              ],
              totalRusak: 20,
              qtyLolos: 80,
              kriteriaStatus: { BLUESTAIN: "NOK", CRACK: "NOK", WARNA: "NOK" },
              keputusan: "Bersyarat",
              catatanSingkat: "Rusak 20"
            }
          ]
        }
      })
    }
  }).getContent());
  assert.equal(logRes.status, "success");

  // Verifikasi ROWBODY (baris 2)
  assert.equal(rowbodySheet.rows[1][2], "CV Kayu Jaya");
  assert.equal(rowbodySheet.rows[1][7], 17); // 5 + 12
  assert.equal(rowbodySheet.rows[1][12], 5); // Bluestain
  assert.equal(rowbodySheet.rows[1][19], 12); // Crack

  // Verifikasi FINISHING (baris 2)
  assert.equal(finishingSheet.rows[1][2], "CV Kayu Jaya");
  assert.equal(finishingSheet.rows[1][7], 3); // Warna 3
  assert.equal(finishingSheet.rows[1][8], 3); // Warna
  assert.equal(finishingSheet.rows[1][9], 0); // Kehalusan

  // Verifikasi DASHBOARD (baris 2)
  assert.equal(dashSheet.rows[1][0], "CV Kayu Jaya");
  assert.equal(dashSheet.rows[1][1], 1); // Total Kunjungan
  assert.equal(dashSheet.rows[1][2], 100); // Total Diperiksa
  assert.equal(dashSheet.rows[1][3], 20); // Total Rusak
  assert.equal(dashSheet.rows[1][4], 80); // Total Lolos
  assert.equal(dashSheet.rows[1][10], 5); // Bluestain (col 6 + index 4)
  assert.equal(dashSheet.rows[1][17], 12); // Crack (col 6 + index 11)
  assert.equal(dashSheet.rows[1][18], 3); // Warna (col 6 + index 12)

  // Append item ke-2 -> cek ROWBODY, FINISHING, dan DASHBOARD ikut terupdate
  const appendRes = JSON.parse(env.sandbox.doPost({
    postData: {
      contents: JSON.stringify({
        action: "APPEND_QC_ITEM",
        data: {
          noLaporan: "QC-20261127-STAGE-1",
          vendor: "CV Kayu Jaya",
          noDokumenPo: "PO-STG-1",
          tanggalPemeriksaan: "27/11/2026",
          petugasQc: "Rafi",
          item: {
            kodeRawBody: "",
            namaItem: "Kursi Kayu",
            tahapBarang: "Finishing",
            qtyDiperiksa: 50,
            rusak: [{ kriteriaId: "KEHALUSAN", label: "Kehalusan Permukaan", qty: 4 }],
            totalRusak: 4,
            qtyLolos: 46,
            kriteriaStatus: { KEHALUSAN: "NOK" },
            keputusan: "Bersyarat",
            catatanSingkat: "Rusak 4"
          }
        }
      })
    }
  }).getContent());
  assert.equal(appendRes.status, "success");
  assert.equal(rowbodySheet.rows.length, 3);
  assert.equal(finishingSheet.rows.length, 3);
  assert.equal(finishingSheet.rows[2][7], 4);
  assert.equal(dashSheet.rows[1][2], 150); // Total Diperiksa 100 + 50
  assert.equal(dashSheet.rows[1][3], 24); // Total Rusak 20 + 4
  assert.equal(dashSheet.rows[1][19], 4); // Kehalusan (col 6 + index 13)
  assert.equal(dashSheet.getCharts().length, 0);
  const grafikSheet = rekapSs.getSheetByName("GRAFIK_QC");
  assert.ok(grafikSheet);
  assert.equal(grafikSheet.getCharts().length, 3);

  // VOID laporan -> DASHBOARD tetap menampilkan semua vendor master dengan angka kunjungan 0
  const voidRes = JSON.parse(env.sandbox.doPost({
    postData: {
      contents: JSON.stringify({
        action: "VOID_QC_REPORT",
        data: { noLaporan: "QC-20261127-STAGE-1", alasanVoid: "Salah input", oleh: "Admin" }
      })
    }
  }).getContent());
  assert.equal(voidRes.status, "success");
  assert.equal(dashSheet.rows.filter((r) => r[0]).length, 22); // 1 header + 21 vendor unik dari VENDOR_MASTER
  assert.equal(dashSheet.rows[1][1], 0);
  assert.equal(dashSheet.rows[1][2], 0);
  assert.equal(dashSheet.getCharts().length, 0);
  assert.equal(grafikSheet.getCharts().length, 3);

  // File laporan harus tersimpan di subfolder "Laporan QC", bukan langsung di folder arsip
  assert.equal(env.driveFiles.get("copy-1").folderId, "out-folder-1/sub-1");

  // RESET_QC_DATA tanpa konfirmasi ditolak, dengan confirm="RESET" membersihkan semua sheet & file Drive
  const badReset = JSON.parse(env.sandbox.doPost({
    postData: { contents: JSON.stringify({ action: "RESET_QC_DATA", data: { confirm: "NO" } }) }
  }).getContent());
  assert.equal(badReset.status, "error");
  assert.equal(badReset.code, "VALIDATION_ERROR");

  const resetRes = JSON.parse(env.sandbox.doPost({
    postData: { contents: JSON.stringify({ action: "RESET_QC_DATA", data: { confirm: "RESET" } }) }
  }).getContent());
  assert.equal(resetRes.status, "success");
  assert.equal(resetRes.clearedSheets, 7);
  assert.equal(resetRes.trashedFiles, 1);
  assert.equal(env.driveFiles.get("copy-1").trashed, true);
  assert.equal(rekapSs.getSheetByName("REKAP_QC_KUNJUNGAN").rows.length, 1);
  assert.equal(rekapSs.getSheetByName("ROWBODY").rows.length, 1);
  assert.equal(rekapSs.getSheetByName("FINISHING").rows.length, 1);
  assert.equal(rekapSs.getSheetByName("REKAP_QC_DETAIL_ITEM").rows.length, 1);
  assert.equal(rekapSs.getSheetByName("LOG_KERUSAKAN").rows.length, 1);
  assert.equal(rekapSs.getSheetByName("_LOG_META").rows.length, 1);
  assert.equal(rekapSs.getSheetByName("DASHBOARD").rows.filter((r) => r[0]).length, 22);
  assert.equal(rekapSs.getSheetByName("DASHBOARD").rows[1][1], 0);
  assert.equal(env.driveFiles.get("tpl-sheet-1").trashed, false);

  // ADD_MASTER_PRODUCT & ADD_MASTER_VENDOR menulis ke DB_Master & VENDOR_MASTER dan terbaca di GET_MASTER_DATA
  const addProdRes = JSON.parse(env.sandbox.doPost({
    postData: { contents: JSON.stringify({ action: "ADD_MASTER_PRODUCT", data: { namaProduk: "Talang Jati", kategori: "Kitchenware" } }) }
  }).getContent());
  assert.equal(addProdRes.status, "success");
  assert.equal(addProdRes.product.namaProduk, "Talang Jati");

  const addVenRes = JSON.parse(env.sandbox.doPost({
    postData: { contents: JSON.stringify({ action: "ADD_MASTER_VENDOR", data: { namaVendor: "CV Jati Makmur", tipeVendor: "Pre-Finishing" } }) }
  }).getContent());
  assert.equal(addVenRes.status, "success");
  assert.equal(addVenRes.vendor.namaVendor, "CV Jati Makmur");

  const masterRes = JSON.parse(env.sandbox.doPost({
    postData: { contents: JSON.stringify({ action: "GET_MASTER_DATA", data: {} }) }
  }).getContent());
  assert.equal(masterRes.status, "success");
  assert.equal(masterRes.data.products.length, 67);
  assert.equal(masterRes.data.vendors.length, 23);
});
