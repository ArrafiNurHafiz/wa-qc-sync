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
    setFontWeight() { return this; }
    setBackground() { return this; }
    setWrap() { return this; }
    setVerticalAlignment() { return this; }
    setHorizontalAlignment() { return this; }
  }

  class MockSheet {
    constructor(name) {
      this.name = name;
      this.rows = [];
      this._checkboxes = new Set();
      this.frozenRows = 0;
    }
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

  const makeDriveFile = (id, name, url, mimeType = "application/vnd.google-apps.spreadsheet") => ({
    id,
    name,
    url,
    mimeType,
    movedTo: null,
    getId: () => id,
    getName: () => name,
    getMimeType: () => mimeType,
    moveTo: (targetFolder) => {
      driveFiles.get(id).movedTo = targetFolder;
    },
    setName: (nextName) => {
      name = nextName;
      driveFiles.get(id).name = nextName;
    },
    getUrl: () => url,
    makeCopy: (copyName) => {
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
      const f = makeDriveFile(newId, copyName, newUrl);
      driveFiles.set(newId, f);
      return f;
    }
  });

  driveFiles.set("tpl-sheet-1", makeDriveFile("tpl-sheet-1", "Template Form QC", "https://docs.google.com/spreadsheets/d/tpl-sheet-1"));

  const folder = {
    createFile: (blob) => {
      pdfCounter++;
      const pid = `pdf-${pdfCounter}`;
      const f = makeDriveFile(pid, blob.name, `https://drive.google.com/file/d/${pid}/view`);
      driveFiles.set(pid, f);
      return f;
    }
  };

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
  assert.equal(tab1.getRange("C18").getValue(), false); // BLUESTAIN NOK
  assert.equal(tab1.getRange("C27").getValue(), "–"); // WARNA NA
  assert.equal(tab1.getRange("C14").getValue(), true); // ATI OK
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
