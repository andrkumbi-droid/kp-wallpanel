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

// AI fallback (optional): LINE-bot /exec URL + token. Leave URL '' to disable.
var BOT_PARSE_URL = '';
var BOT_PARSE_TOKEN = 'kp-parse-9q2x'; // must match PARSE_TOKEN in line-bot.gs

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

    // Keep a buffer of pre-formatted blank rows below the data (see auto-extend.gs).
    try { autoExtendIfNeeded(sh); } catch (eAE) {}

    // Only react to edits in the combined source column, below the header.
    if (e.range.getColumn() !== srcCol) return;
    var row = e.range.getRow();
    if (row <= headerRow) return;

    var cell = String(sh.getRange(row, srcCol).getValue() || '').trim();
    if (!cell) return;

    var ex = splitCustomer(cell);
    // AI fallback: only when the heuristic found no name (name can be anywhere).
    if (!ex.name && BOT_PARSE_URL) {
      try {
        var res = UrlFetchApp.fetch(BOT_PARSE_URL, {
          method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          payload: JSON.stringify({ action: 'parseCustomer', token: BOT_PARSE_TOKEN, text: cell })
        });
        var ai = JSON.parse(res.getContentText() || '{}');
        if (ai && !ai.error) {
          if (ai.name) ex.name = ai.name;
          if (ai.phone && !ex.phone) ex.phone = ai.phone;
          if (ai.maps && !ex.maps) ex.maps = ai.maps;
          if (ai.address) ex.address = ai.address;
        }
      } catch (e2) { /* keep heuristic result */ }
    }
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

// ── Manual batch splitter (menu) ────────────────────────────────────
// onEdit only fires on MANUAL edits — rows added via the app sync / LINE
// bot / Sheets API never trigger it, so they stay unsplit. This menu lets
// you split every still-unsplit row on demand (uses the tolerant parser,
// so dash-format phone numbers like 092-109-0111 split fine too).
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('KP Tools')
      .addItem('Split all customer rows / แยกข้อมูลทั้งหมด', 'splitAllRows')
      .addItem('Add formatted rows now / เติมแถวรูปแบบ', 'autoExtendAllNow')
      .addToUi();
  } catch (e) {}
}

function splitAllRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var filled = 0, sheetsDone = 0;
  ss.getSheets().forEach(function (sh) {
    var lastCol = sh.getLastColumn(), lastRow = sh.getLastRow();
    if (lastCol < 1 || lastRow < 1) return;
    // find header row + combined source column
    var headerRow = -1, srcCol = -1, headerVals = null;
    for (var r = 1; r <= Math.min(HEADER_SCAN, lastRow); r++) {
      var vals = sh.getRange(r, 1, 1, lastCol).getValues()[0];
      for (var c = 0; c < vals.length; c++) {
        if (SRC_RE.test(String(vals[c]).trim())) { headerRow = r; srcCol = c + 1; headerVals = vals; break; }
      }
      if (srcCol > 0) break;
    }
    if (srcCol < 0) return;
    // map the 4 target columns
    var colMap = {};
    for (var k = 0; k < headerVals.length; k++) {
      if (k + 1 === srcCol) continue;
      var h = String(headerVals[k]).trim(); if (!h) continue;
      for (var t = 0; t < TARGETS.length; t++) {
        if (!colMap[TARGETS[t].key] && TARGETS[t].re.test(h)) { colMap[TARGETS[t].key] = k + 1; break; }
      }
    }
    if (!colMap.name && !colMap.phone && !colMap.address) return;
    var srcVals = sh.getRange(headerRow + 1, srcCol, lastRow - headerRow, 1).getValues();
    for (var i = 0; i < srcVals.length; i++) {
      var row = headerRow + 1 + i;
      var cell = String(srcVals[i][0] || '').trim();
      if (!cell) continue;
      var ex = kpParseCustomer(cell);
      // only fill cells that are currently empty (never overwrite)
      ['maps', 'phone', 'name', 'address'].forEach(function (key) {
        var col = colMap[key], val = ex[key];
        if (!col || !val) return;
        var tc = sh.getRange(row, col);
        if (!String(tc.getValue()).trim()) { tc.setValue(val); filled++; }
      });
    }
    sheetsDone++;
  });
  SpreadsheetApp.getUi().alert('Done / เสร็จแล้ว\n\nFilled ' + filled + ' empty cell(s) across ' + sheetsDone + ' sheet(s).');
}

// Parse a combined customer blob into {name, phone, maps, address}.
function splitCustomer(text) {
  return kpParseCustomer(text);
}
// Shared parser (also used by the app's quick-paste).
function kpParseCustomer(text) {
  var out = { name: '', phone: '', maps: '', address: '' };
  var work = String(text || '');
  var ADDR_RE = /บ้านเลขที่|เลขที่|ถนน|ซอย|ต\.|อ\.|จ\.|ม\.\d|หมู่|แขวง|เขต|อำเภอ|จังหวัด|ตำบล|\d{5}|\d{3,}/;

  // Maps / any URL
  var mm = work.match(/https?:\/\/\S+/i);
  if (mm) { out.maps = mm[0].replace(/[)\].,]+$/, ''); work = work.replace(mm[0], ' '); }

  // Phone — first Thai-style number; also grab the short text right AFTER it
  // on the same line as a name candidate (Thai blobs often put the nickname last).
  var nameGuess = '';
  var pm = work.match(/0\d[\d\s\-]{7,}\d/);
  if (pm) {
    out.phone = pm[0].replace(/[^\d]/g, '');
    var after = work.slice(work.indexOf(pm[0]) + pm[0].length).split('\n')[0].trim();
    if (after && after.length <= 30 && !ADDR_RE.test(after)) nameGuess = after;
    work = work.replace(pm[0], ' ');
  }
  work = work.replace(/โทร\.?|tel\.?:?|เบอร์โทรศัพท์?|เบอร์โทร?|phone:?/ig, ' ');

  // Name + address from remaining lines
  var lines = work.split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  var name = '', address = '';
  if (lines.length) {
    var first = lines[0];
    if (lines.length > 1 && first.length < 40 && !ADDR_RE.test(first)) { name = first; address = lines.slice(1).join('\n'); }
    else { address = lines.join('\n'); }
  }
  if (!name && nameGuess) name = nameGuess;
  if (name) address = address.split(name).join(' '); // remove the name token from the address
  out.name = name.trim();
  out.address = address.replace(/[ \t]{2,}/g, ' ').replace(/^[\s,;]+|[\s,;]+$/g, '').trim();
  return out;
}
