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
