/**
 * fb-send.gs — "send all products" for the Facebook/Instagram inbox.
 *
 * THE PROBLEM THIS SOLVES
 * Ads bring a flood of Messenger chats. The ZWIZ bot greets them, but the
 * moment a human answers anything, the bot goes quiet for that thread. When
 * the customer then asks what is in stock, an admin has to send 30+ photos by
 * hand out of a folder — and Business Suite only takes 10 at a time. Four
 * rounds of copy/paste per customer, with duplicates, forgotten panels and
 * sold-out products going out because nobody cleaned the folder.
 *
 * HOW IT WORKS
 * The admin types a code word into the chat and sends it. Meta echoes every
 * outgoing page message back to us (message_echoes), we recognise the code
 * word, and send every panel that is IN STOCK RIGHT NOW as plain photos —
 * the same thing the customer would have got by hand, just complete and
 * correct. Works on every PC and on the phone, because typing works
 * everywhere and nothing has to be installed on the device.
 *
 * Deliberately plain photos: no carousels, no buttons, no links. The
 * customers are largely older and distrust links.
 *
 * WHAT IS IN STOCK comes straight from the app: pub/webCatalog (all panels)
 * minus pub/soldOut (what the office flagged). Both are public read paths at
 * the DB root and season-independent, the same pair the website reads.
 *
 * SETUP (Script Properties — never put these in this file):
 *   FB_PAGE_TOKEN   page access token (use a system user token, it does not expire)
 *   FB_VERIFY_TOKEN any string you also type into Meta's webhook setup
 *   FB_TRIGGER      code word, optional (default below)
 */

var FB_API      = 'https://graph.facebook.com/v21.0';
var FB_DB       = 'https://kp-wallpanel-default-rtdb.asia-southeast1.firebasedatabase.app';
var FB_IMG_BASE = 'https://andrkumbi-droid.github.io/kp-wallpanel/img/products/';
var FB_TRIGGER_DEFAULT = '##ส่งรูป';

function fbProp_(k, dflt){
  var v = PropertiesService.getScriptProperties().getProperty(k);
  return (v === null || v === '') ? (dflt || '') : v;
}

// ── Webhook verification. Meta calls this once when you save the webhook URL.
function doGet(e){
  var p = (e && e.parameter) || {};
  if (p['hub.mode'] === 'subscribe' && p['hub.verify_token'] === fbProp_('FB_VERIFY_TOKEN')) {
    return ContentService.createTextOutput(p['hub.challenge'] || '');
  }
  return ContentService.createTextOutput('ok');
}

/**
 * Webhook. Meta retries anything it does not get a fast 200 for, and sending
 * 31 photos takes longer than its patience — so every message id is remembered
 * for an hour and a retry of the same message does nothing. Without this guard
 * a slow run would send the whole catalogue twice.
 */
function doPost(e){
  try{
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var entries = body.entry || [];
    var trigger = fbProp_('FB_TRIGGER', FB_TRIGGER_DEFAULT);
    var cache = CacheService.getScriptCache();

    for (var i = 0; i < entries.length; i++){
      var evs = entries[i].messaging || [];
      for (var j = 0; j < evs.length; j++){
        var ev = evs[j], msg = ev.message;
        if (!msg || !msg.is_echo) continue;                 // only what WE send
        if (String(msg.text || '').indexOf(trigger) < 0) continue;

        var mid = msg.mid || '';
        if (mid && cache.get('mid_' + mid)) continue;        // already handled
        if (mid) cache.put('mid_' + mid, '1', 3600);

        // On an echo the customer is the RECIPIENT, not the sender.
        var psid = ev.recipient && ev.recipient.id;
        if (psid) fbSendCatalog(psid);
      }
    }
  }catch(err){
    console.error('doPost: ' + err);
  }
  return ContentService.createTextOutput('EVENT_RECEIVED');
}

// ── What is in stock, straight from the app ────────────────────────────────
function fbInStock(){
  var cat  = JSON.parse(UrlFetchApp.fetch(FB_DB + '/pub/webCatalog.json').getContentText()) || {};
  var sold = JSON.parse(UrlFetchApp.fetch(FB_DB + '/pub/soldOut.json').getContentText())    || {};
  var out = [];
  Object.keys(cat).forEach(function(code){
    if (sold[code]) return;
    var p = cat[code]; if (!p) return;
    out.push({code: code, name: p.name || '', price: +p.price || 0, mat: p.mat || ''});
  });
  // WPC first, then PVC, each by code — the order the shop shows them in.
  out.sort(function(a, b){
    if (a.mat !== b.mat) return a.mat === 'WPC' ? -1 : 1;
    return a.code < b.code ? -1 : 1;
  });
  return out;
}

function fbImgUrl(code){
  return FB_IMG_BASE + encodeURIComponent(code) + '.jpg';
}

// ── Sending ───────────────────────────────────────────────────────────────
function fbCall_(path, payload){
  var res = UrlFetchApp.fetch(FB_API + path + '?access_token=' + encodeURIComponent(fbProp_('FB_PAGE_TOKEN')), {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var txt = res.getContentText();
  if (res.getResponseCode() >= 300) throw new Error(path + ' → ' + txt);
  return JSON.parse(txt || '{}');
}

/**
 * Upload each photo to Meta once and keep the attachment_id. The first run for
 * a product is slow (Meta fetches the file from GitHub Pages), every later send
 * is one small call — that is what keeps 31 photos inside Apps Script's runtime
 * limit. Stored per code, so replacing a changed photo just means deleting that
 * one property.
 */
function fbAttachmentId(code){
  var props = PropertiesService.getScriptProperties();
  var key = 'ATT_' + code, id = props.getProperty(key);
  if (id) return id;
  var r = fbCall_('/me/message_attachments', {
    message: { attachment: { type: 'image', payload: { url: fbImgUrl(code), is_reusable: true } } }
  });
  if (r.attachment_id){ props.setProperty(key, r.attachment_id); return r.attachment_id; }
  return null;
}

function fbSendText(psid, text){
  fbCall_('/me/messages', {
    recipient: {id: psid}, messaging_type: 'RESPONSE', message: {text: text}
  });
}

function fbSendPhoto(psid, code){
  var id = fbAttachmentId(code);
  var payload = id ? {attachment_id: id} : {url: fbImgUrl(code), is_reusable: true};
  fbCall_('/me/messages', {
    recipient: {id: psid}, messaging_type: 'RESPONSE',
    message: {attachment: {type: 'image', payload: payload}}
  });
}

/**
 * The whole point. One photo per panel that is in stock, then a closing line.
 * A product whose photo fails is skipped rather than aborting the run — 30 of
 * 31 photos is still a served customer, and the failure is logged.
 */
function fbSendCatalog(psid){
  var items = fbInStock();
  if (!items.length) return 0;

  fbSendText(psid, 'สินค้าพร้อมส่งวันนี้ ' + items.length + ' ลายค่ะ 👇');

  var sent = 0;
  for (var i = 0; i < items.length; i++){
    try{ fbSendPhoto(psid, items[i].code); sent++; }
    catch(err){ console.error('photo ' + items[i].code + ': ' + err); }
  }
  fbSendText(psid, 'สนใจลายไหนคะ แจ้งรหัสได้เลยค่ะ 🙏');
  return sent;
}

// ── Test bench ────────────────────────────────────────────────────────────
// Your own PSID goes here. An app admin may be messaged while the app is still
// in development mode, so this works before App Review is granted.
function fbTestSend(){
  var MY_PSID = 'HIER-EINTRAGEN';
  console.log('gesendet: ' + fbSendCatalog(MY_PSID));
}

// Reads the catalogue only — safe to run any time, needs no token.
function fbTestList(){
  var items = fbInStock();
  console.log(items.length + ' lieferbar');
  items.forEach(function(p){ console.log(p.mat + '  ' + p.code + '  ' + p.price + '฿  ' + p.name); });
}
