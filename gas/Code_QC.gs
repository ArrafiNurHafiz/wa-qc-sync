/**
 * Code_QC.gs — Google Apps Script Web App untuk Automasi QC Lapangan KWaS (wa-qc-sync)
 * Menulis salinan form DOK. QC-WOOD-01 (+ ekspor PDF opsional) ke Google Drive
 * serta mencatat rekap terpusat ke REKAP_QC_KUNJUNGAN, REKAP_QC_DETAIL_ITEM, dan LOG_KERUSAKAN.
 */

var SHEET_NAMES = {
  KUNJUNGAN: "REKAP_QC_KUNJUNGAN",
  DETAIL: "REKAP_QC_DETAIL_ITEM",
  KERUSAKAN: "LOG_KERUSAKAN"
};

var TEMPLATE_SHEET_NAME = "Form QC Lap";

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
  { id: "WARNA", row: 27, label: "Warna Sesuai Color Card" },
  { id: "KEHALUSAN", row: 28, label: "Kehalusan Permukaan" },
  { id: "BEBAS_LUBANG", row: 29, label: "Bebas Lubang" }
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
    generatePdf: (p.getProperty("GENERATE_PDF") || "true").trim().toLowerCase() !== "false",
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
    } else if (action === "GET_QC_DASHBOARD") {
      return handleGetQcDashboard(data, cfg);
    } else if (action === "VOID_QC_REPORT") {
      return handleVoidQcReport(data, cfg);
    } else if (action === "GET_MASTER_DATA") {
      return handleGetMasterData(cfg);
    }

    return jsonResponse({ status: "error", message: "Action tidak dikenali: " + action });
  } catch (err) {
    return jsonResponse({ status: "error", message: "Kesalahan GAS: " + err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function ensureRekapSheets(ss) {
  var defs = [
    {
      name: SHEET_NAMES.KUNJUNGAN,
      headers: [
        "Tanggal", "No Laporan", "No PO", "Vendor", "Petugas QC",
        "Total Item", "Total Diperiksa", "Total Rusak", "Total Lolos",
        "Keputusan Umum", "Link File Drive", "Link PDF", "Status",
        "Catatan Umum", "Idempotency Key", "File ID", "PDF File ID", "Alasan Void"
      ]
    },
    {
      name: SHEET_NAMES.DETAIL,
      headers: [
        "Tanggal", "No Laporan", "Vendor", "No PO", "Kode Raw Body",
        "Nama Item", "Tahap", "Diperiksa", "MC Mentah", "MC Jadi",
        "Total Rusak", "Rincian Kerusakan", "Lolos Diterima", "Keputusan", "Catatan Item"
      ]
    },
    {
      name: SHEET_NAMES.KERUSAKAN,
      headers: [
        "Tanggal", "No Laporan", "Vendor", "Kode Raw Body", "Nama Item",
        "Kriteria ID", "Jenis Kerusakan", "Qty Rusak", "Petugas QC"
      ]
    }
  ];

  for (var i = 0; i < defs.length; i++) {
    var def = defs[i];
    var sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
    }
    var firstCell = String(sheet.getRange(1, 1).getValue() || "").trim();
    if (!firstCell) {
      var headerRange = sheet.getRange(1, 1, 1, def.headers.length);
      headerRange.setValues([def.headers]);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#f1f5f9");
      sheet.setFrozenRows(1);
    }
  }
}

function normalizeTemplateCheckboxes(templateSheet) {
  var chkCols = ["C", "F", "I", "L"];
  for (var c = 0; c < chkCols.length; c++) {
    var col = chkCols[c];
    templateSheet.getRange(col + "14:" + col + "21").insertCheckboxes().setValue(false);
    templateSheet.getRange(col + "23:" + col + "25").insertCheckboxes().setValue(false);
    templateSheet.getRange(col + "27:" + col + "29").insertCheckboxes().setValue(false);
  }
  templateSheet.getRange("B32:M32").insertCheckboxes().setValue(false);
  templateSheet.getRange("B33:M33").setWrap(true).setVerticalAlignment("top");
  templateSheet.getRange("A35:M35").setWrap(true).setVerticalAlignment("top");
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

function findExistingReport(kunjunganSheet, noLaporan, idempotencyKey) {
  var lastRow = kunjunganSheet.getLastRow();
  if (lastRow < 2) return null;
  var rows = kunjunganSheet.getRange(2, 1, lastRow - 1, 18).getValues();
  for (var i = 0; i < rows.length; i++) {
    var rowNo = String(rows[i][1] || "").trim();
    var rowKey = String(rows[i][14] || "").trim();
    if ((noLaporan && rowNo === noLaporan) || (idempotencyKey && rowKey === idempotencyKey)) {
      return {
        rowIndex: i + 2,
        noLaporan: rowNo,
        sheetUrl: String(rows[i][10] || ""),
        pdfUrl: String(rows[i][11] || ""),
        fileId: String(rows[i][15] || "")
      };
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

function fillFormTab(sheet, data, itemsChunk) {
  // Header Kunjungan
  sheet.getRange("B4").setValue(data.vendor || "-");
  sheet.getRange("J4").setValue(data.noDokumenPo || "-");
  sheet.getRange("B5").setValue(data.tanggalPemeriksaan || "");
  sheet.getRange("J5").setValue(data.petugasQc || "-");

  // Catatan Umum & Tanda Tangan Footer
  var catatanUmum = String(data.catatanUmum || "").trim();
  sheet.getRange("A35").setValue("CATATAN UMUM KUNJUNGAN\n" + (catatanUmum || "-"));
  sheet.getRange("A37").setValue(data.petugasQc || "-");
  sheet.getRange("E37").setValue(data.tanggalPemeriksaan || "");
  sheet.getRange("G37").setValue(data.diketahuiVendor || "-");
  sheet.getRange("M37").setValue(data.diketahuiVendor ? (data.tanggalPemeriksaan || "") : "");

  for (var slotIdx = 0; slotIdx < ITEM_SLOTS.length; slotIdx++) {
    var slot = ITEM_SLOTS[slotIdx];
    var item = itemsChunk[slotIdx];
    if (!item) continue;

    var itemLabel = item.kodeRawBody
      ? (item.kodeRawBody + " - " + (item.namaItem || ""))
      : (item.namaItem || "");

    sheet.getRange(slot.valCol + "8").setValue(itemLabel);
    sheet.getRange(slot.valCol + "9").setValue(Number(item.qtyDiperiksa) || 0);
    sheet.getRange(slot.valCol + "11").setValue(item.mcMentah !== null && item.mcMentah !== undefined && item.mcMentah !== "" ? Number(item.mcMentah) : "");
    sheet.getRange(slot.valCol + "12").setValue(item.mcJadi !== null && item.mcJadi !== undefined && item.mcJadi !== "" ? Number(item.mcJadi) : "");

    var kStatus = item.kriteriaStatus || {};
    for (var cIdx = 0; cIdx < CRITERIA_ROW_MAP.length; cIdx++) {
      var crit = CRITERIA_ROW_MAP[cIdx];
      var status = String(kStatus[crit.id] || "OK").toUpperCase();
      var cellRange = sheet.getRange(slot.chkCol + crit.row);

      if (status === "NA") {
        cellRange.clearDataValidations();
        cellRange.setValue("–");
      } else if (status === "NOK") {
        cellRange.insertCheckboxes();
        cellRange.setValue(false);
      } else {
        cellRange.insertCheckboxes();
        cellRange.setValue(true);
      }
    }

    var decision = String(item.keputusan || "Lolos");
    sheet.getRange(slot.decCols[0] + "32").insertCheckboxes().setValue(decision === "Lolos");
    sheet.getRange(slot.decCols[1] + "32").insertCheckboxes().setValue(decision === "Bersyarat");
    sheet.getRange(slot.decCols[2] + "32").insertCheckboxes().setValue(decision === "Tolak");

    sheet.getRange(slot.valCol + "33").setValue(item.catatanSingkat || "");
    sheet.getRange(slot.valCol + "34").setValue(Number(item.qtyLolos) || 0);
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
  var existing = findExistingReport(kunjunganSheet, data.noLaporan, data.idempotencyKey);
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

  var outputFolder = DriveApp.getFolderById(cfg.outputFolderId);
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

    for (var dIdx = 0; dIdx < defectList.length; dIdx++) {
      var defect = defectList[dIdx];
      if ((Number(defect.qty) || 0) > 0) {
        rusakSheet.appendRow([
          data.tanggalPemeriksaan || "",
          data.noLaporan,
          data.vendor,
          it.kodeRawBody || "",
          it.namaItem || "",
          defect.kriteriaId || "LAINNYA",
          defect.label || defect.kriteriaId || "Lainnya",
          Number(defect.qty) || 0,
          data.petugasQc || "-"
        ]);
      }
    }
  }

  kunjunganSheet.appendRow([
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
    sheetUrl,
    pdfUrl,
    "ACTIVE",
    data.catatanUmum || "",
    data.idempotencyKey || "",
    copiedId,
    pdfFileId,
    ""
  ]);

  return jsonResponse({
    status: "success",
    duplicate: false,
    noLaporan: data.noLaporan,
    fileId: copiedId,
    sheetUrl: sheetUrl,
    pdfUrl: pdfUrl
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

  var kValues = kSheet.getDataRange().getValues();
  var dValues = dSheet.getDataRange().getValues();
  var rValues = rSheet.getDataRange().getValues();

  var reports = [];
  var totalInspected = 0;
  var totalDefect = 0;
  var totalPassed = 0;
  var activeReports = 0;
  var voidReports = 0;

  for (var i = 1; i < kValues.length; i++) {
    var row = kValues[i];
    if (!row[1]) continue;
    var status = String(row[12] || "ACTIVE").toUpperCase();
    var item = {
      tanggal: formatCellDate(row[0]),
      noLaporan: String(row[1] || ""),
      noDokumenPo: String(row[2] || "-"),
      vendor: String(row[3] || ""),
      petugasQc: String(row[4] || "-"),
      totalItem: Number(row[5]) || 0,
      totalDiperiksa: Number(row[6]) || 0,
      totalRusak: Number(row[7]) || 0,
      totalLolos: Number(row[8]) || 0,
      keputusanUmum: String(row[9] || "Lolos"),
      sheetUrl: String(row[10] || ""),
      pdfUrl: String(row[11] || ""),
      status: status,
      catatanUmum: String(row[13] || ""),
      alasanVoid: String(row[17] || "")
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
  var kSheet = rekapSs.getSheetByName(SHEET_NAMES.KUNJUNGAN);
  var lastRow = kSheet.getLastRow();
  if (lastRow < 2) {
    return jsonResponse({ status: "error", code: "NOT_FOUND", message: "Laporan tidak ditemukan." });
  }

  var rows = kSheet.getRange(2, 1, lastRow - 1, 18).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1] || "").trim() === noLaporan) {
      var currentStatus = String(rows[i][12] || "ACTIVE").toUpperCase();
      if (currentStatus === "VOID") {
        return jsonResponse({
          status: "error",
          code: "ALREADY_VOID",
          message: "Laporan " + noLaporan + " sudah berstatus VOID."
        });
      }

      var rowNum = i + 2;
      kSheet.getRange(rowNum, 13).setValue("VOID");
      kSheet.getRange(rowNum, 18).setValue(alasanVoid + " (oleh: " + oleh + ")");

      var fileId = String(rows[i][15] || "").trim();
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

      var pdfId = String(rows[i][16] || "").trim();
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

function handleGetMasterData(cfg) {
  var rekapSs = getRekapSpreadsheet(cfg);
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
