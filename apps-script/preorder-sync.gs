/**
 * PRE-ORDER SYNC  —  app  →  master sheet, tab "Pre Orders"
 * ---------------------------------------------------------------------------
 * The app posts every pre-order change here (create, edit, convert, cancel):
 *
 *   { token:'kp-7h3x9q2', action:'preorder', pre:[ {preId, status, zone,
 *     customer, phone, contact, address, maps, products, notes, createdBy,
 *     createdAt, convertedTo, cancelReason}, … ] }
 *
 * One row per pre-order, keyed by the P-number in column A — sending the same
 * pre-order twice updates its row instead of adding a second one.
 *
 * INSTALL (once):
 *   1. Apps Script editor → add this as a new file.
 *   2. In doPost(), the line has to sit DIRECTLY AFTER the token check and
 *      BEFORE `var order = body.order || {};` — the next line rejects anything
 *      without a tab/orderNo, and a pre-order has neither:
 *
 *        if (body.token !== TOKEN) return _json({ error: 'unauthorized' });
 *        if (body.action === 'preorder') return _json(kpPreUpsert_(body.pre || []));   // ← new
 *        var order = body.order || {};
 *
 *   3. Deploy → Manage deployments → edit the existing Web app → new version →
 *      Deploy. The /exec URL stays the same, so nothing changes in the app.
 *
 * Until that is done the app's calls simply fail (silently, non-blocking) and
 * the KP menu → "Build / Update master" still fills the tab from Firebase.
 */

var KP_PRE_TAB = 'Pre Orders';
var KP_PRE_HEAD = ['Pre-ID', 'Status', 'Zone / โซน', 'Customer / ลูกค้า', 'Phone / เบอร์',
                   'Contact / ช่องทาง', 'Address / ที่อยู่', 'Maps', 'Products / สินค้า',
                   'Notes / โน้ต', 'Created by / โดย', 'Created / สร้างเมื่อ',
                   'Converted to', 'Cancel reason'];

function kpPreSheet_() {
  // The script is bound to the master spreadsheet (like order-sync.gs and
  // master-build.gs) — getActiveSpreadsheet() works without a SHEET_ID constant.
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(KP_PRE_TAB) || ss.insertSheet(KP_PRE_TAB);
  // Header only if the sheet is still empty — never overwrite a formatted header.
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, KP_PRE_HEAD.length).setValues([KP_PRE_HEAD])
      .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setColumnWidth(4, 160); sh.setColumnWidth(7, 220); sh.setColumnWidth(9, 220);
  }
  return sh;
}

function kpPreRow_(p) {
  return [
    p.preId || '', p.status || '', p.zone || '', p.customer || '', p.phone || '',
    p.contact || '', p.address || '', p.maps || '', p.products || '',
    p.notes || '', p.createdBy || '',
    p.createdAt ? new Date(p.createdAt) : '',
    p.convertedTo || '', p.cancelReason || ''
  ];
}

/**
 * Upsert by Pre-ID (column A). Returns what happened per row so the app's
 * console shows something useful when a sync goes wrong.
 */
function kpPreUpsert_(list) {
  if (!list || !list.length) return { ok: true, written: 0 };
  var sh = kpPreSheet_();
  var last = sh.getLastRow();
  var ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
  var pos = {};                                   // Pre-ID -> row number
  for (var i = 0; i < ids.length; i++) {
    var key = String(ids[i][0] || '').trim();
    if (key) pos[key] = i + 2;
  }

  var added = 0, updated = 0, appendRows = [];
  list.forEach(function (p) {
    var id = String(p.preId || '').trim();
    if (!id) return;
    var row = kpPreRow_(p);
    if (pos[id]) {
      sh.getRange(pos[id], 1, 1, KP_PRE_HEAD.length).setValues([row]);
      updated++;
    } else {
      appendRows.push(row);
      added++;
    }
  });
  if (appendRows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, appendRows.length, KP_PRE_HEAD.length).setValues(appendRows);
  }

  // Sort by the number in P-<n>, so P-2 never sits under P-10.
  var n = sh.getLastRow();
  if (n > 2) {
    var body = sh.getRange(2, 1, n - 1, KP_PRE_HEAD.length).getValues();
    body.sort(function (a, b) {
      return (parseInt(String(a[0]).replace(/[^0-9]/g, ''), 10) || 0)
           - (parseInt(String(b[0]).replace(/[^0-9]/g, ''), 10) || 0);
    });
    sh.getRange(2, 1, body.length, KP_PRE_HEAD.length).setValues(body);
  }
  sh.getRange('L2:L').setNumberFormat('yyyy-mm-dd hh:mm');
  kpPreColors_(sh);
  return { ok: true, added: added, updated: updated };
}

/** Same three colours as the app's cards: waiting = yellow, converted = green,
 *  cancelled = red. Rules, not fills, so a later re-sort keeps them right. */
function kpPreColors_(sh) {
  var range = sh.getRange('A2:N2000');
  var mk = function (formula, bg) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(formula).setBackground(bg).setRanges([range]).build();
  };
  sh.setConditionalFormatRules([
    mk('=$B2="converted"', '#e8f5e9'),
    mk('=$B2="cancelled"', '#fde7e9'),
    mk('=$B2="open"',      '#fff8e1')
  ]);
}
