/**
 * KP Wallpanel Order — App → Sheet receiver (NEW master sheet)
 * ------------------------------------------------------------------
 * Lives in the "KP Wallpanel Order" spreadsheet (same Apps Script
 * project as master-build.gs). Paste as a new file, then:
 *   Deploy → New deployment → Web app → Execute as: Me →
 *   Who has access: Anyone → copy the /exec URL →
 *   paste it into index.html  var SHEETS_WEBAPP_URL = '...'
 *
 * One row per order, upserted by Order No (col A) into the order's
 * zone tab. Writes A–Q and S–AL; column R (Outstanding) is left to
 * its ARRAYFORMULA. Status/Paid values must match master-build.gs.
 */

var TOKEN = 'kp-7h3x9q2'; // must equal SHEETS_TOKEN in index.html

// Column order (index = column − 1). 38 columns A–AL.
var KP_COLS = ['orderNo','date','status','paid','prio','panelsA','panelsB','lcorner',
  'utrim','ttrim','extraClips','freeClips','products','shipping','discount','total',
  'paidAmount','outstanding','payMethod','paidOn','paymentBy','deliveredOn','time','deliveredBy',
  'carrier','tracking','ctnBundle','customer','phone','contact','address','maps',
  'deliveryRound','takenBy','editedBy','receiptNo','cancelReason','notes'];

function doGet() { return _json({ ok: true, service: 'KP Wallpanel Order sync' }); }

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) return _json({ error: 'unauthorized' });
    var order = body.order || {};
    if (!order.tab || !order.orderNo) return _json({ error: 'missing tab/orderNo' });
    if (body.action === 'delete') return _json(kpDelete(order));
    return _json(kpUpsert(order));
  } catch (err) {
    return _json({ error: String(err) });
  }
}

function kpUpsert(order) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(order.tab);
  if (!sh) return { error: 'tab not found: ' + order.tab };
  var row = kpFindRow(sh, order.orderNo, sh.getLastRow());
  var target = row > 0 ? row : kpLastDataRow(sh) + 1;

  var vals = [];
  for (var c = 1; c <= 38; c++) vals.push(kpCell(order, KP_COLS[c - 1]));
  sh.getRange(target, 1, 1, 38).setValues([vals]);
  kpSyncLines(ss, order);
  return { ok: true, action: row > 0 ? 'updated' : 'appended', row: target, tab: order.tab, orderNo: order.orderNo };
}

// ── Line Items (one row per product line, for the Products report) ──
var LINES_SHEET = 'Line Items';

function kpClearLines(ss, orderNo) {
  var sh = ss.getSheetByName(LINES_SHEET); if (!sh) return;
  var last = sh.getLastRow(); if (last < 2) return;
  var d = sh.getRange(2, 4, last - 1, 1).getValues(); // col D = Order No
  var on = String(orderNo).trim();
  for (var i = d.length - 1; i >= 0; i--) {            // bottom-up so indices stay valid
    if (String(d[i][0]).trim() === on) sh.deleteRow(i + 2);
  }
}

function kpSyncLines(ss, order) {
  var sh = ss.getSheetByName(LINES_SHEET); if (!sh) return;
  kpClearLines(ss, order.orderNo);
  var lines = order.lines || [];
  if (!lines.length) return;
  var month = String(order.date || '').slice(0, 7);
  var dateVal = kpCell(order, 'date');
  var rows = lines.map(function (l) {
    return [month, dateVal, order.tab, order.orderNo, String(l.code || ''),
            l.grade || '', parseInt(l.qty) || 0, Number(l.amount) || 0];
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
}

// Last row that actually has an order (column A non-empty). Robust against
// formula columns that would inflate getLastRow().
function kpLastDataRow(sh) {
  var last = sh.getLastRow();
  if (last < 2) return 1;
  var a = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = a.length - 1; i >= 0; i--) {
    if (String(a[i][0]).trim() !== '') return i + 2;
  }
  return 1;
}

function kpDelete(order) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(order.tab);
  if (!sh) return { error: 'tab not found: ' + order.tab };
  var row = kpFindRow(sh, order.orderNo, sh.getLastRow());
  kpClearLines(ss, order.orderNo);
  if (row < 0) return { ok: true, note: 'not found', orderNo: order.orderNo };
  sh.deleteRow(row);
  return { ok: true, action: 'deleted', row: row, orderNo: order.orderNo };
}

function kpFindRow(sh, orderNo, last) {
  if (last < 2) return -1;
  var col = sh.getRange(2, 1, last - 1, 1).getValues(); // col A from row 2
  var on = String(orderNo).trim();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]).trim() === on) return i + 2;
  }
  return -1;
}

function kpCell(order, key) {
  if (!key) return '';
  var v = order[key];
  if (key === 'date' || key === 'paidOn' || key === 'deliveredOn') {
    var s = String(v || '');
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s.slice(0, 10) + 'T00:00:00');
    return v || '';
  }
  return (v == null) ? '' : v;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
