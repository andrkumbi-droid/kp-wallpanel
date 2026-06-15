/**
 * KP Wallpanel — Master Sheet auto-splitter (onEdit)
 * ───────────────────────────────────────────────────
 * When someone pastes the whole customer blob into the combined
 * "ชื่อ-ที่อยู่ลูกค้า" column, this splits it automatically into the
 * 4 columns (ชื่อลูกค้า · เบอร์โทร · แผนที่ · ที่อยู่) for that row.
 *
 * INSTALL (bound to the MASTER spreadsheet):
 *   1. Open the MASTER Google Sheet
 *   2. Extensions → Apps Script
 *   3. Paste BOTH this file AND extract-columns.gs (extractParts is shared)
 *   4. Save. The simple onEdit trigger runs automatically — no setup needed.
 *
 * SAFETY:
 *   - Only writes to the 4 target columns, never the combined cell.
 *   - Only fills a target cell if it's still EMPTY (won't overwrite manual edits).
 *   - If a value is uncertain it's left blank; the app still falls back to the
 *     combined column, so nothing is lost.
 */

// Header that identifies the combined customer column.
var SRC_HEADER_RE = /ชื่อ.*ที่อยู่|ชื่อ-ที่อยู่/;
// Target column headers (must match extract-columns.gs).
var SPLIT_COLS = ['ชื่อลูกค้า', 'เบอร์โทร', 'แผนที่', 'ที่อยู่'];
var HEADER_SCAN = 6; // how many top rows to scan for the header

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    var lastCol = sh.getLastColumn();
    if (lastCol < 1) return;

    // Locate header row, source column, and the 4 target columns.
    var headerRow = -1, srcCol = -1, colMap = {};
    for (var r = 1; r <= Math.min(HEADER_SCAN, sh.getLastRow()); r++) {
      var vals = sh.getRange(r, 1, 1, lastCol).getValues()[0];
      var found = false;
      for (var c = 0; c < vals.length; c++) {
        if (SRC_HEADER_RE.test(String(vals[c]).trim())) { headerRow = r; srcCol = c + 1; found = true; }
      }
      if (found) {
        for (var c2 = 0; c2 < vals.length; c2++) {
          var h = String(vals[c2]).trim();
          if (SPLIT_COLS.indexOf(h) >= 0) colMap[h] = c2 + 1;
        }
        break;
      }
    }
    if (srcCol < 0) return;

    // Only react to edits in the combined source column, below the header.
    if (e.range.getColumn() !== srcCol) return;
    var row = e.range.getRow();
    if (row <= headerRow) return;

    var cell = String(sh.getRange(row, srcCol).getValue() || '').trim();
    if (!cell) return;

    var ex = extractParts(cell); // shared with extract-columns.gs

    function put(header, val) {
      var col = colMap[header];
      if (!col || !val) return;
      var t = sh.getRange(row, col);
      if (!String(t.getValue()).trim()) t.setValue(val); // only fill if empty
    }
    put('แผนที่', ex.maps);
    put('เบอร์โทร', ex.phone);
    put('ชื่อลูกค้า', ex.name);
    put('ที่อยู่', ex.address);
  } catch (err) {
    // never block the user's edit
  }
}
