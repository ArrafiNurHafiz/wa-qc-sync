/**
 * Code_QC.gs — Google Apps Script Web App untuk Automasi QC Lapangan KWaS (wa-qc-sync)
 * Menulis salinan form DOK. QC-WOOD-01 (+ ekspor PDF opsional) ke Google Drive
 * serta mencatat rekap terpusat ke REKAP_QC_KUNJUNGAN, REKAP_QC_DETAIL_ITEM, dan LOG_KERUSAKAN.
 */

var SHEET_NAMES = {
  GRAFIK: "GRAFIK_QC",
  KUNJUNGAN: "REKAP_QC_KUNJUNGAN",
  DETAIL: "REKAP_QC_DETAIL_ITEM",
  KERUSAKAN: "LOG_KERUSAKAN",
  DASHBOARD: "DASHBOARD",
  ROWBODY: "ROWBODY",
  FINISHING: "FINISHING",
  META: "_LOG_META"
};

var ROWBODY_DEFECT_COLUMNS = [
  { id: "ATI", label: "Ati" },
  { id: "PULUR", label: "Pulur" },
  { id: "TETER", label: "Teter" },
  { id: "MATA_MATI", label: "Mata Mati" },
  { id: "BLUESTAIN", label: "Bluestain" },
  { id: "CUTTER_MARK", label: "Cutter Mark" },
  { id: "BEKAS_GERINDA", label: "Gerinda" },
  { id: "SERAT_BALIK", label: "Serat Balik" },
  { id: "TOLERANSI_UKURAN", label: "Ukuran" },
  { id: "KESIKUAN", label: "Kesikuan" },
  { id: "DORENG", label: "Doreng" },
  { id: "CRACK", label: "Crack" }
];

var FINISHING_DEFECT_COLUMNS = [
  { id: "WARNA", label: "Warna" },
  { id: "KEHALUSAN", label: "Kehalusan" },
  { id: "BEBAS_LUBANG", label: "Lubang" }
];

var DEFECT_REKAP_COLUMNS = [
  { id: "ATI", label: "Ati" },
  { id: "PULUR", label: "Pulur" },
  { id: "TETER", label: "Teter" },
  { id: "MATA_MATI", label: "Mata Mati" },
  { id: "BLUESTAIN", label: "Bluestain" },
  { id: "CUTTER_MARK", label: "Cutter Mark" },
  { id: "BEKAS_GERINDA", label: "Gerinda" },
  { id: "SERAT_BALIK", label: "Serat Balik" },
  { id: "TOLERANSI_UKURAN", label: "Ukuran" },
  { id: "KESIKUAN", label: "Kesikuan" },
  { id: "DORENG", label: "Doreng" },
  { id: "CRACK", label: "Crack" },
  { id: "WARNA", label: "Warna" },
  { id: "KEHALUSAN", label: "Kehalusan" },
  { id: "BEBAS_LUBANG", label: "Lubang" },
  { id: "LAINNYA", label: "Lainnya" }
];

var TEMPLATE_SHEET_NAME = "Form QC Lap";
var REPORT_SUBFOLDER_NAME = "Laporan QC";

function getReportOutputFolder(cfg) {
  var rootFolder = DriveApp.getFolderById(cfg.outputFolderId);
  if (
    typeof rootFolder.getFoldersByName === "function" &&
    typeof rootFolder.createFolder === "function"
  ) {
    var iter = rootFolder.getFoldersByName(REPORT_SUBFOLDER_NAME);
    if (iter && typeof iter.hasNext === "function" && iter.hasNext()) {
      return iter.next();
    }
    return rootFolder.createFolder(REPORT_SUBFOLDER_NAME);
  }
  return rootFolder;
}

var CRITERIA_ROW_MAP = [
  { id: "ATI", row: 14, label: "Bebas Ati" },
  { id: "PULUR", row: 15, label: "Bebas Pulur" },
  { id: "TETER", row: 16, label: "Bebas Teter" },
  { id: "MATA_MATI", row: 17, label: "Bebas Mata Mati (Lubang)" },
  { id: "BLUESTAIN", row: 18, label: "Bebas Bluestain / Jamur" },
  { id: "CUTTER_MARK", row: 19, label: "Bebas Cutter Mark" },
  { id: "BEKAS_GERINDA", row: 20, label: "Bebas Bekas Gerinda" },
  { id: "SERAT_BALIK", row: 21, label: "Bebas Serat Balik" },
  { id: "TOLERANSI_UKURAN", row: 23, label: "Toleransi Ukuran (± 2mm)" },
  { id: "KESIKUAN", row: 24, label: "Kesikuan (90°)" },
  { id: "DORENG", row: 25, label: "Doreng (≤ 10%)" },
  { id: "CRACK", row: 26, label: "Crack / Pecah" },
  { id: "WARNA", row: 28, label: "Warna Sesuai Color Card" },
  { id: "KEHALUSAN", row: 29, label: "Kehalusan Permukaan" },
  { id: "BEBAS_LUBANG", row: 30, label: "Bebas Lubang" }
];

var ITEM_SLOTS = [
  { valCol: "B", chkCol: "C", decCols: ["B", "C", "D"] },
  { valCol: "E", chkCol: "F", decCols: ["E", "F", "G"] },
  { valCol: "H", chkCol: "I", decCols: ["H", "I", "J"] },
  { valCol: "K", chkCol: "L", decCols: ["K", "L", "M"] }
];

function getProps() {
  var p = PropertiesService.getScriptProperties();
  return {
    templateFileId: (p.getProperty("TEMPLATE_FILE_ID") || "").trim(),
    outputFolderId: (p.getProperty("OUTPUT_FOLDER_ID") || "").trim(),
    rekapSpreadsheetId: (p.getProperty("REKAP_SPREADSHEET_ID") || "").trim(),
    generatePdf: (p.getProperty("GENERATE_PDF") || "false").trim().toLowerCase() === "true",
    apiSecret: (p.getProperty("API_SECRET") || "").trim()
  };
}

function getRekapSpreadsheet(cfg) {
  if (cfg.rekapSpreadsheetId) {
    return SpreadsheetApp.openById(cfg.rekapSpreadsheetId);
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active && (!cfg.templateFileId || active.getId() !== cfg.templateFileId)) {
    return active;
  }

  // Jika script terpasang langsung di file Template atau standalone, buat Spreadsheet Rekap terpisah
  var created = SpreadsheetApp.create("REKAP QC PUSAT — KWaS");
  var newId = created.getId();
  if (cfg.outputFolderId) {
    try {
      var folder = DriveApp.getFolderById(cfg.outputFolderId);
      DriveApp.getFileById(newId).moveTo(folder);
    } catch (moveErr) {
      Logger.log("Gagal memindahkan REKAP QC PUSAT ke OUTPUT_FOLDER_ID: " + moveErr.toString());
    }
  }
  PropertiesService.getScriptProperties().setProperty("REKAP_SPREADSHEET_ID", newId);
  cfg.rekapSpreadsheetId = newId;
  return created;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var cfg = getProps();
  return jsonResponse({
    status: "success",
    service: "wa-qc-sync-gas",
    templateConfigured: Boolean(cfg.templateFileId),
    outputFolderConfigured: Boolean(cfg.outputFolderId),
    generatePdf: cfg.generatePdf,
    timestamp: new Date().toISOString()
  });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return jsonResponse({
      status: "error",
      code: "LOCK_TIMEOUT",
      message: "Server GAS sedang sibuk memproses laporan lain. Coba lagi sebentar."
    });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ status: "error", message: "Payload kosong." });
    }

    var payload = JSON.parse(e.postData.contents);
    var cfg = getProps();

    if (cfg.apiSecret) {
      var incomingSecret = String(payload.apiSecret || (payload.data && payload.data.apiSecret) || "").trim();
      if (incomingSecret !== cfg.apiSecret) {
        return jsonResponse({ status: "error", code: "UNAUTHORIZED", message: "API_SECRET tidak cocok." });
      }
    }

    var action = String(payload.action || "").toUpperCase();
    var data = payload.data || {};

    if (action === "LOG_QC_REPORT") {
      return handleLogQcReport(data, cfg);
    } else if (action === "APPEND_QC_ITEM") {
      return handleAppendQcItem(data, cfg);
    } else if (action === "GET_QC_DASHBOARD") {
      return handleGetQcDashboard(data, cfg);
    } else if (action === "VOID_QC_REPORT") {
      return handleVoidQcReport(data, cfg);
    } else if (action === "RESET_QC_DATA") {
      return handleResetQcData(data, cfg);
    } else if (action === "GET_MASTER_DATA") {
      return handleGetMasterData(cfg);
    } else if (action === "ADD_MASTER_PRODUCT") {
      return handleAddMasterProduct(data, cfg);
    } else if (action === "ADD_MASTER_VENDOR") {
      return handleAddMasterVendor(data, cfg);
    }

    return jsonResponse({ status: "error", message: "Action tidak dikenali: " + action });
  } catch (err) {
    return jsonResponse({ status: "error", message: "Kesalahan GAS: " + err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function ensureRekapSheets(ss) {
  var kunjunganHeaders = [
    "Tanggal", "No Laporan", "No PO", "Vendor", "Petugas QC",
    "Total Item", "Total Diperiksa", "Total Rusak", "Total Lolos",
    "Keputusan Umum", "Link File Drive"
  ];
  for (var k = 0; k < DEFECT_REKAP_COLUMNS.length; k++) {
    kunjunganHeaders.push(DEFECT_REKAP_COLUMNS[k].label);
  }

  var dashboardHeaders = [
    "Vendor", "Total Kunjungan", "Total Diperiksa", "Total Rusak", "Total Lolos", "Pass Rate (%)"
  ];
  for (var d = 0; d < DEFECT_REKAP_COLUMNS.length; d++) {
    dashboardHeaders.push(DEFECT_REKAP_COLUMNS[d].label);
  }

  var rowbodyHeaders = [
    "Tanggal", "No Laporan", "Vendor", "No PO", "Nama Item", "Tahap",
    "Diperiksa", "Total Rusak Rowbody"
  ];
  for (var rCol = 0; rCol < ROWBODY_DEFECT_COLUMNS.length; rCol++) {
    rowbodyHeaders.push(ROWBODY_DEFECT_COLUMNS[rCol].label);
  }
  rowbodyHeaders.push("Keputusan", "Petugas QC");

  var finishingHeaders = [
    "Tanggal", "No Laporan", "Vendor", "No PO", "Nama Item", "Tahap",
    "Diperiksa", "Total Rusak Finishing"
  ];
  for (var fCol = 0; fCol < FINISHING_DEFECT_COLUMNS.length; fCol++) {
    finishingHeaders.push(FINISHING_DEFECT_COLUMNS[fCol].label);
  }
  finishingHeaders.push("Keputusan", "Petugas QC");

  var defs = [
    {
      name: SHEET_NAMES.DASHBOARD,
      headers: dashboardHeaders,
      hidden: false
    },
    {
      name: SHEET_NAMES.KUNJUNGAN,
      headers: kunjunganHeaders,
      hidden: false
    },
    {
      name: SHEET_NAMES.ROWBODY,
      headers: rowbodyHeaders,
      hidden: false
    },
    {
      name: SHEET_NAMES.FINISHING,
      headers: finishingHeaders,
      hidden: false
    },
    {
      name: SHEET_NAMES.DETAIL,
      headers: [
        "Tanggal", "No Laporan", "Vendor", "No PO", "Kode Raw Body",
        "Nama Item", "Tahap", "Diperiksa", "MC Mentah", "MC Jadi",
        "Total Rusak", "Rincian Kerusakan", "Lolos Diterima", "Keputusan", "Catatan Item"
      ],
      hidden: false
    },
    {
      name: SHEET_NAMES.KERUSAKAN,
      headers: [
        "Tanggal", "No Laporan", "Vendor", "Kode Raw Body", "Nama Item",
        "Kriteria ID", "Jenis Kerusakan", "Qty Rusak", "Petugas QC"
      ],
      hidden: false
    },
    {
      name: SHEET_NAMES.META,
      headers: [
        "No Laporan", "Idempotency Key", "Status", "Link PDF",
        "File ID", "PDF File ID", "Catatan Umum", "Alasan Void"
      ],
      hidden: true
    }
  ];

  for (var i = 0; i < defs.length; i++) {
    var def = defs[i];
    var sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
    }
    var firstCell = String(sheet.getRange(1, 1).getValue() || "").trim();
    var needsHeaderUpgrade = def.name === SHEET_NAMES.KUNJUNGAN &&
      (String(sheet.getRange(1, 12).getValue() || "").trim() === "Link PDF" ||
       String(sheet.getRange(1, 23).getValue() || "").trim() !== "Crack");
    if (!firstCell || needsHeaderUpgrade) {
      var headerRange = sheet.getRange(1, 1, 1, def.headers.length);
      headerRange.setValues([def.headers]);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#f1f5f9");
      sheet.setFrozenRows(1);
    }
    if (def.hidden && typeof sheet.hideSheet === "function") {
      sheet.hideSheet();
    }
  }

  if (!ss.getSheetByName(SHEET_NAMES.GRAFIK)) {
    ss.insertSheet(SHEET_NAMES.GRAFIK);
  }
}

function buildStageLogRow(data, item, noLaporan, columns) {
  var defectList = Array.isArray(item.rusak) ? item.rusak : [];
  var defectMap = {};
  for (var i = 0; i < defectList.length; i++) {
    var d = defectList[i];
    var qty = Number(d.qty) || 0;
    if (qty > 0) {
      var kId = String(d.kriteriaId || "").toUpperCase();
      defectMap[kId] = (defectMap[kId] || 0) + qty;
    }
  }

  var stageTotal = 0;
  var counts = [];
  for (var c = 0; c < columns.length; c++) {
    var val = defectMap[columns[c].id] || 0;
    stageTotal += val;
    counts.push(val);
  }

  var row = [
    data.tanggalPemeriksaan || "",
    noLaporan,
    data.vendor || "",
    data.noDokumenPo || "-",
    item.namaItem || "",
    item.tahapBarang || "Unfinish",
    Number(item.qtyDiperiksa) || 0,
    stageTotal
  ];
  for (var idx = 0; idx < counts.length; idx++) {
    row.push(counts[idx]);
  }
  row.push(item.keputusan || "Lolos", data.petugasQc || "-");
  return row;
}

function appendStageLogs(rekapSs, data, item, noLaporan) {
  var lap = noLaporan || data.noLaporan || "";
  var rowbodySheet = rekapSs.getSheetByName(SHEET_NAMES.ROWBODY);
  if (rowbodySheet) {
    rowbodySheet.appendRow(buildStageLogRow(data, item, lap, ROWBODY_DEFECT_COLUMNS));
  }
  var finishingSheet = rekapSs.getSheetByName(SHEET_NAMES.FINISHING);
  if (finishingSheet) {
    finishingSheet.appendRow(buildStageLogRow(data, item, lap, FINISHING_DEFECT_COLUMNS));
  }
}

function styleKpiCard(sheet, startCol, title, formula, accentColor, numFormat) {
  var titleRange = sheet.getRange(4, startCol, 1, 2);
  if (typeof titleRange.merge === "function") titleRange.merge();
  titleRange.setValue(title);
  if (typeof titleRange.setFontSize === "function") titleRange.setFontSize(9);
  titleRange.setFontWeight("bold");
  if (typeof titleRange.setFontColor === "function") titleRange.setFontColor("#475569");
  titleRange.setBackground("#f8fafc");
  titleRange.setHorizontalAlignment("center");
  if (typeof titleRange.setBorder === "function") titleRange.setBorder(true, true, false, true, false, false, "#cbd5e1", null);

  var valRange = sheet.getRange(5, startCol, 1, 2);
  if (typeof valRange.merge === "function") valRange.merge();
  if (typeof valRange.setFormula === "function") valRange.setFormula(formula);
  else valRange.setValue(formula);
  if (typeof valRange.setFontSize === "function") valRange.setFontSize(18);
  valRange.setFontWeight("bold");
  if (typeof valRange.setFontColor === "function") valRange.setFontColor(accentColor || "#0f172a");
  valRange.setBackground("#ffffff");
  valRange.setHorizontalAlignment("center");
  valRange.setVerticalAlignment("middle");
  if (numFormat && typeof valRange.setNumberFormat === "function") valRange.setNumberFormat(numFormat);
  if (typeof valRange.setBorder === "function") valRange.setBorder(false, true, true, true, false, false, "#cbd5e1", null);
}

function colIndexToLetter(colIdx) {
  var letter = "";
  var n = colIdx;
  while (n > 0) {
    var rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function buildGrafikSheetLayout(grafikSheet, vendorCount) {
  if (!grafikSheet) return;
  if (typeof grafikSheet.setHiddenGridlines === "function") {
    grafikSheet.setHiddenGridlines(true);
  }

  var banner = grafikSheet.getRange(1, 2, 1, 13);
  if (typeof banner.merge === "function") banner.merge();
  banner.setValue("GRAFIK & PERFORMA QUALITY CONTROL — CV KARYA WAHANA SENTOSA");
  banner.setBackground("#0f172a");
  if (typeof banner.setFontColor === "function") banner.setFontColor("#ffffff");
  if (typeof banner.setFontSize === "function") banner.setFontSize(14);
  banner.setFontWeight("bold");
  banner.setVerticalAlignment("middle");
  banner.setHorizontalAlignment("left");

  var subBanner = grafikSheet.getRange(2, 2, 1, 13);
  if (typeof subBanner.merge === "function") subBanner.merge();
  subBanner.setValue("Ringkasan otomatis performa vendor & distribusi kerusakan berdasarkan data DASHBOARD (DOK. QC-WOOD-01)");
  subBanner.setBackground("#1e293b");
  if (typeof subBanner.setFontColor === "function") subBanner.setFontColor("#cbd5e1");
  if (typeof subBanner.setFontSize === "function") subBanner.setFontSize(9.5);
  subBanner.setVerticalAlignment("middle");

  if (typeof grafikSheet.setRowHeight === "function") {
    grafikSheet.setRowHeight(1, 34);
    grafikSheet.setRowHeight(2, 22);
    grafikSheet.setRowHeight(4, 22);
    grafikSheet.setRowHeight(5, 36);
  }

  var lastDashRow = Math.max(2, vendorCount + 1);
  styleKpiCard(grafikSheet, 2, "TOTAL KUNJUNGAN", "=SUM(" + SHEET_NAMES.DASHBOARD + "!B2:B" + lastDashRow + ")", "#0f172a", "#,##0");
  styleKpiCard(grafikSheet, 5, "TOTAL DIPERIKSA (PCS)", "=SUM(" + SHEET_NAMES.DASHBOARD + "!C2:C" + lastDashRow + ")", "#0284c7", "#,##0");
  styleKpiCard(grafikSheet, 8, "TOTAL RUSAK (PCS)", "=SUM(" + SHEET_NAMES.DASHBOARD + "!D2:D" + lastDashRow + ")", "#e11d48", "#,##0");
  styleKpiCard(
    grafikSheet,
    11,
    "PASS RATE RATA-RATA",
    "=IF(SUM(" + SHEET_NAMES.DASHBOARD + "!C2:C" + lastDashRow + ")>0, SUM(" + SHEET_NAMES.DASHBOARD + "!E2:E" + lastDashRow + ")/SUM(" + SHEET_NAMES.DASHBOARD + "!C2:C" + lastDashRow + "), 0)",
    "#059669",
    "0.0%"
  );

  // Tabel ringkas jenis kerusakan di bawah area grafik (B48:C64) untuk sumber Grafik Pareto Kerusakan
  var defectHeader = grafikSheet.getRange(48, 2, 1, 2);
  defectHeader.setValues([["Jenis Kerusakan", "Total Rusak (pcs)"]]);
  defectHeader.setFontWeight("bold");
  defectHeader.setBackground("#f1f5f9");
  for (var i = 0; i < DEFECT_REKAP_COLUMNS.length; i++) {
    var r = 49 + i;
    var dashCol = colIndexToLetter(7 + i);
    grafikSheet.getRange(r, 2).setValue(DEFECT_REKAP_COLUMNS[i].label);
    var cell = grafikSheet.getRange(r, 3);
    var formula = "=SUM(" + SHEET_NAMES.DASHBOARD + "!" + dashCol + "2:" + dashCol + lastDashRow + ")";
    if (typeof cell.setFormula === "function") cell.setFormula(formula);
    else cell.setValue(formula);
  }
}

function clearSheetCharts(sheet) {
  if (!sheet) return;
  if (typeof sheet.getCharts === "function" && typeof sheet.removeChart === "function") {
    var existing = sheet.getCharts() || [];
    for (var i = 0; i < existing.length; i++) {
      sheet.removeChart(existing[i]);
    }
  }
}

function syncDashboardCharts(rekapSs, dashSheet, vendorCount) {
  clearSheetCharts(dashSheet);
  if (!rekapSs) return;

  var grafikSheet = rekapSs.getSheetByName(SHEET_NAMES.GRAFIK);
  if (!grafikSheet) {
    grafikSheet = rekapSs.insertSheet(SHEET_NAMES.GRAFIK);
  }
  clearSheetCharts(grafikSheet);
  buildGrafikSheetLayout(grafikSheet, vendorCount);

  if (vendorCount <= 0) return;
  if (typeof grafikSheet.newChart !== "function" || typeof grafikSheet.insertChart !== "function") return;
  if (typeof Charts === "undefined" || !Charts.ChartType) return;

  var lastRow = vendorCount + 1;

  var volumeBuilder = grafikSheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dashSheet.getRange(1, 1, lastRow, 1))
    .addRange(dashSheet.getRange(1, 4, lastRow, 2))
    .setOption("title", "Performa QC per Vendor (Rusak vs Lolos)")
    .setOption("isStacked", true)
    .setOption("colors", ["#e11d48", "#059669"])
    .setOption("legend", { position: "top" })
    .setOption("hAxis", { slantedText: true, slantedTextAngle: 35 })
    .setOption("vAxis", { minValue: 0, title: "Jumlah (pcs)" })
    .setOption("backgroundColor", "#ffffff")
    .setOption("width", 610)
    .setOption("height", 370)
    .setPosition(7, 2, 0, 0);
  if (typeof volumeBuilder.setNumHeaders === "function") volumeBuilder.setNumHeaders(1);
  grafikSheet.insertChart(volumeBuilder.build());

  var passRateBuilder = grafikSheet.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(dashSheet.getRange(1, 1, lastRow, 1))
    .addRange(dashSheet.getRange(1, 6, lastRow, 1))
    .setOption("title", "Pass Rate (%) per Vendor")
    .setOption("colors", ["#0284c7"])
    .setOption("legend", { position: "none" })
    .setOption("hAxis", { minValue: 0, maxValue: 100, title: "Pass Rate (%)" })
    .setOption("backgroundColor", "#ffffff")
    .setOption("width", 610)
    .setOption("height", 370)
    .setPosition(7, 9, 0, 0);
  if (typeof passRateBuilder.setNumHeaders === "function") passRateBuilder.setNumHeaders(1);
  grafikSheet.insertChart(passRateBuilder.build());

  var defectBuilder = grafikSheet.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(grafikSheet.getRange(48, 2, 1 + DEFECT_REKAP_COLUMNS.length, 2))
    .setOption("title", "Distribusi Jenis Kerusakan (Total pcs)")
    .setOption("colors", ["#d97706"])
    .setOption("legend", { position: "none" })
    .setOption("hAxis", { minValue: 0, title: "Total Kerusakan (pcs)" })
    .setOption("backgroundColor", "#ffffff")
    .setOption("width", 1240)
    .setOption("height", 360)
    .setPosition(27, 2, 0, 0);
  if (typeof defectBuilder.setNumHeaders === "function") defectBuilder.setNumHeaders(1);
  grafikSheet.insertChart(defectBuilder.build());
}

function refreshDashboardSheet(rekapSs) {
  var dashSheet = rekapSs.getSheetByName(SHEET_NAMES.DASHBOARD);
  var kSheet = rekapSs.getSheetByName(SHEET_NAMES.KUNJUNGAN);
  var mSheet = rekapSs.getSheetByName(SHEET_NAMES.META);
  if (!dashSheet || !kSheet) return;

  ensureMasterSheets(rekapSs);

  var voidSet = {};
  if (mSheet && mSheet.getLastRow() >= 2) {
    var mRows = mSheet.getRange(2, 1, mSheet.getLastRow() - 1, 3).getValues();
    for (var m = 0; m < mRows.length; m++) {
      var mNo = String(mRows[m][0] || "").trim();
      var mStatus = String(mRows[m][2] || "ACTIVE").toUpperCase();
      if (mNo && mStatus === "VOID") {
        voidSet[mNo] = true;
      }
    }
  }

  var vendorMap = {};
  var vendorOrder = [];

  function ensureVendorEntry(vendorName) {
    var cleanName = String(vendorName || "").trim();
    if (!cleanName || cleanName === "-") return null;
    var key = cleanName.toLowerCase();
    if (!vendorMap[key]) {
      var emptyDefects = [];
      for (var c = 0; c < DEFECT_REKAP_COLUMNS.length; c++) emptyDefects.push(0);
      vendorMap[key] = {
        vendor: cleanName,
        kunjungan: 0,
        diperiksa: 0,
        rusak: 0,
        lolos: 0,
        defects: emptyDefects
      };
      vendorOrder.push(key);
    }
    return vendorMap[key];
  }

  var vSheet = rekapSs.getSheetByName("VENDOR_MASTER");
  if (vSheet && vSheet.getLastRow() >= 2) {
    var vRows = vSheet.getDataRange().getValues();
    for (var vi = 1; vi < vRows.length; vi++) {
      ensureVendorEntry(vRows[vi][1]);
    }
  }

  var totalKCols = 11 + DEFECT_REKAP_COLUMNS.length;
  if (kSheet.getLastRow() >= 2) {
    var kRows = kSheet.getRange(2, 1, kSheet.getLastRow() - 1, totalKCols).getValues();
    for (var i = 0; i < kRows.length; i++) {
      var kr = kRows[i];
      var noLap = String(kr[1] || "").trim();
      if (!noLap || voidSet[noLap]) continue;

      var agg = ensureVendorEntry(String(kr[3] || "").trim() || "-");
      if (!agg) continue;
      agg.kunjungan += 1;
      agg.diperiksa += Number(kr[6]) || 0;
      agg.rusak += Number(kr[7]) || 0;
      agg.lolos += Number(kr[8]) || 0;
      for (var d = 0; d < DEFECT_REKAP_COLUMNS.length; d++) {
        agg.defects[d] += Number(kr[11 + d]) || 0;
      }
    }
  }

  var totalDashCols = 6 + DEFECT_REKAP_COLUMNS.length;
  var existingLastRow = dashSheet.getLastRow();
  if (existingLastRow >= 2) {
    dashSheet.getRange(2, 1, existingLastRow - 1, totalDashCols).clearContent();
  }

  if (vendorOrder.length === 0) {
    syncDashboardCharts(rekapSs, dashSheet, 0);
    return;
  }

  vendorOrder.sort(function (a, b) {
    var diffRusak = vendorMap[b].rusak - vendorMap[a].rusak;
    if (diffRusak !== 0) return diffRusak;
    var diffDiperiksa = vendorMap[b].diperiksa - vendorMap[a].diperiksa;
    if (diffDiperiksa !== 0) return diffDiperiksa;
    return vendorMap[a].vendor.localeCompare(vendorMap[b].vendor);
  });

  var outRows = [];
  for (var v = 0; v < vendorOrder.length; v++) {
    var entry = vendorMap[vendorOrder[v]];
    var passRate = entry.diperiksa > 0
      ? Math.round((entry.lolos / entry.diperiksa) * 1000) / 10
      : 0;
    var row = [
      entry.vendor,
      entry.kunjungan,
      entry.diperiksa,
      entry.rusak,
      entry.lolos,
      passRate
    ];
    for (var dc = 0; dc < DEFECT_REKAP_COLUMNS.length; dc++) {
      row.push(entry.defects[dc]);
    }
    outRows.push(row);
  }

  dashSheet.getRange(2, 1, outRows.length, totalDashCols).setValues(outRows);
  syncDashboardCharts(rekapSs, dashSheet, outRows.length);
}

function resolveFormLayout(sheet) {
  var colA = sheet.getRange(14, 1, 27, 1).getValues();
  var criteriaRows = {};
  var hasCrack = false;
  var decisionRow = null;
  var noteRow = null;
  var passedRow = null;
  var generalNoteRow = null;
  var signRow = null;

  for (var i = 0; i < colA.length; i++) {
    var rNum = 14 + i;
    var text = String(colA[i][0] || "").trim().toLowerCase();
    if (!text) continue;
    if (text.indexOf("crack") !== -1) {
      hasCrack = true;
      criteriaRows.CRACK = rNum;
    } else if (text.indexOf("bebas ati") !== -1) criteriaRows.ATI = rNum;
    else if (text.indexOf("bebas pulur") !== -1) criteriaRows.PULUR = rNum;
    else if (text.indexOf("bebas teter") !== -1) criteriaRows.TETER = rNum;
    else if (text.indexOf("mata mati") !== -1) criteriaRows.MATA_MATI = rNum;
    else if (text.indexOf("bluestain") !== -1) criteriaRows.BLUESTAIN = rNum;
    else if (text.indexOf("cutter mark") !== -1) criteriaRows.CUTTER_MARK = rNum;
    else if (text.indexOf("gerinda") !== -1) criteriaRows.BEKAS_GERINDA = rNum;
    else if (text.indexOf("serat balik") !== -1) criteriaRows.SERAT_BALIK = rNum;
    else if (text.indexOf("toleransi ukuran") !== -1) criteriaRows.TOLERANSI_UKURAN = rNum;
    else if (text.indexOf("kesikuan") !== -1) criteriaRows.KESIKUAN = rNum;
    else if (text.indexOf("doreng") !== -1) criteriaRows.DORENG = rNum;
    else if (text.indexOf("warna") !== -1) criteriaRows.WARNA = rNum;
    else if (text.indexOf("kehalusan") !== -1) criteriaRows.KEHALUSAN = rNum;
    else if (text.indexOf("bebas lubang") !== -1) criteriaRows.BEBAS_LUBANG = rNum;
    else if (text === "keputusan") decisionRow = rNum + 1;
    else if (text.indexOf("catatan singkat") !== -1) noteRow = rNum;
    else if (text.indexOf("jumlah barang diterima") !== -1) passedRow = rNum;
    else if (text.indexOf("catatan umum") !== -1) generalNoteRow = rNum;
    else if (text.indexOf("diperiksa oleh") !== -1) signRow = rNum + 1;
  }

  for (var j = 0; j < CRITERIA_ROW_MAP.length; j++) {
    var crit = CRITERIA_ROW_MAP[j];
    if (!criteriaRows[crit.id]) {
      if (!hasCrack && (crit.id === "WARNA" || crit.id === "KEHALUSAN" || crit.id === "BEBAS_LUBANG")) {
        criteriaRows[crit.id] = crit.row - 1;
      } else {
        criteriaRows[crit.id] = crit.row;
      }
    }
  }

  var shift = hasCrack ? 1 : 0;
  return {
    hasCrack: hasCrack,
    criteriaRows: criteriaRows,
    decisionRow: decisionRow || (32 + shift),
    noteRow: noteRow || (33 + shift),
    passedRow: passedRow || (34 + shift),
    generalNoteRow: generalNoteRow || (35 + shift),
    signRow: signRow || (37 + shift)
  };
}

function normalizeTemplateCheckboxes(templateSheet) {
  templateSheet.getRange("A22").setValue("TOLERANSI & PRESISI KONSTRUKSI");

  var layout = resolveFormLayout(templateSheet);
  var d25 = String(templateSheet.getRange("A25").getValue() || "").toLowerCase();
  if (!layout.hasCrack && d25.indexOf("doreng") !== -1 && typeof templateSheet.insertRowAfter === "function") {
    templateSheet.insertRowAfter(25);
    templateSheet.getRange("A26").setValue("Crack");
    layout = resolveFormLayout(templateSheet);
  }

  var chkCols = ["C", "F", "I", "L"];
  for (var c = 0; c < chkCols.length; c++) {
    var col = chkCols[c];
    for (var k = 0; k < CRITERIA_ROW_MAP.length; k++) {
      var crit = CRITERIA_ROW_MAP[k];
      if (crit.id === "CRACK" && !layout.hasCrack) continue;
      var r = layout.criteriaRows[crit.id];
      templateSheet.getRange(col + r).clearDataValidations().setValue("").setHorizontalAlignment("center");
    }
  }
  templateSheet.getRange("B" + layout.decisionRow + ":M" + layout.decisionRow).insertCheckboxes().setValue(false);
  templateSheet.getRange("B" + layout.noteRow + ":M" + layout.noteRow).setWrap(true).setVerticalAlignment("top");
  templateSheet.getRange("A" + layout.generalNoteRow + ":M" + layout.generalNoteRow).setWrap(true).setVerticalAlignment("top");
}

var GOOGLE_SHEETS_MIME = "application/vnd.google-apps.spreadsheet";

function assertNativeGoogleSheetTemplate(templateFileId) {
  var tplFile = DriveApp.getFileById(templateFileId);
  if (typeof tplFile.getMimeType === "function") {
    var mime = String(tplFile.getMimeType() || "");
    if (mime && mime !== GOOGLE_SHEETS_MIME) {
      throw new Error(
        "File TEMPLATE_FILE_ID masih berformat non-Google Sheets (" + mime + "). " +
        "Buka file di Google Sheets -> File -> Simpan sebagai Google Sheets, lalu pakai ID file baru tersebut."
      );
    }
  }
  return tplFile;
}

/**
 * Jalankan fungsi ini 1 kali di editor Apps Script setelah mengonversi template Excel ke Google Sheets.
 */
function setupQcTemplate() {
  var cfg = getProps();
  var rekapSs = getRekapSpreadsheet(cfg);
  if (!rekapSs) {
    throw new Error("Rekap Spreadsheet tidak ditemukan.");
  }
  ensureRekapSheets(rekapSs);
  ensureMasterSheets(rekapSs);
  refreshDashboardSheet(rekapSs);

  var templateNormalized = false;
  if (cfg.templateFileId) {
    assertNativeGoogleSheetTemplate(cfg.templateFileId);
    var tplSs = SpreadsheetApp.openById(cfg.templateFileId);
    var tplSheet = tplSs.getSheetByName(TEMPLATE_SHEET_NAME) || tplSs.getSheets()[0];
    if (!tplSheet) {
      throw new Error("Sheet '" + TEMPLATE_SHEET_NAME + "' tidak ditemukan pada TEMPLATE_FILE_ID.");
    }
    normalizeTemplateCheckboxes(tplSheet);
    templateNormalized = true;
  }

  return {
    status: "success",
    message: "Rekap sheets siap & checkbox template dinormalisasi.",
    templateNormalized: templateNormalized
  };
}

function findExistingReport(kunjunganSheet, metaSheet, noLaporan, idempotencyKey) {
  var sheetUrlByNo = {};
  var kLastRow = kunjunganSheet.getLastRow();
  if (kLastRow >= 2) {
    var kRows = kunjunganSheet.getRange(2, 1, kLastRow - 1, 11).getValues();
    for (var k = 0; k < kRows.length; k++) {
      var kNo = String(kRows[k][1] || "").trim();
      if (kNo) sheetUrlByNo[kNo] = String(kRows[k][10] || "");
    }
  }

  var mLastRow = metaSheet ? metaSheet.getLastRow() : 0;
  if (mLastRow >= 2) {
    var mRows = metaSheet.getRange(2, 1, mLastRow - 1, 8).getValues();
    for (var i = 0; i < mRows.length; i++) {
      var rowNo = String(mRows[i][0] || "").trim();
      var rowKey = String(mRows[i][1] || "").trim();
      if ((noLaporan && rowNo === noLaporan) || (idempotencyKey && rowKey === idempotencyKey)) {
        return {
          rowIndex: i + 2,
          noLaporan: rowNo,
          sheetUrl: sheetUrlByNo[rowNo] || "",
          pdfUrl: String(mRows[i][3] || ""),
          fileId: String(mRows[i][4] || "")
        };
      }
    }
  }
  return null;
}

function sanitizeFilePart(str) {
  return String(str || "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "QC";
}

function fillItemSlot(sheet, layout, slot, item) {
  var itemLabel = item.kodeRawBody
    ? (item.kodeRawBody + " - " + (item.namaItem || ""))
    : (item.namaItem || "");

  sheet.getRange(slot.valCol + "8").setValue(itemLabel);
  sheet.getRange(slot.valCol + "9").setValue(Number(item.qtyDiperiksa) || 0);
  sheet.getRange(slot.valCol + "11").setValue(item.mcMentah !== null && item.mcMentah !== undefined && item.mcMentah !== "" ? Number(item.mcMentah) : "");
  sheet.getRange(slot.valCol + "12").setValue(item.mcJadi !== null && item.mcJadi !== undefined && item.mcJadi !== "" ? Number(item.mcJadi) : "");

  var kStatus = item.kriteriaStatus || {};
  var defectQtyByCrit = {};
  var itemDefects = Array.isArray(item.rusak) ? item.rusak : [];
  for (var dIdx = 0; dIdx < itemDefects.length; dIdx++) {
    var dItem = itemDefects[dIdx];
    var dCritId = String(dItem && dItem.kriteriaId || "").toUpperCase();
    var dQty = Number(dItem && dItem.qty) || 0;
    if (dCritId && dQty > 0) {
      defectQtyByCrit[dCritId] = (defectQtyByCrit[dCritId] || 0) + dQty;
    }
  }

  for (var cIdx = 0; cIdx < CRITERIA_ROW_MAP.length; cIdx++) {
    var crit = CRITERIA_ROW_MAP[cIdx];
    if (crit.id === "CRACK" && !layout.hasCrack) continue;
    var critRow = layout.criteriaRows[crit.id];
    var status = String(kStatus[crit.id] || "OK").toUpperCase();
    var cellRange = sheet.getRange(slot.chkCol + critRow);
    cellRange.clearDataValidations().setHorizontalAlignment("center");

    if (status === "NA") {
      cellRange.setValue("–");
    } else if (defectQtyByCrit[crit.id] > 0) {
      cellRange.setValue(defectQtyByCrit[crit.id]);
    } else if (status === "NOK") {
      cellRange.setValue("NOK");
    } else {
      cellRange.setValue(0);
    }
  }

  var decision = String(item.keputusan || "Lolos");
  sheet.getRange(slot.decCols[0] + layout.decisionRow).insertCheckboxes().setValue(decision === "Lolos");
  sheet.getRange(slot.decCols[1] + layout.decisionRow).insertCheckboxes().setValue(decision === "Bersyarat");
  sheet.getRange(slot.decCols[2] + layout.decisionRow).insertCheckboxes().setValue(decision === "Tolak");

  sheet.getRange(slot.valCol + layout.noteRow).setValue(item.catatanSingkat || "");
  sheet.getRange(slot.valCol + layout.passedRow).setValue(Number(item.qtyLolos) || 0);
}

function fillFormTab(sheet, data, itemsChunk) {
  var layout = resolveFormLayout(sheet);

  // Header Kunjungan
  sheet.getRange("B4").setValue(data.vendor || "-");
  sheet.getRange("J4").setValue(data.noDokumenPo || "-");
  sheet.getRange("B5").setValue(data.tanggalPemeriksaan || "");
  sheet.getRange("J5").setValue(data.petugasQc || "-");

  // Catatan Umum & Tanda Tangan Footer
  var catatanUmum = String(data.catatanUmum || "").trim();
  sheet.getRange("A" + layout.generalNoteRow).setValue("CATATAN UMUM KUNJUNGAN\n" + (catatanUmum || "-"));
  sheet.getRange("A" + layout.signRow).setValue(data.petugasQc || "-");
  sheet.getRange("E" + layout.signRow).setValue(data.tanggalPemeriksaan || "");
  sheet.getRange("G" + layout.signRow).setValue(data.diketahuiVendor || "-");
  sheet.getRange("M" + layout.signRow).setValue(data.diketahuiVendor ? (data.tanggalPemeriksaan || "") : "");

  for (var slotIdx = 0; slotIdx < ITEM_SLOTS.length; slotIdx++) {
    var item = itemsChunk[slotIdx];
    if (!item) continue;
    fillItemSlot(sheet, layout, ITEM_SLOTS[slotIdx], item);
  }
}

function exportSpreadsheetToPdf(ssId, fileName, outputFolder) {
  var url = "https://docs.google.com/spreadsheets/d/" + ssId +
    "/export?format=pdf&size=A4&portrait=true&scale=4&gridlines=false&printtitle=false&sheetnames=false&fzr=false&top_margin=0.25&bottom_margin=0.25&left_margin=0.25&right_margin=0.25";
  var resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    return null;
  }
  var blob = resp.getBlob().setName(fileName + ".pdf");
  return outputFolder.createFile(blob);
}

function handleLogQcReport(data, cfg) {
  if (!cfg.templateFileId || !cfg.outputFolderId) {
    return jsonResponse({
      status: "error",
      code: "CONFIG_MISSING",
      message: "Script Properties TEMPLATE_FILE_ID dan OUTPUT_FOLDER_ID wajib diisi."
    });
  }

  var items = Array.isArray(data.items) ? data.items : [];
  if (!data.noLaporan || !data.vendor || items.length === 0) {
    return jsonResponse({
      status: "error",
      code: "VALIDATION_ERROR",
      message: "noLaporan, vendor, dan items[] wajib diisi."
    });
  }

  var rekapSs = getRekapSpreadsheet(cfg);
  ensureRekapSheets(rekapSs);

  var kunjunganSheet = rekapSs.getSheetByName(SHEET_NAMES.KUNJUNGAN);
  var metaSheet = rekapSs.getSheetByName(SHEET_NAMES.META);
  var existing = findExistingReport(kunjunganSheet, metaSheet, data.noLaporan, data.idempotencyKey);
  if (existing) {
    return jsonResponse({
      status: "success",
      duplicate: true,
      noLaporan: existing.noLaporan,
      fileId: existing.fileId,
      sheetUrl: existing.sheetUrl,
      pdfUrl: existing.pdfUrl
    });
  }

  var outputFolder = getReportOutputFolder(cfg);
  var templateFile = assertNativeGoogleSheetTemplate(cfg.templateFileId);
  var baseName = "QC_" + sanitizeFilePart(data.vendor) + "_" + sanitizeFilePart(data.noDokumenPo) + "_" + sanitizeFilePart(data.noLaporan);
  var copiedFile = templateFile.makeCopy(baseName, outputFolder);
  var copiedId = copiedFile.getId();
  var targetSs = SpreadsheetApp.openById(copiedId);

  var baseTab = targetSs.getSheetByName(TEMPLATE_SHEET_NAME) || targetSs.getSheets()[0];
  var totalTabs = Math.ceil(items.length / 4);
  var tabs = [baseTab];

  // Duplikasi tab sebelum pengisian item tab pertama agar tab tambahan bersih
  for (var t = 1; t < totalTabs; t++) {
    var extraTab = baseTab.copyTo(targetSs);
    extraTab.setName(TEMPLATE_SHEET_NAME + " (" + (t + 1) + ")");
    tabs.push(extraTab);
  }

  for (var tabIdx = 0; tabIdx < totalTabs; tabIdx++) {
    var chunk = items.slice(tabIdx * 4, (tabIdx + 1) * 4);
    fillFormTab(tabs[tabIdx], data, chunk);
  }

  SpreadsheetApp.flush();

  var sheetUrl = copiedFile.getUrl() || targetSs.getUrl();
  var pdfUrl = "";
  var pdfFileId = "";

  if (cfg.generatePdf) {
    try {
      var pdfFile = exportSpreadsheetToPdf(copiedId, baseName, outputFolder);
      if (pdfFile) {
        pdfUrl = pdfFile.getUrl();
        pdfFileId = pdfFile.getId();
      }
    } catch (pdfErr) {
      Logger.log("PDF export skipped: " + pdfErr.toString());
    }
  }

  var totalDiperiksa = 0;
  var totalRusak = 0;
  var totalLolos = 0;
  var visitDefects = {};
  var detailSheet = rekapSs.getSheetByName(SHEET_NAMES.DETAIL);
  var rusakSheet = rekapSs.getSheetByName(SHEET_NAMES.KERUSAKAN);

  for (var idx = 0; idx < items.length; idx++) {
    var it = items[idx];
    var qtyPeriksa = Number(it.qtyDiperiksa) || 0;
    var qtyRusakItem = Number(it.totalRusak) || 0;
    var qtyLolosItem = Number(it.qtyLolos) || 0;
    totalDiperiksa += qtyPeriksa;
    totalRusak += qtyRusakItem;
    totalLolos += qtyLolosItem;

    var defectList = Array.isArray(it.rusak) ? it.rusak : [];
    var defectText = defectList.map(function (d) {
      return (d.label || d.kriteriaId) + ": " + d.qty;
    }).join("; ") || "-";

    detailSheet.appendRow([
      data.tanggalPemeriksaan || "",
      data.noLaporan,
      data.vendor,
      data.noDokumenPo || "-",
      it.kodeRawBody || "",
      it.namaItem || "",
      it.tahapBarang || "Unfinish",
      qtyPeriksa,
      it.mcMentah !== null && it.mcMentah !== undefined ? it.mcMentah : "",
      it.mcJadi !== null && it.mcJadi !== undefined ? it.mcJadi : "",
      qtyRusakItem,
      defectText,
      qtyLolosItem,
      it.keputusan || "Lolos",
      it.catatanSingkat || ""
    ]);
    appendStageLogs(rekapSs, data, it, data.noLaporan);

    for (var dIdx = 0; dIdx < defectList.length; dIdx++) {
      var defect = defectList[dIdx];
      var dQty = Number(defect.qty) || 0;
      if (dQty > 0) {
        var kId = String(defect.kriteriaId || "LAINNYA").toUpperCase();
        visitDefects[kId] = (visitDefects[kId] || 0) + dQty;
        rusakSheet.appendRow([
          data.tanggalPemeriksaan || "",
          data.noLaporan,
          data.vendor,
          it.kodeRawBody || "",
          it.namaItem || "",
          kId,
          defect.label || defect.kriteriaId || "Lainnya",
          dQty,
          data.petugasQc || "-"
        ]);
      }
    }
  }

  var kunjunganRow = [
    data.tanggalPemeriksaan || "",
    data.noLaporan,
    data.noDokumenPo || "-",
    data.vendor,
    data.petugasQc || "-",
    items.length,
    totalDiperiksa,
    totalRusak,
    totalLolos,
    data.keputusanUmum || "Lolos",
    sheetUrl
  ];
  for (var colIdx = 0; colIdx < DEFECT_REKAP_COLUMNS.length; colIdx++) {
    kunjunganRow.push(visitDefects[DEFECT_REKAP_COLUMNS[colIdx].id] || 0);
  }
  kunjunganSheet.appendRow(kunjunganRow);

  if (metaSheet) {
    metaSheet.appendRow([
      data.noLaporan,
      data.idempotencyKey || "",
      "ACTIVE",
      pdfUrl,
      copiedId,
      pdfFileId,
      data.catatanUmum || "",
      ""
    ]);
  }

  refreshDashboardSheet(rekapSs);

  return jsonResponse({
    status: "success",
    duplicate: false,
    noLaporan: data.noLaporan,
    fileId: copiedId,
    sheetUrl: sheetUrl,
    pdfUrl: pdfUrl
  });
}

function handleAppendQcItem(data, cfg) {
  var noLaporan = String(data.noLaporan || "").trim();
  var item = data.item;
  if (!noLaporan || !item) {
    return jsonResponse({ status: "error", code: "VALIDATION_ERROR", message: "noLaporan dan item wajib diisi." });
  }

  var rekapSs = getRekapSpreadsheet(cfg);
  ensureRekapSheets(rekapSs);
  var kSheet = rekapSs.getSheetByName(SHEET_NAMES.KUNJUNGAN);
  var dSheet = rekapSs.getSheetByName(SHEET_NAMES.DETAIL);
  var rSheet = rekapSs.getSheetByName(SHEET_NAMES.KERUSAKAN);
  var mSheet = rekapSs.getSheetByName(SHEET_NAMES.META);

  // Cari fileId & baris meta berdasarkan noLaporan
  var metaRowIdx = -1;
  var fileId = String(data.fileId || "").trim();
  var oldPdfId = "";
  var pdfUrl = "";
  if (mSheet && mSheet.getLastRow() >= 2) {
    var mRows = mSheet.getRange(2, 1, mSheet.getLastRow() - 1, 8).getValues();
    for (var m = 0; m < mRows.length; m++) {
      if (String(mRows[m][0] || "").trim() === noLaporan) {
        metaRowIdx = m + 2;
        if (!fileId) fileId = String(mRows[m][4] || "").trim();
        oldPdfId = String(mRows[m][5] || "").trim();
        pdfUrl = String(mRows[m][3] || "").trim();
        break;
      }
    }
  }
  if (!fileId) {
    return jsonResponse({ status: "error", code: "NOT_FOUND", message: "File laporan " + noLaporan + " tidak ditemukan." });
  }

  // Cari baris kunjungan di REKAP_QC_KUNJUNGAN
  var kRowIdx = -1;
  var existingItemCount = 1;
  var existingDiperiksa = 0;
  var existingRusak = 0;
  var existingLolos = 0;
  var existingDecision = "Lolos";
  var sheetUrl = "";
  var existingDefectCounts = [];
  var totalKCols = 11 + DEFECT_REKAP_COLUMNS.length;

  if (kSheet.getLastRow() >= 2) {
    var kRows = kSheet.getRange(2, 1, kSheet.getLastRow() - 1, totalKCols).getValues();
    for (var k = 0; k < kRows.length; k++) {
      if (String(kRows[k][1] || "").trim() === noLaporan) {
        kRowIdx = k + 2;
        existingItemCount = Number(kRows[k][5]) || 0;
        existingDiperiksa = Number(kRows[k][6]) || 0;
        existingRusak = Number(kRows[k][7]) || 0;
        existingLolos = Number(kRows[k][8]) || 0;
        existingDecision = String(kRows[k][9] || "Lolos");
        sheetUrl = String(kRows[k][10] || "");
        for (var c = 0; c < DEFECT_REKAP_COLUMNS.length; c++) {
          existingDefectCounts.push(Number(kRows[k][11 + c]) || 0);
        }
        break;
      }
    }
  }

  var targetSs = SpreadsheetApp.openById(fileId);
  var tabs = targetSs.getSheets();
  var tabIdx = Math.floor(existingItemCount / 4);
  var slotIdx = existingItemCount % 4;
  var targetTab = tabs[tabIdx];

  if (!targetTab) {
    var tplSs = cfg.templateFileId ? SpreadsheetApp.openById(cfg.templateFileId) : null;
    var cleanSource = tplSs ? (tplSs.getSheetByName(TEMPLATE_SHEET_NAME) || tplSs.getSheets()[0]) : tabs[0];
    targetTab = cleanSource.copyTo(targetSs);
    targetTab.setName(TEMPLATE_SHEET_NAME + " (" + (tabIdx + 1) + ")");
    fillFormTab(targetTab, data, []);
  }

  var layout = resolveFormLayout(targetTab);
  fillItemSlot(targetTab, layout, ITEM_SLOTS[slotIdx], item);
  SpreadsheetApp.flush();

  if (cfg.generatePdf && cfg.outputFolderId) {
    try {
      var outputFolder = getReportOutputFolder(cfg);
      var baseName = "QC_" + sanitizeFilePart(data.vendor) + "_" + sanitizeFilePart(data.noDokumenPo) + "_" + sanitizeFilePart(noLaporan);
      var pdfFile = exportSpreadsheetToPdf(fileId, baseName, outputFolder);
      if (pdfFile) {
        pdfUrl = pdfFile.getUrl();
        var newPdfId = pdfFile.getId();
        if (metaRowIdx > 0 && mSheet) {
          mSheet.getRange(metaRowIdx, 4).setValue(pdfUrl);
          mSheet.getRange(metaRowIdx, 6).setValue(newPdfId);
        }
        if (oldPdfId && oldPdfId !== newPdfId) {
          try {
            var oldF = DriveApp.getFileById(oldPdfId);
            if (typeof oldF.setTrashed === "function") oldF.setTrashed(true);
          } catch (_) {}
        }
      }
    } catch (pdfErr) {
      Logger.log("PDF re-export skipped: " + pdfErr.toString());
    }
  }

  var qtyPeriksa = Number(item.qtyDiperiksa) || 0;
  var qtyRusakItem = Number(item.totalRusak) || 0;
  var qtyLolosItem = Number(item.qtyLolos) || 0;
  var defectList = Array.isArray(item.rusak) ? item.rusak : [];
  var defectText = defectList.map(function (d) {
    return (d.label || d.kriteriaId) + ": " + d.qty;
  }).join("; ") || "-";

  dSheet.appendRow([
    data.tanggalPemeriksaan || "",
    noLaporan,
    data.vendor || "",
    data.noDokumenPo || "-",
    item.kodeRawBody || "",
    item.namaItem || "",
    item.tahapBarang || "Unfinish",
    qtyPeriksa,
    item.mcMentah !== null && item.mcMentah !== undefined ? item.mcMentah : "",
    item.mcJadi !== null && item.mcJadi !== undefined ? item.mcJadi : "",
    qtyRusakItem,
    defectText,
    qtyLolosItem,
    item.keputusan || "Lolos",
    item.catatanSingkat || ""
  ]);

  var addDefects = {};
  for (var dIdx = 0; dIdx < defectList.length; dIdx++) {
    var defect = defectList[dIdx];
    var dQty = Number(defect.qty) || 0;
    if (dQty > 0) {
      var kId = String(defect.kriteriaId || "LAINNYA").toUpperCase();
      addDefects[kId] = (addDefects[kId] || 0) + dQty;
      rSheet.appendRow([
        data.tanggalPemeriksaan || "",
        noLaporan,
        data.vendor || "",
        item.kodeRawBody || "",
        item.namaItem || "",
        kId,
        defect.label || defect.kriteriaId || "Lainnya",
        dQty,
        data.petugasQc || "-"
      ]);
    }
  }

  var nextItemCount = existingItemCount + 1;
  var itemDecision = String(item.keputusan || "Lolos");
  var nextDecision = existingDecision;
  if (itemDecision !== existingDecision) {
    if (existingDecision === "Lolos" || itemDecision === "Bersyarat" || existingDecision === "Tolak") {
      nextDecision = "Bersyarat";
    }
  }

  if (kRowIdx > 0) {
    kSheet.getRange(kRowIdx, 6).setValue(nextItemCount);
    kSheet.getRange(kRowIdx, 7).setValue(existingDiperiksa + qtyPeriksa);
    kSheet.getRange(kRowIdx, 8).setValue(existingRusak + qtyRusakItem);
    kSheet.getRange(kRowIdx, 9).setValue(existingLolos + qtyLolosItem);
    kSheet.getRange(kRowIdx, 10).setValue(nextDecision);
    for (var colIdx = 0; colIdx < DEFECT_REKAP_COLUMNS.length; colIdx++) {
      var nextVal = (existingDefectCounts[colIdx] || 0) + (addDefects[DEFECT_REKAP_COLUMNS[colIdx].id] || 0);
      kSheet.getRange(kRowIdx, 12 + colIdx).setValue(nextVal);
    }
  }

  appendStageLogs(rekapSs, data, item, noLaporan);
  refreshDashboardSheet(rekapSs);

  return jsonResponse({
    status: "success",
    noLaporan: noLaporan,
    fileId: fileId,
    sheetUrl: sheetUrl || targetSs.getUrl(),
    pdfUrl: pdfUrl,
    totalItem: nextItemCount
  });
}

function formatCellDate(val) {
  if (!val) return "";
  if (val instanceof Date || (typeof val === "object" && typeof val.getFullYear === "function")) {
    if (typeof Utilities !== "undefined" && Utilities.formatDate) {
      var tz = (typeof Session !== "undefined" && Session.getScriptTimeZone) ? Session.getScriptTimeZone() : "Asia/Jakarta";
      return Utilities.formatDate(val, tz || "Asia/Jakarta", "dd/MM/yyyy");
    }
    var dd = ("0" + val.getDate()).slice(-2);
    var mm = ("0" + (val.getMonth() + 1)).slice(-2);
    return dd + "/" + mm + "/" + val.getFullYear();
  }
  return String(val);
}

function handleGetQcDashboard(data, cfg) {
  var rekapSs = getRekapSpreadsheet(cfg);
  ensureRekapSheets(rekapSs);

  var kSheet = rekapSs.getSheetByName(SHEET_NAMES.KUNJUNGAN);
  var dSheet = rekapSs.getSheetByName(SHEET_NAMES.DETAIL);
  var rSheet = rekapSs.getSheetByName(SHEET_NAMES.KERUSAKAN);
  var mSheet = rekapSs.getSheetByName(SHEET_NAMES.META);

  var kValues = kSheet.getDataRange().getValues();
  var dValues = dSheet.getDataRange().getValues();
  var rValues = rSheet.getDataRange().getValues();
  var mValues = mSheet ? mSheet.getDataRange().getValues() : [];

  var metaByNo = {};
  for (var m = 1; m < mValues.length; m++) {
    var mRow = mValues[m];
    var mNo = String(mRow[0] || "").trim();
    if (!mNo) continue;
    metaByNo[mNo] = {
      status: String(mRow[2] || "ACTIVE").toUpperCase(),
      pdfUrl: String(mRow[3] || ""),
      catatanUmum: String(mRow[6] || ""),
      alasanVoid: String(mRow[7] || "")
    };
  }

  var reports = [];
  var totalInspected = 0;
  var totalDefect = 0;
  var totalPassed = 0;
  var activeReports = 0;
  var voidReports = 0;

  for (var i = 1; i < kValues.length; i++) {
    var row = kValues[i];
    if (!row[1]) continue;
    var noLap = String(row[1] || "");
    var meta = metaByNo[noLap] || {};
    var status = meta.status || "ACTIVE";
    var item = {
      tanggal: formatCellDate(row[0]),
      noLaporan: noLap,
      noDokumenPo: String(row[2] || "-"),
      vendor: String(row[3] || ""),
      petugasQc: String(row[4] || "-"),
      totalItem: Number(row[5]) || 0,
      totalDiperiksa: Number(row[6]) || 0,
      totalRusak: Number(row[7]) || 0,
      totalLolos: Number(row[8]) || 0,
      keputusanUmum: String(row[9] || "Lolos"),
      sheetUrl: String(row[10] || ""),
      pdfUrl: meta.pdfUrl || "",
      status: status,
      catatanUmum: meta.catatanUmum || "",
      alasanVoid: meta.alasanVoid || ""
    };
    reports.push(item);

    if (status === "VOID") {
      voidReports++;
    } else {
      activeReports++;
      totalInspected += item.totalDiperiksa;
      totalDefect += item.totalRusak;
      totalPassed += item.totalLolos;
    }
  }

  reports.reverse();
  var limit = Number(data && data.limit) || 100;
  if (reports.length > limit) {
    reports = reports.slice(0, limit);
  }

  var items = [];
  for (var j = 1; j < dValues.length; j++) {
    var dr = dValues[j];
    if (!dr[1]) continue;
    items.push({
      tanggal: formatCellDate(dr[0]),
      noLaporan: String(dr[1] || ""),
      vendor: String(dr[2] || ""),
      noDokumenPo: String(dr[3] || "-"),
      kodeRawBody: String(dr[4] || ""),
      namaItem: String(dr[5] || ""),
      tahapBarang: String(dr[6] || ""),
      qtyDiperiksa: Number(dr[7]) || 0,
      mcMentah: dr[8] === "" ? null : Number(dr[8]),
      mcJadi: dr[9] === "" ? null : Number(dr[9]),
      totalRusak: Number(dr[10]) || 0,
      rincianKerusakan: String(dr[11] || ""),
      qtyLolos: Number(dr[12]) || 0,
      keputusan: String(dr[13] || ""),
      catatanSingkat: String(dr[14] || "")
    });
  }
  items.reverse();

  var defects = [];
  for (var k = 1; k < rValues.length; k++) {
    var rr = rValues[k];
    if (!rr[1]) continue;
    defects.push({
      tanggal: formatCellDate(rr[0]),
      noLaporan: String(rr[1] || ""),
      vendor: String(rr[2] || ""),
      kodeRawBody: String(rr[3] || ""),
      namaItem: String(rr[4] || ""),
      kriteriaId: String(rr[5] || ""),
      label: String(rr[6] || ""),
      qty: Number(rr[7]) || 0,
      petugasQc: String(rr[8] || "")
    });
  }
  defects.reverse();

  var passRate = totalInspected > 0
    ? Math.round((totalPassed / totalInspected) * 1000) / 10
    : 100;

  return jsonResponse({
    status: "success",
    data: {
      summary: {
        totalReports: activeReports + voidReports,
        activeReports: activeReports,
        voidReports: voidReports,
        totalInspected: totalInspected,
        totalDefect: totalDefect,
        totalPassed: totalPassed,
        passRate: passRate
      },
      reports: reports,
      items: items.slice(0, 250),
      defects: defects.slice(0, 250)
    }
  });
}

function handleVoidQcReport(data, cfg) {
  var noLaporan = String(data.noLaporan || "").trim();
  var alasanVoid = String(data.alasanVoid || "").trim() || "Dibatalkan admin";
  var oleh = String(data.oleh || "").trim() || "Admin";

  if (!noLaporan) {
    return jsonResponse({ status: "error", code: "VALIDATION_ERROR", message: "noLaporan wajib diisi." });
  }

  var rekapSs = getRekapSpreadsheet(cfg);
  ensureRekapSheets(rekapSs);
  var mSheet = rekapSs.getSheetByName(SHEET_NAMES.META);
  var lastRow = mSheet ? mSheet.getLastRow() : 0;
  if (lastRow < 2) {
    return jsonResponse({ status: "error", code: "NOT_FOUND", message: "Laporan tidak ditemukan." });
  }

  var rows = mSheet.getRange(2, 1, lastRow - 1, 8).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || "").trim() === noLaporan) {
      var currentStatus = String(rows[i][2] || "ACTIVE").toUpperCase();
      if (currentStatus === "VOID") {
        return jsonResponse({
          status: "error",
          code: "ALREADY_VOID",
          message: "Laporan " + noLaporan + " sudah berstatus VOID."
        });
      }

      var rowNum = i + 2;
      mSheet.getRange(rowNum, 3).setValue("VOID");
      mSheet.getRange(rowNum, 8).setValue(alasanVoid + " (oleh: " + oleh + ")");

      var fileId = String(rows[i][4] || "").trim();
      if (fileId) {
        try {
          var f = DriveApp.getFileById(fileId);
          var oldName = f.getName();
          if (oldName.indexOf("[VOID]") !== 0) {
            f.setName("[VOID] " + oldName);
          }
        } catch (renameErr) {
          Logger.log("Gagal rename file Sheet Drive: " + renameErr.toString());
        }
      }

      var pdfId = String(rows[i][5] || "").trim();
      if (pdfId) {
        try {
          var pf = DriveApp.getFileById(pdfId);
          var oldPdfName = pf.getName();
          if (oldPdfName.indexOf("[VOID]") !== 0) {
            pf.setName("[VOID] " + oldPdfName);
          }
        } catch (renamePdfErr) {
          Logger.log("Gagal rename file PDF Drive: " + renamePdfErr.toString());
        }
      }

      refreshDashboardSheet(rekapSs);

      return jsonResponse({
        status: "success",
        statusLaporan: "VOID",
        noLaporan: noLaporan,
        message: "Laporan " + noLaporan + " berhasil di-VOID."
      });
    }
  }

  return jsonResponse({ status: "error", code: "NOT_FOUND", message: "Laporan " + noLaporan + " tidak ditemukan." });
}

var DEFAULT_MASTER_PRODUCTS = [
  ["RB102001", "Sutil Kayu Panjang", "Sutil & Spatula"],
  ["RB102002", "Sutil kayu Lengkung", "Sutil & Spatula"],
  ["RB102003", "Sutil Besar", "Sutil & Spatula"],
  ["RB102004", "Fliper Batok", "Sutil & Spatula"],
  ["RB102005", "Spatula Batok", "Sutil & Spatula"],
  ["RB102006", "Spatula Garpu Duco", "Sutil & Spatula"],
  ["RB102007", "Spatula Oval Duco", "Sutil & Spatula"],
  ["RB102008", "Spatula Round Duco", "Sutil & Spatula"],
  ["RB102009", "Spatula Square Duco", "Sutil & Spatula"],
  ["RB102010", "Spatula Strainer Duco", "Sutil & Spatula"],
  ["RB102011", "Sutil Besar Duco", "Sutil & Spatula"],
  ["RB102012", "Sutil Lengkung Duco", "Sutil & Spatula"],
  ["RB102013", "Sutil Panjang Duco", "Sutil & Spatula"],
  ["RB102014", "Scrapper M", "Sutil & Spatula"],
  ["RB102015", "Scrapper s", "Sutil & Spatula"],
  ["RB102016", "Spatula Silikon", "Sutil & Spatula"],
  ["RB103001", "Sendok Nasi", "Sendok & Garpu"],
  ["RB103002", "Sendok Oval", "Sendok & Garpu"],
  ["RB103003", "Sendok Oval Cekung", "Sendok & Garpu"],
  ["RB103004", "Sendok Pecel", "Sendok & Garpu"],
  ["RB103005", "Sendok Peyang", "Sendok & Garpu"],
  ["RB103006", "Sendok Sup", "Sendok & Garpu"],
  ["RB103007", "Sendok Takar Beras", "Sendok & Garpu"],
  ["RB103008", "Sendok Takar Tepung", "Sendok & Garpu"],
  ["RB103009", "Sendok Tumpeng", "Sendok & Garpu"],
  ["RB103010", "Sloted", "Sendok & Garpu"],
  ["RB103011", "Strainer", "Sendok & Garpu"],
  ["RB103012", "Garpu Kayu", "Sendok & Garpu"],
  ["RB103013", "Sendok Makan", "Sendok & Garpu"],
  ["RB103014", "Sendok Bayi / Sendok Panjang", "Sendok & Garpu"],
  ["RB103015", "Sendok Madu", "Sendok & Garpu"],
  ["RB103016", "Sendok Nasi Duco", "Sendok & Garpu"],
  ["RB103017", "Sendok Oval Duco", "Sendok & Garpu"],
  ["RB103018", "Sendok Oval Cekung", "Sendok & Garpu"],
  ["RB103019", "Sumpit", "Sendok & Garpu"],
  ["RB109001", "Penumbuk set", "Alat Dapur"],
  ["RB109002", "Rolling Pin Putar", "Alat Dapur"],
  ["RB109003", "Pemukul Daging", "Alat Dapur"],
  ["RB109004", "Penjapit Kayu", "Alat Dapur"],
  ["RB109005", "Penjapit Stainless", "Alat Dapur"],
  ["RB109006", "Penggiling Adonan", "Alat Dapur"],
  ["RB201001", "Talenan Lubang Oval", "Talenan"],
  ["RB201002", "Talenan Besar MR DIY", "Talenan"],
  ["RB201003", "Talenan Gagang", "Talenan"],
  ["RB201004", "Talenan Jepang", "Talenan"],
  ["RB201005", "Talenan 13an", "Talenan"],
  ["RB201006", "Talenan Lubang Bulat", "Talenan"],
  ["RB201007", "Talenan Besar Pendopo", "Talenan"],
  ["RB201008", "Talenan Lawas", "Talenan"],
  ["RB201009", "Talenan Square Lubang Samping", "Talenan"],
  ["RB201010", "Talenan Square Lubang Tengah", "Talenan"],
  ["RB201011", "Talenan Modif 1", "Talenan"],
  ["RB201012", "Talenan Modif 2", "Talenan"],
  ["RB201013", "Talenan Modif 3", "Talenan"],
  ["RB201014", "Talenan Round Lubang Samping", "Talenan"],
  ["RB201015", "Talenan Square Tanpa Lubang", "Talenan"],
  ["RB305001", "Piring", "Peralatan Makan"],
  ["RB305002", "Mangkok", "Peralatan Makan"],
  ["RB305003", "Cobek", "Peralatan Makan"],
  ["RB306001", "Cangkir + Tutup", "Gelas & Cangkir"],
  ["RB306002", "Gelas dia 8 tinggi 12", "Gelas & Cangkir"],
  ["RB306003", "Gelas dia 8 tinggi 14", "Gelas & Cangkir"],
  ["RB404001", "Nampan Pendek", "Nampan & Tray"],
  ["RB404002", "Nampan Panjang", "Nampan & Tray"],
  ["RB404003", "Tray Bambu 40 cm", "Nampan & Tray"],
  ["RB404004", "Tray Bambu 45 cm", "Nampan & Tray"]
];

var DEFAULT_MASTER_VENDORS = [
  ["VPRE01", "Londo", "Londo", "Pre-Finishing"],
  ["VPRE02", "Titik PWJ", "Titik", "Pre-Finishing"],
  ["VPRE03", "Widodo Klaten", "Widodo", "Pre-Finishing"],
  ["VPRE04", "Janu", "Janu", "Pre-Finishing"],
  ["VPRE05", "Diro", "Diro", "Pre-Finishing"],
  ["VPRE06", "Ruminto", "Ruminto", "Pre-Finishing"],
  ["VPRE07", "Dodo", "Dodo", "Pre-Finishing"],
  ["VPRE08", "Bayu Wonosari", "Bayu", "Pre-Finishing"],
  ["VPRE09", "Widodo MGL", "Widodo", "Pre-Finishing"],
  ["VPRE10", "Lanjar", "Lanjar", "Pre-Finishing"],
  ["VPRE11", "PKH", "Hery", "Pre-Finishing"],
  ["VPRE12", "Inhouse", "Kofif", "Pre-Finishing"],
  ["VPRE13", "Joko Boyolali", "Joko Byll", "Pre-Finishing"],
  ["VFIN01", "Aris", "Aris", "Finishing"],
  ["VFIN02", "Baryadi", "Baryadi", "Finishing"],
  ["VFIN03", "Yuli", "Yuli", "Finishing"],
  ["VFIN04", "Yoga", "Yoga", "Finishing"],
  ["VFIN05", "Nyoto", "Nyoto", "Finishing"],
  ["VFIN06", "Bayu", "Bayu", "Finishing"],
  ["VFIN07", "Sulis", "Sulis", "Finishing"],
  ["VFIN08", "San-San", "San - San", "Finishing"],
  ["VFIN09", "Inhouse", "Ari", "Finishing"]
];

function ensureMasterSheets(rekapSs) {
  var masterDefs = [
    {
      name: "DB_Master",
      headers: ["Kode Raw Body", "Nama Produk", "Kategori"],
      seed: DEFAULT_MASTER_PRODUCTS
    },
    {
      name: "VENDOR_MASTER",
      headers: ["Kode Vendor", "Nama Vendor", "Contact Person", "Tipe Vendor"],
      seed: DEFAULT_MASTER_VENDORS
    }
  ];

  for (var i = 0; i < masterDefs.length; i++) {
    var def = masterDefs[i];
    var sh = rekapSs.getSheetByName(def.name);
    if (!sh) {
      sh = rekapSs.insertSheet(def.name);
    }
    var firstCell = String(sh.getRange(1, 1).getValue() || "").trim();
    if (!firstCell) {
      var hr = sh.getRange(1, 1, 1, def.headers.length);
      hr.setValues([def.headers]);
      hr.setFontWeight("bold");
      hr.setBackground("#f1f5f9");
      sh.setFrozenRows(1);
    }
    if (sh.getLastRow() < 2 && def.seed && def.seed.length > 0) {
      sh.getRange(2, 1, def.seed.length, def.headers.length).setValues(def.seed);
    }
  }
}

function handleGetMasterData(cfg) {
  var rekapSs = getRekapSpreadsheet(cfg);
  ensureMasterSheets(rekapSs);
  var products = [];
  var vendors = [];

  var dbSheet = rekapSs.getSheetByName("DB_Master");
  if (dbSheet && dbSheet.getLastRow() >= 2) {
    var pRows = dbSheet.getDataRange().getValues();
    for (var i = 1; i < pRows.length; i++) {
      if (pRows[i][0] && pRows[i][1]) {
        products.push({
          kodeRawBody: String(pRows[i][0]).trim(),
          namaProduk: String(pRows[i][1]).trim(),
          kategori: String(pRows[i][2] || "Kitchenware").trim()
        });
      }
    }
  }

  var vSheet = rekapSs.getSheetByName("VENDOR_MASTER");
  if (vSheet && vSheet.getLastRow() >= 2) {
    var vRows = vSheet.getDataRange().getValues();
    for (var j = 1; j < vRows.length; j++) {
      if (vRows[j][1]) {
        vendors.push({
          kodeVendor: String(vRows[j][0] || "").trim(),
          namaVendor: String(vRows[j][1]).trim(),
          tipeVendor: String(vRows[j][3] || vRows[j][2] || "Pre-Finishing").trim()
        });
      }
    }
  }

  return jsonResponse({
    status: "success",
    data: {
      products: products,
      vendors: vendors
    }
  });
}

function handleAddMasterProduct(data, cfg) {
  var namaProduk = String((data && (data.namaProduk || data.nama)) || "").trim();
  if (!namaProduk) {
    return jsonResponse({ status: "error", code: "VALIDATION_ERROR", message: "Nama produk wajib diisi." });
  }
  var kategori = String((data && data.kategori) || "Kitchenware").trim() || "Kitchenware";
  var kodeRawBody = String((data && (data.kodeRawBody || data.sku)) || "").trim().toUpperCase();

  var rekapSs = getRekapSpreadsheet(cfg);
  ensureMasterSheets(rekapSs);
  var dbSheet = rekapSs.getSheetByName("DB_Master");
  var rows = dbSheet.getLastRow() >= 2 ? dbSheet.getDataRange().getValues() : [];

  if (!kodeRawBody) {
    kodeRawBody = "RB-" + ("000" + rows.length).slice(-3);
  }

  for (var i = 1; i < rows.length; i++) {
    var rowSku = String(rows[i][0] || "").trim().toUpperCase();
    var rowNama = String(rows[i][1] || "").trim().toLowerCase();
    if (rowSku === kodeRawBody || rowNama === namaProduk.toLowerCase()) {
      dbSheet.getRange(i + 1, 1, 1, 3).setValues([[rowSku || kodeRawBody, namaProduk, kategori]]);
      return jsonResponse({
        status: "success",
        updated: true,
        product: { kodeRawBody: rowSku || kodeRawBody, namaProduk: namaProduk, kategori: kategori }
      });
    }
  }

  dbSheet.appendRow([kodeRawBody, namaProduk, kategori]);
  return jsonResponse({
    status: "success",
    updated: false,
    product: { kodeRawBody: kodeRawBody, namaProduk: namaProduk, kategori: kategori }
  });
}

function handleAddMasterVendor(data, cfg) {
  var namaVendor = String((data && (data.namaVendor || data.nama)) || "").trim();
  if (!namaVendor) {
    return jsonResponse({ status: "error", code: "VALIDATION_ERROR", message: "Nama vendor wajib diisi." });
  }
  var tipeRaw = String((data && (data.tipeVendor || data.tipe)) || "Pre-Finishing").trim();
  var tipeLower = tipeRaw.toLowerCase();
  var tipeVendor = tipeLower === "both" ? "Both" : (tipeLower.indexOf("fin") !== -1 && tipeLower.indexOf("pre") === -1 ? "Finishing" : "Pre-Finishing");
  var contactPerson = String((data && data.contactPerson) || "-").trim() || "-";

  var rekapSs = getRekapSpreadsheet(cfg);
  ensureMasterSheets(rekapSs);
  var vSheet = rekapSs.getSheetByName("VENDOR_MASTER");
  var rows = vSheet.getLastRow() >= 2 ? vSheet.getDataRange().getValues() : [];

  var kodeVendor = String((data && data.kodeVendor) || "").trim().toUpperCase();
  if (!kodeVendor) {
    var prefix = tipeVendor === "Finishing" ? "VFIN-" : "VPRE-";
    kodeVendor = prefix + ("000" + Math.max(1, rows.length)).slice(-3);
  }

  for (var i = 1; i < rows.length; i++) {
    var rowNama = String(rows[i][1] || "").trim().toLowerCase();
    if (rowNama === namaVendor.toLowerCase()) {
      var existingCode = String(rows[i][0] || kodeVendor).trim();
      vSheet.getRange(i + 1, 1, 1, 4).setValues([[existingCode, namaVendor, contactPerson, tipeVendor]]);
      return jsonResponse({
        status: "success",
        updated: true,
        vendor: { kodeVendor: existingCode, namaVendor: namaVendor, tipeVendor: tipeVendor }
      });
    }
  }

  vSheet.appendRow([kodeVendor, namaVendor, contactPerson, tipeVendor]);
  refreshDashboardSheet(rekapSs);
  return jsonResponse({
    status: "success",
    updated: false,
    vendor: { kodeVendor: kodeVendor, namaVendor: namaVendor, tipeVendor: tipeVendor }
  });
}

function handleResetQcData(data, cfg) {
  var confirmText = String((data && data.confirm) || "").trim().toUpperCase();
  if (confirmText !== "RESET") {
    return jsonResponse({
      status: "error",
      code: "VALIDATION_ERROR",
      message: "Konfirmasi RESET wajib dikirim untuk menghapus seluruh data QC."
    });
  }

  var rekapSs = getRekapSpreadsheet(cfg);
  ensureRekapSheets(rekapSs);

  var mSheet = rekapSs.getSheetByName(SHEET_NAMES.META);
  var trashedFiles = 0;
  var trashedIdSet = {};
  var protectedIds = {};
  if (cfg.templateFileId) protectedIds[cfg.templateFileId] = true;
  if (cfg.rekapSpreadsheetId) protectedIds[cfg.rekapSpreadsheetId] = true;
  if (typeof rekapSs.getId === "function" && rekapSs.getId()) {
    protectedIds[rekapSs.getId()] = true;
  }

  if (mSheet && mSheet.getLastRow() >= 2) {
    var mRows = mSheet.getRange(2, 1, mSheet.getLastRow() - 1, 8).getValues();
    for (var i = 0; i < mRows.length; i++) {
      var ids = [String(mRows[i][4] || "").trim(), String(mRows[i][5] || "").trim()];
      for (var j = 0; j < ids.length; j++) {
        var fid = ids[j];
        if (!fid || protectedIds[fid] || trashedIdSet[fid]) continue;
        try {
          var f = DriveApp.getFileById(fid);
          if (f && typeof f.setTrashed === "function") {
            f.setTrashed(true);
            trashedIdSet[fid] = true;
            trashedFiles++;
          }
        } catch (trashErr) {
          Logger.log("Gagal memindahkan file ke sampah (" + fid + "): " + trashErr.toString());
        }
      }
    }
  }

  // Bersihkan seluruh file di subfolder khusus Laporan QC (arsip & REKAP QC PUSAT tetap aman)
  if (cfg.outputFolderId) {
    try {
      var rootFolder = DriveApp.getFolderById(cfg.outputFolderId);
      if (rootFolder && typeof rootFolder.getFoldersByName === "function") {
        var subIter = rootFolder.getFoldersByName(REPORT_SUBFOLDER_NAME);
        while (subIter && typeof subIter.hasNext === "function" && subIter.hasNext()) {
          var subFolder = subIter.next();
          if (!subFolder || typeof subFolder.getFiles !== "function") continue;
          var fileIter = subFolder.getFiles();
          while (fileIter && typeof fileIter.hasNext === "function" && fileIter.hasNext()) {
            var rf = fileIter.next();
            var rfId = rf && typeof rf.getId === "function" ? String(rf.getId() || "").trim() : "";
            if (!rfId || protectedIds[rfId] || trashedIdSet[rfId]) continue;
            if (typeof rf.isTrashed === "function" && rf.isTrashed()) continue;
            if (typeof rf.setTrashed === "function") {
              rf.setTrashed(true);
              trashedIdSet[rfId] = true;
              trashedFiles++;
            }
          }
        }
      }
    } catch (folderErr) {
      Logger.log("Gagal membersihkan subfolder Laporan QC: " + folderErr.toString());
    }
  }

  var targetSheets = [
    SHEET_NAMES.DASHBOARD,
    SHEET_NAMES.KUNJUNGAN,
    SHEET_NAMES.ROWBODY,
    SHEET_NAMES.FINISHING,
    SHEET_NAMES.DETAIL,
    SHEET_NAMES.KERUSAKAN,
    SHEET_NAMES.META
  ];

  var clearedSheets = 0;
  for (var s = 0; s < targetSheets.length; s++) {
    var sh = rekapSs.getSheetByName(targetSheets[s]);
    if (!sh) continue;
    var lastRow = sh.getLastRow();
    if (lastRow >= 2) {
      if (typeof sh.deleteRows === "function") {
        sh.deleteRows(2, lastRow - 1);
      } else {
        sh.getRange(2, 1, lastRow - 1, Math.max(1, sh.getLastColumn ? sh.getLastColumn() : 30)).clearContent();
      }
    }
    clearedSheets++;
  }

  refreshDashboardSheet(rekapSs);

  return jsonResponse({
    status: "success",
    clearedSheets: clearedSheets,
    trashedFiles: trashedFiles,
    message: "Seluruh data QC (" + clearedSheets + " sheet & " + trashedFiles + " file Drive) berhasil direset bersih."
  });
}

/**
 * Jalankan manual di editor Apps Script jika ingin mereset seluruh data QC langsung dari Google Sheets.
 */
function resetAllQcData() {
  var res = handleResetQcData({ confirm: "RESET" }, getProps());
  return JSON.parse(res.getContent());
}
