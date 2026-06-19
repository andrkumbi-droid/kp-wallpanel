/**
 * KP Wallpanel — Master Sheet ORDER-ROW EXTENDER
 * ────────────────────────────────────────────────
 * Inserts more pre-formatted, sequentially-numbered order rows INSIDE the
 * order block — directly above the last slot row — so:
 *   • the green totals row (=SUM(G26:G107) etc.) auto-expands and stays correct,
 *   • the green/summary section BELOW the totals just moves down, unchanged,
 *   • new rows get the next order numbers (e.g. 1-308 / #866 …) in column B.
 *
 * BOUNDARY: the totals row is found by its =SUM(...) formula in column G — a
 * hard, unambiguous stop. Everything the script does (insert + renumber) stays
 * STRICTLY ABOVE that row. Rows below the totals are never touched.
 *
 * SAFETY: shows a confirmation dialog (tab, position, number range) before
 * changing anything. Runs from the "KP Tools" menu. Auto-mode is OFF by default.
 *
 * ⚠️ TEST FIRST on a COPY of the sheet and verify totals + numbering.
 *
 * ── ADJUST HERE ───────────────────────────────────────────────────────── */
var AE_ROWS_TO_ADD = 50;     // how many new order rows to add per run
var AE_MIN_BUFFER  = 20;     // (auto-mode) keep at least this many empty slots
var AE_AUTO        = false;  // true = also top up automatically on edit
var AE_STATUS_COL  = 1;      // column A — order rows have the Status dropdown
var AE_NUM_COL     = 2;      // column B — order number "<prefix><n>"
var AE_SUM_COL     = 7;      // column G — the totals row has =SUM(...) here
var AE_DATA_COLS   = [3, 4]; // a row is USED if any of these has content
                             // (C = date, D = product). Empty slots have a "-"
                             // placeholder in G/O, so do NOT use those columns.
/* ─────────────────────────────────────────────────────────────────────── */

// Locate the order block: first Status-validation row → up to the totals row
// (first row with a =SUM(...) formula in column G). Returns null if not found.
function aeFindBlock(sh) {
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < AE_SUM_COL) return null;
  var dv  = sh.getRange(1, AE_STATUS_COL, lastRow, 1).getDataValidations();
  var sumF = sh.getRange(1, AE_SUM_COL, lastRow, 1).getFormulas();
  var first = -1;
  for (var r = 0; r < lastRow; r++) { if (dv[r][0] != null) { first = r + 1; break; } }
  if (first < 0) return null;
  var totalsRow = -1;
  for (var t = first; t < lastRow; t++) {
    if (/^=\s*SUM\s*\(/i.test(String(sumF[t][0] || ''))) { totalsRow = t + 1; break; }
  }
  if (totalsRow < 0 || totalsRow <= first) return null;
  return { first: first, totalsRow: totalsRow, last: totalsRow - 1, lastCol: lastCol };
}

function aeParseNum(s) {
  var m = String(s == null ? '' : s).match(/^\s*(.*?)(\d+)\s*$/);
  return m ? { prefix: m[1], n: parseInt(m[2], 10) } : null;
}

// max USED order number + prefix + count of empty slots, within [first..last].
function aeStats(sh, b) {
  var rows = sh.getRange(b.first, 1, b.last - b.first + 1, b.lastCol).getValues();
  var maxFilled = 0, prefix = null, emptySlots = 0;
  for (var i = 0; i < rows.length; i++) {
    var used = AE_DATA_COLS.some(function (c) { return String(rows[i][c - 1]).trim() !== ''; });
    var pn = aeParseNum(rows[i][AE_NUM_COL - 1]);
    if (pn) { if (prefix === null) prefix = pn.prefix; if (used && pn.n > maxFilled) maxFilled = pn.n; }
    if (!used) emptySlots++;
  }
  return { maxFilled: maxFilled, prefix: prefix == null ? '' : prefix, emptySlots: emptySlots };
}

// Insert rows above the last slot (inside the totals range) + renumber slots.
function aeInsert(sh, silent) {
  var b = aeFindBlock(sh);
  if (!b) return { ok: false, msg: 'No order block / totals row found on "' + sh.getName() + '".' };
  var st = aeStats(sh, b);
  var startNum = st.maxFilled + 1;
  var endNum = startNum + (st.emptySlots + AE_ROWS_TO_ADD) - 1;

  if (!silent) {
    var ui = SpreadsheetApp.getUi();
    var resp = ui.alert('Add order rows',
      'Tab: ' + sh.getName() + '\n' +
      'Insert ' + AE_ROWS_TO_ADD + ' rows above the totals row (row ' + b.totalsRow + ').\n' +
      'Empty slots get renumbered ' + st.prefix + startNum + ' … ' + st.prefix + endNum + '.\n' +
      'Nothing below the green totals row is touched. Proceed?',
      ui.ButtonSet.OK_CANCEL);
    if (resp !== ui.Button.OK) return { ok: false, msg: 'Cancelled.' };
  }

  var lastSlot = b.last;                         // last order row, just above totals
  sh.insertRowsBefore(lastSlot, AE_ROWS_TO_ADD); // → inside SUM range, it expands
  var lastCol = sh.getLastColumn();
  var tplRow  = lastSlot + AE_ROWS_TO_ADD;        // original last slot, shifted down
  // Clone the whole template slot row into the new rows. The native copyTo does
  // a true "fill down": format + data-validation + formulas (relative refs auto-
  // adjusted per row) + the slot's placeholder values. No broken formulas.
  sh.getRange(tplRow, 1, 1, lastCol)
    .copyTo(sh.getRange(lastSlot, 1, AE_ROWS_TO_ADD, lastCol));

  // Renumber empty slots STRICTLY above the (shifted) totals row.
  var newTotalsRow = b.totalsRow + AE_ROWS_TO_ADD;
  var blockEnd = newTotalsRow - 1;
  var vals = sh.getRange(b.first, 1, blockEnd - b.first + 1, lastCol).getValues();
  var counter = startNum;
  for (var k = 0; k < vals.length; k++) {
    var used = AE_DATA_COLS.some(function (c) { return String(vals[k][c - 1]).trim() !== ''; });
    if (!used) { sh.getRange(b.first + k, AE_NUM_COL).setValue(st.prefix + counter); counter++; }
  }
  return { ok: true, msg: 'Added ' + AE_ROWS_TO_ADD + ' rows on "' + sh.getName() + '" (' + st.prefix + startNum + '…' + st.prefix + endNum + '). Totals row is now row ' + newTotalsRow + '.' };
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
    aeInsert(sh, true);
  } catch (err) { /* never block the edit */ }
}
