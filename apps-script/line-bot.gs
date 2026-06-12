/**
 * KP Wallpanel — LINE Bot (Apps Script Web App)
 * ------------------------------------------------------------
 * Lets a non-technical boss query the app's business data from
 * LINE: revenue, open payments, stock, order overview — via
 * tap-buttons (free) AND free-form questions (Claude, optional).
 *
 * Architecture:  LINE  ->  this web app (doPost webhook)
 *                      ->  Firebase RTDB (read app data)
 *                      ->  Claude API (for free-form questions)
 *                      ->  reply back to LINE
 *
 * Deploy as a SEPARATE Apps Script project (not the sheet sync one).
 * Deploy -> Web app -> Execute as: Me -> Anyone -> copy /exec URL,
 * paste it as the Webhook URL in the LINE Developers console.
 */

// ── CONFIG (fill these in) ─────────────────────────────────
var LINE_TOKEN   = 'PUT_LINE_CHANNEL_ACCESS_TOKEN';   // LINE → Messaging API → Channel access token
var FIREBASE_URL = 'https://kp-wallpanel-default-rtdb.asia-southeast1.firebasedatabase.app';
var FIREBASE_SECRET = '';   // only if your DB read rules require auth (leave '' if reads are open)
var ANTHROPIC_API_KEY = ''; // only for free-form AI questions (leave '' to disable AI, buttons still work)
var MODEL = 'claude-3-5-haiku-latest'; // cheap + fast; upgrade if you like
var TZ = 'Asia/Bangkok';

// ── ACCESS CONTROL ─────────────────────────────────────────
// START SIMPLE: leave USERS empty -> EVERYONE who messages the bot
// sees EVERYTHING. (Good for the initial rollout / testing.)
//
// LATER, to add staff and restrict them, fill USERS with LINE userIds:
//   var USERS = { 'Uboss...':'admin', 'Uandre...':'admin', 'Ustaff1...':'staff' };
// Anyone NOT listed is then denied. 'staff' permissions are set below.
var USERS = {};

// What each role may see. To restrict employees later, just flip the
// 'staff' flags to false — no other code changes needed.
var ROLE_PERMS = {
  admin: { revenue:true, unpaid:true, stock:true, orders:true },
  staff: { revenue:true, unpaid:true, stock:true, orders:true }  // start: all; tighten later
};

function userRole(userId){
  if(!Object.keys(USERS).length) return 'admin'; // open mode during setup
  return USERS[userId] || null;                   // null = not on the list = denied
}
function can(role, area){ var p = ROLE_PERMS[role]; return !!(p && p[area]); }
function denied(){ return 'ขออภัย คุณไม่มีสิทธิ์ดูข้อมูลนี้ / Dafür hast du keine Berechtigung.'; }

// ── Webhook entry ──────────────────────────────────────────
function doPost(e){
  try{
    var body = JSON.parse(e.postData.contents);
    (body.events || []).forEach(handleEvent);
  }catch(err){ /* swallow so LINE doesn't retry-storm */ }
  return ContentService.createTextOutput('OK');
}
function doGet(){ return ContentService.createTextOutput('KP Wallpanel LINE bot OK'); }

function handleEvent(ev){
  if(ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;
  var userId = ev.source && ev.source.userId;
  var role = userRole(userId);
  if(!role){
    return reply(ev.replyToken, [textMsg('ขออภัย คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้ / Kein Zugriff.')]);
  }
  var answer = route((ev.message.text || '').trim(), role);
  reply(ev.replyToken, [withMenu(textMsg(answer), role)]);
}

// ── Routing: keyword → canned answer (role-checked), else Claude ──
function route(text, role){
  var t = text.toLowerCase();
  if(/umsatz|revenue|ยอดขาย|รายได้|sales/.test(t))         return can(role,'revenue') ? fmtRevenue() : denied();
  if(/unpaid|offen|zahlung|ค้างชำระ|cod|ยังไม่/.test(t))     return can(role,'unpaid')  ? fmtUnpaid()  : denied();
  if(/lager|stock|สต็อก|คลัง|bestand/.test(t))              return can(role,'stock')   ? fmtStock()   : denied();
  if(/order|bestell|ออเดอร์|ออเด/.test(t))                 return can(role,'orders')  ? fmtOrders()  : denied();
  if(/hilfe|help|menu|เมนู|\?/.test(t))                     return fmtHelp();
  if(ANTHROPIC_API_KEY) return askClaude(text, role);
  return 'เลือกเมนูด้านล่าง 👇 / Bitte unten ein Thema wählen.';
}

// ── Firebase reads ─────────────────────────────────────────
function fbGet(path){
  var url = FIREBASE_URL + '/' + path + '.json' + (FIREBASE_SECRET ? ('?auth=' + FIREBASE_SECRET) : '');
  var res = UrlFetchApp.fetch(url, {muteHttpExceptions:true});
  try{ return JSON.parse(res.getContentText() || 'null'); }catch(e){ return null; }
}
function getOrders(){ var o = fbGet('orders'); return o ? Object.keys(o).map(function(k){return o[k];}) : []; }
function getStock(){ var s = fbGet('stockItems'); return s ? (Array.isArray(s) ? s.filter(Boolean) : Object.keys(s).map(function(k){return s[k];})) : []; }

function amt(o){ return parseFloat(String(o && o.total!=null ? o.total : '0').replace(/[^0-9.]/g,'')) || 0; }
function f(n){ return Math.round(n).toLocaleString('en-US'); }
function dToday(){ return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function dMonth(){ return Utilities.formatDate(new Date(), TZ, 'yyyy-MM'); }
function dYear(){  return Utilities.formatDate(new Date(), TZ, 'yyyy'); }

// ── Data formatters ────────────────────────────────────────
function fmtRevenue(){
  var os = getOrders();
  var paid = os.filter(function(o){ return o.status==='delivered' && o.payMethod; });
  var del  = os.filter(function(o){ return o.status==='delivered'; });
  var t=dToday(), mk=dMonth(), yk=dYear();
  function sum(arr, pred){ return arr.filter(pred).reduce(function(a,o){ return a+amt(o); },0); }
  var pT=sum(paid,function(o){return (o.payDate||o.date||'')===t;}),  aT=sum(del,function(o){return (o.date||'')===t;});
  var pM=sum(paid,function(o){return (o.payDate||o.date||'').indexOf(mk)===0;}), aM=sum(del,function(o){return (o.date||'').indexOf(mk)===0;});
  var pY=sum(paid,function(o){return (o.payDate||o.date||'').indexOf(yk)===0;}), aY=sum(del,function(o){return (o.date||'').indexOf(yk)===0;});
  return '💰 ยอดขาย / Umsatz\n\n'
    + 'วันนี้ / Heute\n  จ่ายแล้ว ' + f(pT) + ' ฿  (รวม ' + f(aT) + ')\n\n'
    + 'เดือนนี้ / Monat\n  จ่ายแล้ว ' + f(pM) + ' ฿  (รวม ' + f(aM) + ')\n\n'
    + 'ปีนี้ / Jahr\n  จ่ายแล้ว ' + f(pY) + ' ฿  (รวม ' + f(aY) + ')\n\n'
    + '(จ่ายแล้ว = bezahlt · รวม = inkl. unbezahlt)';
}

function fmtUnpaid(){
  var os = getOrders();
  var unpaid = os.filter(function(o){ return o.status==='delivered' && !o.payMethod; });
  var total = unpaid.reduce(function(a,o){ return a+amt(o); }, 0);
  unpaid.sort(function(a,b){ return amt(b)-amt(a); });
  var lines = unpaid.slice(0,15).map(function(o){
    return '• ' + o.id + ' — ' + f(amt(o)) + ' ฿  ' + String(o.customer||'').slice(0,18);
  });
  return '⏳ ค้างชำระ / Offene Zahlungen\n\n'
    + unpaid.length + ' orders · ' + f(total) + ' ฿ รวม\n\n'
    + lines.join('\n') + (unpaid.length>15 ? ('\n… +'+(unpaid.length-15)+' more') : '');
}

function fmtStock(){
  var s = getStock();
  if(!s.length) return '📦 ไม่มีข้อมูลสต็อก / Kein Lagerbestand.';
  s.sort(function(a,b){ return (parseInt(a.qty)||0)-(parseInt(b.qty)||0); });
  var low = s.filter(function(x){ return (parseInt(x.qty)||0) <= 50; });
  var lines = s.slice(0,25).map(function(x){
    var q = parseInt(x.qty)||0;
    return '• ' + x.code + ': ' + q + (q<=50 ? ' ⚠️' : '');
  });
  return '📦 สต็อก / Lager\n\n'
    + (low.length ? ('⚠️ ' + low.length + ' รายการใกล้หมด / niedrig\n\n') : '')
    + lines.join('\n') + (s.length>25 ? '\n…' : '');
}

function fmtOrders(){
  var os = getOrders();
  var t = dToday();
  function c(pred){ return os.filter(pred).length; }
  var todayDel = c(function(o){ return o.status==='delivered' && (o.date||'')===t; });
  return '📊 ออเดอร์ / Bestellungen\n\n'
    + 'วันนี้ส่งแล้ว / Heute geliefert: ' + todayDel + '\n\n'
    + 'New: '       + c(function(o){return o.status==='new';}) + '\n'
    + 'Packing: '   + c(function(o){return o.status==='packing';}) + '\n'
    + 'Ready: '     + c(function(o){return o.status==='ready';}) + '\n'
    + 'Loaded: '    + c(function(o){return o.status==='loaded';}) + '\n'
    + 'Delivered: ' + c(function(o){return o.status==='delivered';});
}

function fmtHelp(){
  return 'สวัสดีค่ะ 👋 / Hallo!\n\nกดปุ่มด้านล่าง หรือพิมพ์คำถามได้เลย\nTippe einen Knopf unten oder stelle eine Frage:\n\n'
    + '💰 Umsatz · ⏳ Offen · 📦 Lager · 📊 Orders';
}

// ── Free-form questions via Claude (optional) ──────────────
function askClaude(question, role){
  try{
    // Only feed Claude the data the user's role is allowed to see,
    // so a restricted staff member can't extract it via free-form text.
    var parts = [];
    if(can(role,'revenue')) parts.push(fmtRevenue());
    if(can(role,'unpaid'))  parts.push(fmtUnpaid());
    if(can(role,'orders'))  parts.push(fmtOrders());
    if(can(role,'stock'))   parts.push(fmtStock());
    var ctx = parts.join('\n\n');
    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method:'post', contentType:'application/json',
      headers:{ 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' },
      muteHttpExceptions:true,
      payload: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: 'You are a concise assistant for a wall-panel business (KP Wallpanel). '
              + 'Answer in the user\'s language (Thai or German). Use ONLY the data block provided; '
              + 'if the answer is not in the data, say you do not have that info. Money is Thai Baht (฿).',
        messages: [{ role:'user', content: 'DATA:\n' + ctx + '\n\nQUESTION: ' + question }]
      })
    });
    var j = JSON.parse(res.getContentText());
    return (j.content && j.content[0] && j.content[0].text) || 'ขออภัย ตอบไม่ได้ตอนนี้ / Konnte nicht antworten.';
  }catch(err){ return 'ขออภัย เกิดข้อผิดพลาด / Fehler beim Antworten.'; }
}

// ── LINE messaging helpers ─────────────────────────────────
function textMsg(t){ return { type:'text', text:t }; }
function withMenu(msg, role){
  var items = [];
  if(can(role,'revenue')) items.push(qr('💰 Umsatz','Umsatz'));
  if(can(role,'unpaid'))  items.push(qr('⏳ Offen','Offene Zahlungen'));
  if(can(role,'stock'))   items.push(qr('📦 Lager','Lager'));
  if(can(role,'orders'))  items.push(qr('📊 Orders','Orders'));
  if(items.length) msg.quickReply = { items: items };
  return msg;
}
function qr(label, text){ return { type:'action', action:{ type:'message', label:label, text:text } }; }
function reply(token, messages){
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method:'post', contentType:'application/json',
    headers:{ Authorization: 'Bearer ' + LINE_TOKEN },
    muteHttpExceptions:true,
    payload: JSON.stringify({ replyToken: token, messages: messages })
  });
}
