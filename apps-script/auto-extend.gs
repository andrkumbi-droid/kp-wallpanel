/**
 * KP Wallpanel — Master Sheet AUTO-EXTEND
 * ─────────────────────────────────────────
 * Problem: when the formatted data area fills up, an office worker has to
 * add rows by hand (and formatting / dropdowns / per-row formulas get lost).
 *
 * Solution: this keeps at least AE_MIN_BUFFER empty *formatted* rows below
 * the last data row at all times. When that buffer runs low it appends
 * AE_ROWS_TO_ADD rows and copies format + data-validation + row-relative
 * formulas from a template row — but NOT the template's text/values.
 *
 * It is called automatically from the onEdit handler in master-onedit.gs
 * (so it runs whenever someone types into a sheet that has the combined
 * "ชื่อ-ที่อยู่ลูกค้า" column). It returns instantly when the buffer is fine,
 * so it adds no noticeable lag.
 *
 * INSTALL: paste this file into the MASTER sheet's Apps Script project
 * (alongside master-onedit.gs) and Save. No trigger setup needed.
 *
 * ── ADJUST HERE (the only knobs you normally touch) ──────────────────── */
var AE_ROWS_TO_ADD  = 50;   // how many formatted rows to append each time
var AE_MIN_BUFFER   = 20;   // keep at least this many empty formatted rows spare
var AE_TEMPLATE_ROW = 0;    // 0 = use the last data row as the template;
                            //     or set a fixed row number (a clean formatted row)
/* ─────────────────────────────────────────────────────────────────────── */

// Called from master-onedit.gs onEdit(). `sh` = the edited sheet (already
// known to be a target sheet with the combined column).
function autoExtendIfNeeded(sh) {
  try {
    var P = PropertiesService.getDocumentProperties();
    var key = 'fmtEnd_' + sh.getSheetId();
    var lastData = sh.getLastRow();
    var fmtEnd = parseInt(P.getProperty(key), 10) || sh.getMaxRows();

    // Enough formatted buffer still below the last data row? → nothing to do.
    if (lastData <= fmtEnd - AE_MIN_BUFFER) return;

    var lastCol  = sh.getLastColumn();
    var tplRow   = (AE_TEMPLATE_ROW > 0) ? AE_TEMPLATE_ROW : lastData;
    if (tplRow < 1) return;

    var startRow = Math.max(fmtEnd, lastData) + 1;
    var newEnd   = lastData + AE_MIN_BUFFER + AE_ROWS_TO_ADD;
    var nRows    = newEnd - startRow + 1;
    if (nRows < 1) return;

    // Make sure the physical rows exist.
    var maxRows = sh.getMaxRows();
    if (newEnd > maxRows) sh.insertRowsAfter(maxRows, newEnd - maxRows);

    var tpl  = sh.getRange(tplRow, 1, 1, lastCol);
    var dest = sh.getRange(startRow, 1, nRows, lastCol);

    // 1) Format only (colours, borders, number formats) — never the values.
    tpl.copyTo(dest, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);

    // 2) Data validation (dropdowns) — repeat the template row down.
    try {
      var dv = tpl.getDataValidations()[0];
      var dvM = [];
      for (var i = 0; i < nRows; i++) dvM.push(dv.slice());
      dest.setDataValidations(dvM);
    } catch (e1) {}

    // 3) Per-row formulas, relative (R1C1) so references shift per row.
    //    Non-formula cells come back as '' → stay empty (no copied values).
    try {
      var f = tpl.getFormulasR1C1()[0];
      var fM = [];
      for (var j = 0; j < nRows; j++) fM.push(f.slice());
      dest.setFormulasR1C1(fM);
    } catch (e2) {}

    P.setProperty(key, String(newEnd));
  } catch (err) { /* never block the edit */ }
}

// Optional: run once from the editor (or a menu) to (re)apply formatting to
// the buffer right now, e.g. after first install. Safe to run repeatedly.
function autoExtendAllNow() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets().forEach(function (sh) {
    // only sheets that have the combined column (same check the splitter uses)
    var lastCol = sh.getLastColumn();
    if (lastCol < 1) return;
    var has = false;
    for (var r = 1; r <= Math.min(6, sh.getLastRow()); r++) {
      var vals = sh.getRange(r, 1, 1, lastCol).getValues()[0];
      for (var c = 0; c < vals.length; c++) { if (/ชื่อ.*ที่อยู่/.test(String(vals[c]).trim())) { has = true; break; } }
      if (has) break;
    }
    if (!has) return;
    PropertiesService.getDocumentProperties().deleteProperty('fmtEnd_' + sh.getSheetId());
    autoExtendIfNeeded(sh);
  });
  try { SpreadsheetApp.getUi().alert('Auto-extend applied to all data sheets.'); } catch (e) {}
}
