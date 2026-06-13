/**
 * KP Wallpanel — Google Sheets Sync (Apps Script Web App)
 * ------------------------------------------------------------
 * This is the SAFE backend for the static GitHub-Pages app.
 * It is bound to / writes ONLY to the sheet below, and ONLY to
 * the "-app" tabs. The mirror tabs are never touched.
 *
 * Deploy: Extensions → Apps Script → paste this → Deploy →
 *         New deployment → Web app → Execute as: Me →
 *         Who has access: Anyone → copy the /exec URL.
 *
 * The browser posts JSON (as text/plain to avoid a CORS
 * preflight). No Google service-account key is ever needed,
 * so nothing secret ends up in the public repo.
 */

var SHEET_ID = '1VIEisPGwwVcarKJrqgZqSqFaUfyoX92BqO9P743_Y30';

// App → Master sheet (writes new app orders into the master's Thai tabs).
// ⚠️ TESTING: this is the COPY of the master. Change to the real master ID
// only after verifying everything works on the copy.
var MASTER_ID = '1pRbhYoS0yyZKZ4mo4BeZTPsgaUpJuqaIsm3tm5oiMMw';

// Must match SHEETS_TOKEN in index.html. Change both to the same
// random string. This is light protection against random POSTs —
// worst case someone could append junk rows to the -app tabs.
var TOKEN = 'kp-7h3x9q2';

// The ONLY tabs this script will ever write to.
var ALLOWED_TABS = ['BKK-app', 'North-app', 'NE-app', 'East-app', 'South-app'];

// Read-only source tabs (master mirror) for the one-time import.
var MIRROR_TABS = ['BKK-mirror', 'North-mirror', 'NE-mirror', 'East-mirror', 'South-mirror'];

function doGet() {
  return _json({ ok: true, service: 'KP Wallpanel Sheets Sync' });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) return _json({ error: 'unauthorized' });

    // Read action: return raw A–V values of the mirror tabs (one-time import)
    if (body.action === 'readMirror') return _readMirror();

    // App → Master: append new app orders into the master's Thai tabs
    if (body.target === 'master') return _writeMaster(body.items || [], !!body.dryRun);

    var dryRun = !!body.dryRun;
    var items = body.items || [];
    var ss = SpreadsheetApp.openById(SHEET_ID);

    var res = { total: items.length, written: 0, skipped_duplicates: 0, failed: 0, details: [] };
    var existingCache = {}; // tab -> [orderNumbers in col B]

    items.forEach(function (it) {
      try {
        var tab = it.tab;
        if (ALLOWED_TABS.indexOf(tab) === -1) {
          res.failed++;
          res.details.push({ order: it.orderNumber, status: 'failed', reason: 'tab not allowed: ' + tab });
          return;
        }
        var sheet = ss.getSheetByName(tab);
        if (!sheet) {
          res.failed++;
          res.details.push({ order: it.orderNumber, status: 'failed', reason: 'tab not found: ' + tab });
          return;
        }
        if (!existingCache[tab]) existingCache[tab] = _orderNumbers(sheet);

        // Duplicate check on column B
        if (existingCache[tab].indexOf(String(it.orderNumber).trim()) !== -1) {
          res.skipped_duplicates++;
          res.details.push({ order: it.orderNumber, status: 'skipped', reason: 'duplicate', tab: tab });
          return;
        }

        if (dryRun) {
          res.written++;
          res.details.push({ order: it.orderNumber, status: 'would_write', rows: it.rows.length, tab: tab });
          return;
        }

        // Append main row + sub-rows together, directly below existing data
        sheet.getRange(sheet.getLastRow() + 1, 1, it.rows.length, it.rows[0].length).setValues(it.rows);
        existingCache[tab].push(String(it.orderNumber).trim());
        res.written++;
        res.details.push({ order: it.orderNumber, status: 'written', rows: it.rows.length, tab: tab });
      } catch (err) {
        res.failed++;
        res.details.push({ order: it.orderNumber, status: 'failed', reason: String(err) });
      }
    });

    return _json(res);
  } catch (err) {
    return _json({ error: String(err) });
  }
}

/** Read raw A–AD values from every mirror tab (read-only).
 *  Was 22 (A–V); widened to 30 to cover the new split columns
 *  (ชื่อ/เบอร์โทร/ที่อยู่/Maps-Link) and the shifted ขนส่ง / หมายเหตุ. */
function _readMirror() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var out = {};
  MIRROR_TABS.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) { out[name] = []; return; }
    var last = sh.getLastRow();
    if (last < 1) { out[name] = []; return; }
    var cols = Math.min(30, sh.getLastColumn());
    out[name] = sh.getRange(1, 1, last, cols).getValues(); // columns A–AD
  });
  return _json({ ok: true, tabs: out });
}

/** Resolve the master Thai tab for a zone key (keyword match → robust to spacing). */
function _masterTab(ss, zone) {
  var sheets = ss.getSheets();
  function find(re) {
    for (var i = 0; i < sheets.length; i++) {
      if (re.test(sheets[i].getName())) return sheets[i];
    }
    return null;
  }
  if (zone === 'bkk')   return find(/กรุงเทพ|หน้าร้าน/);
  if (zone === 'north') return find(/^1-|เหนือ/);
  if (zone === 'ne')    return find(/^2-|อีสาน/);
  if (zone === 'east')  return find(/^3-|ตะวันออก/);
  if (zone === 'south') return find(/^4-|ใต้/);
  return null;
}

/** App → Master: fill the matching pre-numbered row (or append as fallback).
 *  - Finds the row whose col B == order number (pre-allocated empty row).
 *  - If that row already has a product (col D filled) → skip (duplicate).
 *  - Otherwise fills it, inserting sub-rows for extra products.
 *  - Writes G/K as FORMULAS (matching the sheet) and never touches
 *    A/L/M/N/O (status, payment, COD) so existing formulas stay intact. */
function _writeMaster(items, dryRun) {
  var ss = SpreadsheetApp.openById(MASTER_ID);
  var res = { total: items.length, written: 0, skipped_duplicates: 0, failed: 0, details: [] };

  items.forEach(function (it) {
    try {
      var sheet = _masterTab(ss, it.zone);
      if (!sheet) {
        res.failed++;
        res.details.push({ order: it.orderNumber, status: 'failed', reason: 'master tab not found for zone: ' + it.zone });
        return;
      }
      var last = sheet.getLastRow();
      var on = String(it.orderNumber).trim();
      var bvals = sheet.getRange(1, 2, last, 1).getValues(); // col B (order no)
      var dvals = sheet.getRange(1, 4, last, 1).getValues(); // col D (product code)
      var target = -1;
      for (var r = 0; r < bvals.length; r++) {
        if (String(bvals[r][0]).trim() === on) { target = r + 1; break; }
      }
      // matching row exists AND already has a product → real duplicate
      if (target > 0 && String(dvals[target - 1][0]).trim() !== '') {
        res.skipped_duplicates++;
        res.details.push({ order: on, status: 'skipped', reason: 'already filled', tab: sheet.getName() });
        return;
      }
      if (dryRun) {
        res.written++;
        res.details.push({ order: on, status: 'would_write', mode: (target > 0 ? 'fill row ' + target : 'append'), tab: sheet.getName() });
        return;
      }
      if (target > 0) {
        _fillMasterRow(sheet, target, it.rows);
        res.written++;
        res.details.push({ order: on, status: 'written', mode: 'filled row ' + target, tab: sheet.getName() });
      } else {
        sheet.getRange(last + 1, 1, it.rows.length, it.rows[0].length).setValues(it.rows);
        res.written++;
        res.details.push({ order: on, status: 'written', mode: 'appended', tab: sheet.getName() });
      }
    } catch (err) {
      res.failed++;
      res.details.push({ order: it.orderNumber, status: 'failed', reason: String(err) });
    }
  });
  return _json(res);
}

/** Fill a pre-numbered master row with order data. Inserts sub-rows for extra
 *  products. G/K written as formulas; A/L/M/N/O left untouched. */
function _fillMasterRow(sheet, rowIdx, rows) {
  var extra = rows.length - 1;
  if (extra > 0) sheet.insertRowsAfter(rowIdx, extra);
  // product columns D–G on every row
  for (var k = 0; k < rows.length; k++) {
    var r = rowIdx + k, rd = rows[k];
    if (rd[3] !== '' && rd[3] != null) sheet.getRange(r, 4).setValue(rd[3]); // D code
    if (rd[4] !== '' && rd[4] != null) sheet.getRange(r, 5).setValue(rd[4]); // E qty
    if (rd[5] !== '' && rd[5] != null) sheet.getRange(r, 6).setValue(rd[5]); // F price
    sheet.getRange(r, 7).setFormula('=E' + r + '*F' + r);                    // G amount
  }
  // order-level fields on the main row
  var m = rows[0];
  if (m[2])  sheet.getRange(rowIdx, 3).setValue(m[2]);   // C date
  if (m[7] !== '' && m[7] != null) sheet.getRange(rowIdx, 8).setValue(m[7]); // H clips
  if (m[8])  sheet.getRange(rowIdx, 9).setValue(m[8]);   // I shipping
  if (m[9])  sheet.getRange(rowIdx, 10).setValue(m[9]);  // J discount
  // K total = G(main)+I-J + each sub-row's G  (matches the sheet's style)
  var kf = '=G' + rowIdx + '+I' + rowIdx + '-J' + rowIdx;
  for (var s = 1; s <= extra; s++) kf += '+G' + (rowIdx + s);
  sheet.getRange(rowIdx, 11).setFormula(kf);             // K total
  if (m[18]) sheet.getRange(rowIdx, 19).setValue(m[18]); // S name
  if (m[19]) sheet.getRange(rowIdx, 20).setValue(m[19]); // T phone
  if (m[20]) sheet.getRange(rowIdx, 21).setValue(m[20]); // U address
  if (m[21]) sheet.getRange(rowIdx, 22).setValue(m[21]); // V maps
  if (m[24]) sheet.getRange(rowIdx, 25).setValue(m[24]); // Y shipper
  if (m[25]) sheet.getRange(rowIdx, 26).setValue(m[25]); // Z notes
}

/** Read all order numbers currently in column B of a tab. */
function _orderNumbers(sheet) {
  var last = sheet.getLastRow();
  if (last < 1) return [];
  var vals = sheet.getRange(1, 2, last, 1).getValues(); // col B
  return vals
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (v) { return v !== ''; });
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
