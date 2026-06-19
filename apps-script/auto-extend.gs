/**
 * KP Wallpanel — Master Sheet ORDER-ROW EXTENDER
 * ────────────────────────────────────────────────
 * Inserts more pre-formatted, sequentially-numbered order rows INSIDE the
 * order block — directly above the last slot row — so:
 *   • the green totals row (=SUM(G26:G107) etc.) auto-expands and stays correct,
 *   • the green/summary section BELOW the totals just moves down, unchanged,
 *   • new rows get the next order numbers (e.g. 1-308, 1-309 …) in column B.
 *
 * The order block is detected as the FIRST contiguous run of rows that have
 * the Status dropdown (data validation) in column A. The totals row has no
 * such dropdown, so it cleanly marks the end of the block.
 *
 * SAFETY: it shows a confirmation dialog (which tab, where, which numbers)
 * before changing anything, and never touches the totals row or anything
 * below it. Runs from the "KP Tools" menu. Auto-mode is OFF by default.
 *
 * ⚠️ TEST FIRST on a COPY of the sheet (Datei → Kopie erstellen) and verify
 * the totals + numbering before using it on the live file.
 *
 * ── ADJUST HERE ───────────────────────────────────────────────────────── */
var AE_ROWS_TO_ADD = 50;     // how many new order rows to add per run
var AE_MIN_BUFFER  = 20;     // (auto-mode) keep at least this many empty slots
var AE_AUTO        = false;  // true = also top up automatically on edit; leave
                             //        false until you've verified it on a copy
var AE_STATUS_COL  = 1;      // column A — order rows have the Status dropdown
var AE_NUM_COL     = 2;      // column B — order number "<prefix><n>"
var AE_DATA_COLS   = [3, 7]; // a row counts as USED if any of these has content
                             // (C = date, G = total). Empty in all = free slot.
/* ─────────────────────────────────────────────────────────────────────── */

// Find the first contiguous block of order rows (Status dropdown in col A).
function aeFindBlock(sh) {
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < AE_NUM_COL) return null;
  var dv = sh.getRange(1, AE_STATUS_COL, lastRow, 1).getDataValidations();
  var first = -1, last = -1;
  for (var r = 0; r < lastRow; r++) {
    if (dv[r][0] != null) { if (first < 0) first = r + 1; last = r + 1; }
    else if (first >= 0) break; // first gap after the block → stop
  }
  if (first < 0 || last < first) return null;
  return { first: first, last: last, lastCol: lastCol };
}

function aeParseNum(s) {
  var m = String(s == null ? '' : s).match(/^\s*(.*?)(\d+)\s*$/);
  return m ? { prefix: m[1], n: parseInt(m[2], 10) } : null;
}

// Analyse a block: max used order number, prefix, count of empty slots.
function aeStats(sh, b) {
  var rows = sh.getRange(b.first, 1, b.last - b.first + 1, b.lastCol).getValues();
  var maxFilled = 0, prefix = null, emptySlots = 0;
  for (var i = 0; i < rows.length; i++) {
    var used = AE_DATA_COLS.some(function (c) { return String(rows[i][c - 1]).trim() !== ''; });
    var pn = aeParseNum(rows[i][AE_NUM_COL - 1]);
    if (pn) { if (prefix === null) prefix = pn.prefix; if (used && pn.n > maxFilled) maxFilled = pn.n; }
    if (!used) emptySlots++;
  }
  return { maxFilled: maxFilled, prefix: prefix == null ? '' : prefix, emptySlots: emptySlots, rows: rows };
}

// Core: insert AE_ROWS_TO_ADD rows above the last slot, clone formatting +
// validation + formulas from the last order row, then renumber empty slots.
function aeInsert(sh, silent) {
  var b = aeFindBlock(sh);
  if (!b) return { ok: false, msg: 'No order block found on "' + sh.getName() + '".' };
  var st = aeStats(sh, b);
  var startNum = st.maxFilled + 1;
  var endNum = startNum + (st.emptySlots + AE_ROWS_TO_ADD) - 1;

  if (!silent) {
    var ui = SpreadsheetApp.getUi();
    var resp = ui.alert('Add order rows',
      'Tab: ' + sh.getName() + '\n' +
      'Insert ' + AE_ROWS_TO_ADD + ' rows above row ' + b.last + ' (inside the totals range).\n' +
      'Empty slots will be renumbered ' + st.prefix + startNum + ' … ' + st.prefix + endNum + '.\n\n' +
      'Totals + everything below the green row stay correct. Proceed?',
      ui.ButtonSet.OK_CANCEL);
    if (resp !== ui.Button.OK) return { ok: false, msg: 'Cancelled.' };
  }

  // 1) Insert blank rows above the last slot → totals SUM range expands.
  sh.insertRowsBefore(b.last, AE_ROWS_TO_ADD);
  var tplRow = b.last + AE_ROWS_TO_ADD;            // original last slot, shifted down
  var lastCol = sh.getLastColumn();
  var tpl  = sh.getRange(tplRow, 1, 1, lastCol);
  var dest = sh.getRange(b.last, 1, AE_ROWS_TO_ADD, lastCol);

  // 2) Clone look + dropdowns + per-row formulas (NOT values).
  tpl.copyTo(dest, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  try {
    var dv = tpl.getDataValidations()[0], dvM = [];
    for (var i = 0; i < AE_ROWS_TO_ADD; i++) dvM.push(dv.slice());
    dest.setDataValidations(dvM);
  } catch (e1) {}
  try {
    var f = tpl.getFormulasR1C1()[0], fM = [];
    for (var j = 0; j < AE_ROWS_TO_ADD; j++) fM.push(f.slice());
    dest.setFormulasR1C1(fM);
  } catch (e2) {}

  // 3) Renumber every empty slot in the (now bigger) block, sequentially.
  var nb = aeFindBlock(sh);
  var vals = sh.getRange(nb.first, 1, nb.last - nb.first + 1, nb.lastCol).getValues();
  var counter = startNum;
  for (var k = 0; k < vals.length; k++) {
    var used = AE_DATA_COLS.some(function (c) { return String(vals[k][c - 1]).trim() !== ''; });
    if (!used) { sh.getRange(nb.first + k, AE_NUM_COL).setValue(st.prefix + counter); counter++; }
  }
  return { ok: true, msg: 'Added ' + AE_ROWS_TO_ADD + ' rows on "' + sh.getName() + '" (' + st.prefix + startNum + '…' + st.prefix + endNum + ').' };
}

// Menu action: add rows to the CURRENTLY OPEN tab (with confirmation).
function autoExtendAllNow() {
  var sh = SpreadsheetApp.getActiveSheet();
  var r = aeInsert(sh, false);
  try { SpreadsheetApp.getUi().alert(r.ok ? 'Done' : 'Note', r.msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
}

// Auto-mode hook (called from master-onedit.gs onEdit). Off unless AE_AUTO.
function autoExtendIfNeeded(sh) {
  try {
    if (!AE_AUTO) return;
    var b = aeFindBlock(sh); if (!b) return;
    if (aeStats(sh, b).emptySlots > AE_MIN_BUFFER) return;
    aeInsert(sh, true); // silent
  } catch (err) { /* never block the edit */ }
}
