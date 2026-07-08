/**
 * KP Wallpanel — Real bank slip verification proxy (SlipOK API).
 *
 * WHY a proxy: the SlipOK API key must NOT sit in the public client (index.html
 * is on GitHub Pages), and the browser can't call api.slipok.com directly (CORS).
 * This Apps Script Web App holds the key and forwards the decoded QR to SlipOK.
 *
 * SETUP:
 *  1. Sign up at https://slipok.com, create a branch, get API key + Branch ID.
 *     (OK Basic = free, 100 checks/month.)
 *  2. Paste this file into an Apps Script project.
 *  3. Project Settings → Script properties:
 *        SLIPOK_API_KEY   = <your api key>
 *        SLIPOK_BRANCH_ID = <your branch id>
 *  4. Deploy → New deployment → Web app → Execute as ME, Access: Anyone.
 *  5. Paste the /exec URL into index.html var  KP_SLIPOK_URL.
 *
 * Request  (POST JSON): { "data": "<decoded QR payload>", "amount": <number> }
 * Response (JSON): normalized verdict, e.g.
 *   { "success": true,  "amount": 5420, "transRef": "0152...", "receiver": "..." }
 *   { "success": false, "code": 1012, "message": "..." }   // 1012 dup, 1013 amount, 1014 receiver
 */

function doPost(e) { return _slipHandle(e); }
function doGet(e)  { return _slipHandle(e); } // manual browser test: ?data=...&amount=...

function _slipHandle(e) {
  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      try { payload = JSON.parse(e.postData.contents); } catch (err) { payload = {}; }
    }
    if (e && e.parameter) {
      if (payload.data == null && e.parameter.data) payload.data = e.parameter.data;
      if (payload.amount == null && e.parameter.amount) payload.amount = e.parameter.amount;
    }
    var qr = (payload.data || '').toString();
    var amount = parseFloat(payload.amount) || 0;
    if (!qr) return _json({ success: false, message: 'no qr data' });

    var props = PropertiesService.getScriptProperties();
    var key = props.getProperty('SLIPOK_API_KEY');
    var branch = props.getProperty('SLIPOK_BRANCH_ID');
    if (!key || !branch) return _json({ success: false, message: 'SLIPOK_API_KEY / SLIPOK_BRANCH_ID not set' });

    var body = { data: qr, log: true };
    if (amount > 0) body.amount = amount;

    var res = UrlFetchApp.fetch('https://api.slipok.com/api/line/apikey/' + branch, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: { 'x-authorization': key },
      payload: JSON.stringify(body)
    });

    var j = {};
    try { j = JSON.parse(res.getContentText() || '{}'); } catch (err) { j = {}; }

    if (j && j.success && j.data) {
      var d = j.data;
      var recv = d.receiver && (d.receiver.displayName || d.receiver.name || (d.receiver.account && d.receiver.account.name)) || '';
      return _json({
        success: true,
        amount: parseFloat(d.amount) || 0,
        transRef: d.transRef || '',
        receiver: recv,
        bank: d.sendingBank || d.receivingBank || '',
        raw: d
      });
    }
    // Failure — pass through SlipOK's code/message (1012 dup, 1013 amount, 1014 receiver, ...)
    return _json({ success: false, code: (j && j.code) || 0, message: (j && (j.message || (j.data && j.data.message))) || ('http ' + res.getResponseCode()) });
  } catch (err) {
    return _json({ success: false, message: String(err) });
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
