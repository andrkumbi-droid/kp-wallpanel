/**
 * KP Wallpanel — Master Sheet auto-splitter (onEdit) — SELF-CONTAINED
 * ───────────────────────────────────────────────────────────────────
 * When someone pastes the whole customer blob into the combined
 * "ชื่อ-ที่อยู่ลูกค้า" column, this splits it automatically into the
 * Name / Phone / Maps / Address columns for that row.
 *
 * Columns are found by FLEXIBLE header match (works with headers like
 * "ชื่อ (Name)", "เบอร์โทร (Telefon)", "ที่อยู่ (Adresse)", "Maps-Link").
 *
 * INSTALL (bound to the MASTER spreadsheet):
 *   1. Open the MASTER Google Sheet → Extensions → Apps Script
 *   2. Paste THIS file (it needs no other file). Save.
 *   3. The simple onEdit trigger runs automatically — no setup needed.
 *
 * SAFETY: only writes the 4 target columns, only when they're EMPTY,
 * never touches the combined cell. Uncertain values are left blank.
 */

var SRC_RE  = /ชื่อ.*ที่อยู่/;                 // combined "ชื่อ-ที่อยู่ลูกค้า"
var TARGETS = [
  { key: 'name',    re: /name|^\s*ชื่อ/i },     // "ชื่อ (Name)"
  { key: 'phone',   re: /telefon|phone|เบอร์/i },// "เบอร์โทร (Telefon)"
  { key: 'maps',    re: /maps|แผนที่|map|ลิงก์/i },// "Maps-Link" / "แผนที่"
  { key: 'address', re: /adresse|address|ที่อยู่/i }// "ที่อยู่ (Adresse)"
];
var HEADER_SCAN = 6;

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    var lastCol = sh.getLastColumn();
    if (lastCol < 1) return;

    // Find header row + the combined source column.
    var headerRow = -1, srcCol = -1, headerVals = null;
    for (var r = 1; r <= Math.min(HEADER_SCAN, sh.getLastRow()); r++) {
      var vals = sh.getRange(r, 1, 1, lastCol).getValues()[0];
      for (var c = 0; c < vals.length; c++) {
        if (SRC_RE.test(String(vals[c]).trim())) { headerRow = r; srcCol = c + 1; headerVals = vals; break; }
      }
      if (srcCol > 0) break;
    }
    if (srcCol < 0) return;

    // Map the 4 target columns (skip the combined column itself).
    var colMap = {};
    for (var k = 0; k < headerVals.length; k++) {
      if (k + 1 === srcCol) continue;
      var h = String(headerVals[k]).trim(); if (!h) continue;
      for (var t = 0; t < TARGETS.length; t++) {
        if (!colMap[TARGETS[t].key] && TARGETS[t].re.test(h)) { colMap[TARGETS[t].key] = k + 1; break; }
      }
    }

    // Only react to edits in the combined source column, below the header.
    if (e.range.getColumn() !== srcCol) return;
    var row = e.range.getRow();
    if (row <= headerRow) return;

    var cell = String(sh.getRange(row, srcCol).getValue() || '').trim();
    if (!cell) return;

    var ex = splitCustomer(cell);
    function put(key, val) {
      var col = colMap[key]; if (!col || !val) return;
      var tcell = sh.getRange(row, col);
      if (!String(tcell.getValue()).trim()) tcell.setValue(val); // only if empty
    }
    put('maps', ex.maps);
    put('phone', ex.phone);
    put('name', ex.name);
    put('address', ex.address);
  } catch (err) { /* never block the edit */ }
}

// Parse a combined customer blob into {name, phone, maps, address}.
function splitCustomer(text) {
  var out = { name: '', phone: '', maps: '', address: '' };
  var work = String(text || '');

  // Maps / any URL
  var mm = work.match(/https?:\/\/\S+/i);
  if (mm) { out.maps = mm[0].replace(/[)\].,]+$/, ''); work = work.replace(mm[0], ' '); }

  // Phone — first Thai-style number (0xxxxxxxxx, allows spaces/dashes)
  var pm = work.match(/0\d[\d\s\-]{7,}\d/);
  if (pm) { out.phone = pm[0].replace(/[^\d]/g, ''); work = work.replace(pm[0], ' '); }
  work = work.replace(/โทร\.?|tel\.?:?|เบอร์โทร?|phone:?/ig, ' ');

  // Name + address from remaining lines
  var lines = work.split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  if (lines.length) {
    var first = lines[0];
    var looksAddr = /บ้านเลขที่|เลขที่|ถนน|ซอย|ต\.|อ\.|จ\.|ม\.\d|หมู่|แขวง|เขต|อำเภอ|จังหวัด|\d{5}|\d{3,}/.test(first);
    if (lines.length > 1 && first.length < 40 && !looksAddr) { out.name = first; out.address = lines.slice(1).join('\n'); }
    else { out.address = lines.join('\n'); }
  }
  out.address = out.address.replace(/[ \t]{2,}/g, ' ').trim();
  return out;
}
