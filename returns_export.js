/*
 * Excel export for the Returns/Exchanges tabs.
 * Uses the locally bundled ExcelJS (vendor/exceljs.min.js, no CDN) to build
 * a genuine .xlsx workbook entirely client-side from the already-loaded
 * returns_data.json data. Never calls Priority or touches any source file.
 */

var RETURNS_EXPORT_COLUMNS = [
  { header: "הזמנה", key: "orderNumber", width: 18 },
  { header: "תאריך", key: "orderDate", width: 12 },
  { header: "סטטוס הזמנה", key: "orderStatus", width: 16 },
  { header: "ת.עדכון סטטוס", key: "statusUpdate", width: 17 },
  { header: "ימי עבודה בסטטוס", key: "statusAgeDays", width: 14 },
  { header: "קוד אופן משלוח נוסף", key: "shippingCode", width: 12 },
  { header: "תאור אופן משלוח נוסף", key: "shippingDesc", width: 26 },
  { header: "סוג הזמנה", key: "orderType", width: 10 },
  { header: "תאור סוג מכירה", key: "orderTypeDesc", width: 16 },
  { header: "חברת שליחויות שמטפלת בהזמנה", key: "provider", width: 24 },
  { header: "גורם אחראי", key: "responsibility", width: 14 },
  { header: "סוג פעולה", key: "actionType", width: 14 },
];

// Standard CSV/XLSX-injection mitigation (OWASP): a cell value that starts
// with =, +, -, @ or a control character can be reinterpreted as a formula
// by some spreadsheet apps when the sheet is re-imported/opened elsewhere.
// Prefixing with a leading apostrophe forces text, and Excel itself strips
// a leading "force text" apostrophe on display, so genuine content is
// unaffected -- only values that would otherwise trigger formula parsing
// are altered.
function sanitizeForExcelCell(value){
  if (value === null || value === undefined) return "";
  var s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) {
    return "'" + s;
  }
  return s;
}

// orderDate from returns_data.json is "DD/MM/YYYY" (returns_builder.fmt_date).
// Returns a real JS Date for a genuine Excel date cell, or null if
// unparseable/missing (falls back to plain sanitized text).
function parseOrderDateForExcel(s){
  if (!s) return null;
  var m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]);
}

function buildExportFilename(parts){
  var today = new Date();
  var dateStr = today.getFullYear() + "-" +
    String(today.getMonth() + 1).padStart(2, "0") + "-" +
    String(today.getDate()).padStart(2, "0");
  var pieces = ["returns_export", parts.provider];
  if (parts.responsibility) pieces.push(parts.responsibility);
  if (parts.status) pieces.push(parts.status);
  if (parts.sla) pieces.push(parts.sla);
  pieces.push(dateStr);
  // Strip characters invalid in Windows filenames; keep Hebrew text as-is.
  return pieces.join("_").replace(/[\\/:*?"<>|]/g, "") + ".xlsx";
}

async function exportReturnsToExcel(orders, parts){
  if (typeof ExcelJS === "undefined") {
    alert("שגיאה: ספריית הייצוא לאקסל (ExcelJS) לא נטענה. נסה לרענן את הדף.");
    return;
  }

  var wb = new ExcelJS.Workbook();
  wb.creator = "Coordination Dashboard";
  var ws = wb.addWorksheet("הזמנות", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });

  ws.columns = RETURNS_EXPORT_COLUMNS.map(function(c){
    return { header: c.header, key: c.key, width: c.width };
  });

  orders.forEach(function(o){
    var row = {};
    // Same per-order values the detail table shows (o._statusAge, computed once on page load).
    var age = o._statusAge || { dateText: "", daysText: "—", days: null, excelDate: null };
    RETURNS_EXPORT_COLUMNS.forEach(function(c){
      var v = o[c.key];
      if (c.key === "orderDate") {
        var d = parseOrderDateForExcel(v);
        row[c.key] = d || sanitizeForExcelCell(v);
      } else if (c.key === "statusUpdate") {
        row[c.key] = age.excelDate || sanitizeForExcelCell(age.dateText);
      } else if (c.key === "statusAgeDays") {
        row[c.key] = typeof age.days === "number" ? age.days : sanitizeForExcelCell(age.daysText);
      } else {
        row[c.key] = sanitizeForExcelCell(v);
      }
    });
    var addedRow = ws.addRow(row);

    var dateCell = addedRow.getCell("orderDate");
    if (dateCell.value instanceof Date) {
      dateCell.numFmt = "dd/mm/yyyy";
    }
    var statusUpdateCell = addedRow.getCell("statusUpdate");
    if (statusUpdateCell.value instanceof Date) {
      statusUpdateCell.numFmt = "dd/mm/yyyy hh:mm";
    }
    // Force text format on identifier columns so leading zeros ('015',
    // shipping codes like '02'/'55') are never reinterpreted as numbers.
    ["orderType", "shippingCode", "orderNumber"].forEach(function(k){
      addedRow.getCell(k).numFmt = "@";
    });
  });

  var headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell(function(cell){ cell.alignment = { horizontal: "right" }; });

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: RETURNS_EXPORT_COLUMNS.length },
  };

  var buffer = await wb.xlsx.writeBuffer();
  var blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = buildExportFilename(parts);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
