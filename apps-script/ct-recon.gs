/**
 * KP Wallpanel — CT settlement reader (Claude vision) + chat translator.
 *
 * WHAT IT DOES
 *   The shipper "CT" sends us a screenshot of their settlement sheet (one row per
 *   delivery: their bill no, our order no, what we owe them, the COD they collected,
 *   their 2 % cut, the payout) plus a bank-transfer slip for the payout total.
 *   This Web App takes both pictures and returns them as clean JSON so the app can
 *   compare every line against our own orders.
 *
 *   It ALSO still answers the old chat-translate request, so this file can simply
 *   replace `translate.gs` in the SAME Apps Script project — then the existing
 *   /exec URL keeps working for the chat and serves the CT reader too.
 *
 * SETUP
 *   1. Apps Script project (any project that may hold the key) → paste this file.
 *      • Replacing translate.gs?  Delete translate.gs first — two files cannot both
 *        define doPost().  Chat translation keeps working, same URL, nothing else to do.
 *      • New project?  Deploy separately (step 3) and paste the new URL into
 *        index.html → var KP_CT_OCR_URL.
 *   2. Project Settings → Script properties:  ANTHROPIC_API_KEY = sk-ant-...
 *      (NEVER commit the key to the repo.)
 *   3. Deploy → New deployment → Web app → Execute as ME, Access: "Anyone".
 *
 * REQUEST  (POST, text/plain JSON body)
 *   { "action":"ctocr", "sheet":"<data-url or bare base64 JPEG>", "slip":"<optional>" }
 *   { "text":"...", "target":"th"|"my"|"en" }                      ← chat translate
 *
 * RESPONSE
 *   { "rows":[ {...} ], "totals":{...}, "slip":{...} }   or   { "error":"..." }
 */

var KP_TR_MODEL  = 'claude-haiku-4-5-20251001'; // chat lines: fast + cheap
var KP_OCR_MODEL = 'claude-opus-5';             // settlement sheet: accuracy matters
// Thinking depth for the OCR call. 'low' keeps the round trip inside Apps Script's
// UrlFetchApp timeout; raise to 'medium' if a sheet is ever read sloppily.
var KP_OCR_EFFORT = 'low';

function doPost(e) { return _kpHandle(e); }
function doGet(e)  { return _kpHandle(e); }   // ?text=..&target=.. for a quick browser test

function _kpHandle(e) {
  try {
    var p = {};
    if (e && e.postData && e.postData.contents) {
      try { p = JSON.parse(e.postData.contents); } catch (err) { p = {}; }
    }
    if (e && e.parameter) {
      if (p.action == null && e.parameter.action) p.action = e.parameter.action;
      if (p.text   == null && e.parameter.text)   p.text   = e.parameter.text;
      if (p.target == null && e.parameter.target) p.target = e.parameter.target;
    }
    if (p.action === 'ctocr') return _json(_ctOcr(p));
    if (p.action === 'ping')  return _json({ ok: true, ctocr: true });
    return _json(_translate(p));
  } catch (err) {
    return _json({ error: String(err) });
  }
}

// ── CT SETTLEMENT SHEET + SLIP ─────────────────────────────────────────────
function _ctOcr(p) {
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) return { error: 'ANTHROPIC_API_KEY not set' };

  var sheetImg = _imgBlock(p.sheet);
  if (!sheetImg) return { error: 'no sheet image' };
  var slipImg = _imgBlock(p.slip);

  var content = [sheetImg];
  if (slipImg) content.push(slipImg);
  content.push({ type: 'text', text: slipImg ? CT_ASK_BOTH : CT_ASK_SHEET });

  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: KP_OCR_MODEL,
      max_tokens: 8000,
      system: CT_SYSTEM,
      output_config: { effort: KP_OCR_EFFORT, format: { type: 'json_schema', schema: CT_SCHEMA } },
      messages: [{ role: 'user', content: content }]
    })
  });

  var code = res.getResponseCode();
  var body = {};
  try { body = JSON.parse(res.getContentText() || '{}'); } catch (err) { body = {}; }
  if (code !== 200) return { error: 'api ' + code + ': ' + ((body.error && body.error.message) || '') };
  if (body.stop_reason === 'refusal') return { error: 'refused' };

  // Thinking blocks come first — join every TEXT block, never read content[0] blindly.
  var out = _joinText(body);
  if (!out) return { error: 'empty answer' };
  var parsed;
  try { parsed = JSON.parse(out); } catch (err) { return { error: 'bad json from model' }; }
  parsed.rows = parsed.rows || [];
  return parsed;
}

function _joinText(body) {
  var blocks = (body && body.content) || [];
  var parts = [];
  for (var i = 0; i < blocks.length; i++) {
    if (blocks[i] && blocks[i].type === 'text' && blocks[i].text) parts.push(blocks[i].text);
  }
  return parts.join('').trim();
}

// Accepts a data-URL ("data:image/jpeg;base64,...") or bare base64.
function _imgBlock(s) {
  s = (s || '').toString();
  if (!s) return null;
  var media = 'image/jpeg', data = s;
  var m = s.match(/^data:([^;]+);base64,(.*)$/);
  if (m) { media = m[1]; data = m[2]; }
  if (data.length < 100) return null;
  return { type: 'image', source: { type: 'base64', media_type: media, data: data } };
}

var CT_SYSTEM =
  'You transcribe Thai logistics paperwork into JSON. You are precise with digits and never invent a row. ' +
  'Read only what is printed; if a cell is empty or unreadable use "" for text and 0 for numbers.';

var CT_COLS =
  'The picture is a settlement sheet from the Thai carrier "CT". Columns, left to right:\n' +
  '1 เลขที่บิล   = CT\'s own bill number (e.g. CT690710776) -> ctBill\n' +
  '2 วันที่ออกบิล = bill date, printed d/M/yyyy in the Gregorian year -> billDate (ISO yyyy-mm-dd)\n' +
  '3 ผู้รับสินค้า = OUR order number followed by the customer name, e.g. "#110 คุณดวงใจ นิยาย".\n' +
  '     Split it: the leading token (#110, #3-047, 4-049 ...) -> orderId (keep the digits and any dash,\n' +
  '     drop the "#"), the rest -> customer.\n' +
  '4 ผู้ส่งสินค้า = the sender (our staff) -> sender\n' +
  '5 จ.น.ชิ้นรวม = number of cartons -> qty\n' +
  '6 จำนวนเงิน   = the freight WE pay CT for this delivery -> shipAmount\n' +
  '7 จังหวัด      = province -> province\n' +
  '8 COD         = the amount the customer pays, collected by CT for us -> cod\n' +
  '9 2%          = CT\'s commission rate in percent -> feePct\n' +
  '10 หักเปอร์เซ็น = the commission in baht -> fee\n' +
  '11 คงเหลือ     = COD minus commission = what CT pays out to us -> net\n\n' +
  'The LAST line is a bold totals line, not a delivery: put it in "totals", never in "rows".\n' +
  'Numbers are printed with a comma as thousands separator and a dot as decimal point ' +
  '("13,673.00" = 13673.00). Return plain numbers without separators.';

var CT_SLIP =
  '\n\nThe second picture is a Thai bank transfer slip (the payout for this sheet). Read:\n' +
  'จำนวน (amount, baht) -> slip.amount ; ค่าธรรมเนียม (fee) -> slip.fee ;\n' +
  'เลขที่รายการ (transaction reference) -> slip.ref ; the date+time at the top -> slip.date.\n' +
  'Slip dates use the Buddhist era in short form ("5 ส.ค. 69" = 5 August 2569 BE = 2026-08-05):\n' +
  'subtract 543 from the Buddhist year and output ISO yyyy-mm-dd.\n' +
  'slip.from = the account the money came from, slip.to = the receiver.';

var CT_ASK_SHEET = CT_COLS + '\n\nThere is no slip picture: return slip with amount 0 and empty strings.';
var CT_ASK_BOTH  = CT_COLS + CT_SLIP;

var _num = { type: 'number' };
var _str = { type: 'string' };
var CT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rows', 'totals', 'slip'],
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ctBill', 'billDate', 'orderId', 'customer', 'sender', 'qty',
                   'shipAmount', 'province', 'cod', 'feePct', 'fee', 'net'],
        properties: {
          ctBill: _str, billDate: _str, orderId: _str, customer: _str, sender: _str,
          qty: _num, shipAmount: _num, province: _str,
          cod: _num, feePct: _num, fee: _num, net: _num
        }
      }
    },
    totals: {
      type: 'object',
      additionalProperties: false,
      required: ['qty', 'shipAmount', 'cod', 'fee', 'net'],
      properties: { qty: _num, shipAmount: _num, cod: _num, fee: _num, net: _num }
    },
    slip: {
      type: 'object',
      additionalProperties: false,
      required: ['amount', 'fee', 'date', 'ref', 'from', 'to'],
      properties: { amount: _num, fee: _num, date: _str, ref: _str, from: _str, to: _str }
    }
  }
};

// ── CHAT TRANSLATE (unchanged behaviour of the old translate.gs) ───────────
function _translate(p) {
  var text = (p.text || '').toString().trim();
  var target = (p.target || 'th').toString().toLowerCase();
  if (!text) return { error: 'no text' };
  if (text.length > 2000) text = text.slice(0, 2000);

  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) return { error: 'ANTHROPIC_API_KEY not set' };

  var langName = target === 'my' ? 'Burmese (Myanmar)' : target === 'en' ? 'English' : 'Thai';
  var sys = 'You are a translation engine for a warehouse/logistics team chat. '
    + 'Translate the user message into ' + langName + '. '
    + 'Keep it natural and casual, preserve numbers, order codes (e.g. 2-028, #027, KP065), '
    + 'product codes and emoji unchanged. Output ONLY the translation, no quotes, no notes, '
    + 'no romanization. If the text is already in ' + langName + ', return it unchanged.';

  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: KP_TR_MODEL, max_tokens: 1024, system: sys,
      messages: [{ role: 'user', content: text }]
    })
  });

  var code = res.getResponseCode();
  var body = JSON.parse(res.getContentText() || '{}');
  if (code !== 200) return { error: 'api ' + code + ': ' + ((body.error && body.error.message) || '') };
  return { text: _joinText(body) };
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
