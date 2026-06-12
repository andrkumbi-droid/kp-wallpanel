/**
 * KP Wallpanel — LINE Bot (Apps Script Web App)
 * ------------------------------------------------------------
 * Lets the boss / staff query the app's business data from LINE:
 * revenue, open payments, stock, orders — via tap-buttons AND
 * free-form questions (Claude). Replies per-user in ONE language
 * (Thai for staff, German for Andre).
 *
 * LINE -> doPost webhook -> Firebase RTDB -> (Claude) -> reply.
 */

// ── CONFIG ─────────────────────────────────────────────────
var LINE_TOKEN   = 'PUT_LINE_CHANNEL_ACCESS_TOKEN';
var FIREBASE_URL = 'https://kp-wallpanel-default-rtdb.asia-southeast1.firebasedatabase.app';
var FIREBASE_SECRET = '';
var ANTHROPIC_API_KEY = '';
var MODEL = 'claude-3-5-haiku-latest';
var TZ = 'Asia/Bangkok';
var DEFAULT_LANG = 'th'; // language for unknown users / open mode (most users are Thai)

// ── ACCESS CONTROL + LANGUAGE ──────────────────────────────
// Open mode: leave USERS empty -> everyone sees everything (in DEFAULT_LANG).
// To restrict + set languages, list each LINE userId with role and lang:
//   var USERS = {
//     'U_ANDRE': { role:'admin', lang:'de' },   // Andre  -> German
//     'U_PIM'  : { role:'admin', lang:'th' },    // Pim    -> Thai
//     'U_BOBBY': { role:'admin', lang:'th' },    // Bobby  -> Thai
//     'U_NOY'  : { role:'admin', lang:'th' },    // Noy    -> Thai
//   };
// (lang: 'th' = Thai, 'de' = German. role: 'admin' = all, 'staff' = limited.)
// Each person sends the bot "meine id" once to get their U... id.
var USERS = {};

var ROLE_PERMS = {
  admin: { revenue:true, unpaid:true, stock:true, orders:true },
  staff: { revenue:true, unpaid:true, stock:true, orders:true }  // tighten later
};

function userInfo(userId){
  if(!Object.keys(USERS).length) return { role:'admin', lang:DEFAULT_LANG }; // open mode
  var u = USERS[userId];
  if(!u) return null;
  if(typeof u === 'string') return { role:u, lang:DEFAULT_LANG };
  return { role:u.role || 'admin', lang:u.lang || DEFAULT_LANG };
}
function can(role, area){ var p = ROLE_PERMS[role]; return !!(p && p[area]); }
function de(lang){ return lang === 'de'; }
// Guess language from the message (used in open mode before users are configured):
// Thai characters -> Thai, otherwise Latin letters -> German.
function detectLang(t){
  if(/[฀-๿]/.test(t)) return 'th';
  if(/[a-zA-Z]/.test(t)) return 'de';
  return DEFAULT_LANG;
}
function denied(lang){ return de(lang) ? 'Dafür hast du keine Berechtigung.' : 'คุณไม่มีสิทธิ์ดูข้อมูลนี้'; }

// ── Webhook entry ──────────────────────────────────────────
function doPost(e){
  try{ var body = JSON.parse(e.postData.contents); (body.events || []).forEach(handleEvent); }catch(err){}
  return ContentService.createTextOutput('OK');
}
function doGet(){ return ContentService.createTextOutput('KP Wallpanel LINE bot OK'); }

function handleEvent(ev){
  if(ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;
  var userId = ev.source && ev.source.userId;
  var text0 = (ev.message.text || '').trim();
  if(/whoami|meine id|my ?id|ไอดี|user ?id/i.test(text0)){
    return reply(ev.replyToken, [textMsg('LINE userId / ไอดี:\n' + (userId || '(?)'))]);
  }
  var info = userInfo(userId);
  if(!info){
    return reply(ev.replyToken, [textMsg('ไม่มีสิทธิ์เข้าถึง / Kein Zugriff.\nSchreibe "meine id".')]);
  }
  // Configured users use their fixed language; in open mode, detect from the message.
  var lang = Object.keys(USERS).length ? info.lang : detectLang(text0);
  var answer = route(text0, info.role, lang);
  reply(ev.replyToken, [withMenu(textMsg(answer), info.role, lang)]);
}

function route(text, role, lang){
  var t = text.toLowerCase();
  if(/umsatz|revenue|ยอดขาย|รายได้|sales/.test(t))     return can(role,'revenue') ? fmtRevenue(lang) : denied(lang);
  if(/unpaid|offen|zahlung|ค้างชำระ|cod|ยังไม่/.test(t)) return can(role,'unpaid')  ? fmtUnpaid(lang)  : denied(lang);
  if(/lager|stock|สต็อก|คลัง|bestand/.test(t))          return can(role,'stock')   ? fmtStock(lang)   : denied(lang);
  if(/order|bestell|ออเดอร์|ออเด/.test(t))             return can(role,'orders')  ? fmtOrders(lang)  : denied(lang);
  if(/hilfe|help|menu|เมนู|\?/.test(t))                 return fmtHelp(lang);
  if(ANTHROPIC_API_KEY) return askClaude(text, role, lang);
  return de(lang) ? 'Bitte unten ein Thema wählen 👇' : 'เลือกเมนูด้านล่าง 👇';
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

// ── Data formatters (per language) ─────────────────────────
function fmtRevenue(lang){
  var os = getOrders();
  var paid = os.filter(function(o){ return o.status==='delivered' && o.payMethod; });
  var del  = os.filter(function(o){ return o.status==='delivered'; });
  var t=dToday(), mk=dMonth(), yk=dYear();
  function sum(arr, pred){ return arr.filter(pred).reduce(function(a,o){ return a+amt(o); },0); }
  var pT=sum(paid,function(o){return (o.payDate||o.date||'')===t;}), aT=sum(del,function(o){return (o.date||'')===t;});
  var pM=sum(paid,function(o){return (o.payDate||o.date||'').indexOf(mk)===0;}), aM=sum(del,function(o){return (o.date||'').indexOf(mk)===0;});
  var pY=sum(paid,function(o){return (o.payDate||o.date||'').indexOf(yk)===0;}), aY=sum(del,function(o){return (o.date||'').indexOf(yk)===0;});
  if(de(lang)){
    return '💰 Umsatz\n\nHeute\n  Bezahlt '+f(pT)+' ฿  (gesamt '+f(aT)+')\n\n'
         + 'Monat\n  Bezahlt '+f(pM)+' ฿  (gesamt '+f(aM)+')\n\n'
         + 'Jahr\n  Bezahlt '+f(pY)+' ฿  (gesamt '+f(aY)+')';
  }
  return '💰 ยอดขาย\n\nวันนี้\n  จ่ายแล้ว '+f(pT)+' ฿  (รวม '+f(aT)+')\n\n'
       + 'เดือนนี้\n  จ่ายแล้ว '+f(pM)+' ฿  (รวม '+f(aM)+')\n\n'
       + 'ปีนี้\n  จ่ายแล้ว '+f(pY)+' ฿  (รวม '+f(aY)+')';
}

function fmtUnpaid(lang){
  var os = getOrders();
  var unpaid = os.filter(function(o){ return o.status==='delivered' && !o.payMethod; });
  var total = unpaid.reduce(function(a,o){ return a+amt(o); }, 0);
  unpaid.sort(function(a,b){ return amt(b)-amt(a); });
  var lines = unpaid.slice(0,15).map(function(o){ return '• '+o.id+' — '+f(amt(o))+' ฿  '+String(o.customer||'').slice(0,18); });
  var head = de(lang) ? ('⏳ Offene Zahlungen\n\n'+unpaid.length+' Bestellungen · '+f(total)+' ฿\n\n')
                      : ('⏳ ค้างชำระ\n\n'+unpaid.length+' orders · '+f(total)+' ฿\n\n');
  return head + lines.join('\n') + (unpaid.length>15 ? ('\n… +'+(unpaid.length-15)) : '');
}

function fmtStock(lang){
  var s = getStock();
  if(!s.length) return de(lang) ? '📦 Kein Lagerbestand.' : '📦 ไม่มีข้อมูลสต็อก';
  s.sort(function(a,b){ return (parseInt(a.qty)||0)-(parseInt(b.qty)||0); });
  var low = s.filter(function(x){ return (parseInt(x.qty)||0) <= 50; });
  var lines = s.slice(0,25).map(function(x){ var q=parseInt(x.qty)||0; return '• '+x.code+': '+q+(q<=50?' ⚠️':''); });
  var head = de(lang) ? ('📦 Lager\n\n'+(low.length?('⚠️ '+low.length+' niedrig\n\n'):''))
                      : ('📦 สต็อก\n\n'+(low.length?('⚠️ '+low.length+' ใกล้หมด\n\n'):''));
  return head + lines.join('\n') + (s.length>25 ? '\n…' : '');
}

function fmtOrders(lang){
  var os = getOrders(); var t = dToday();
  function c(pred){ return os.filter(pred).length; }
  var todayDel = c(function(o){ return o.status==='delivered' && (o.date||'')===t; });
  if(de(lang)){
    return '📊 Bestellungen\n\nHeute geliefert: '+todayDel+'\n\n'
         + 'Neu: '+c(function(o){return o.status==='new';})+'\nPacken: '+c(function(o){return o.status==='packing';})
         + '\nBereit: '+c(function(o){return o.status==='ready';})+'\nGeladen: '+c(function(o){return o.status==='loaded';})
         + '\nGeliefert: '+c(function(o){return o.status==='delivered';});
  }
  return '📊 ออเดอร์\n\nวันนี้ส่งแล้ว: '+todayDel+'\n\n'
       + 'New: '+c(function(o){return o.status==='new';})+'\nPacking: '+c(function(o){return o.status==='packing';})
       + '\nReady: '+c(function(o){return o.status==='ready';})+'\nLoaded: '+c(function(o){return o.status==='loaded';})
       + '\nDelivered: '+c(function(o){return o.status==='delivered';});
}

function fmtHelp(lang){
  return de(lang) ? 'Hallo! 👋\nTippe einen Knopf oder stelle eine Frage.'
                  : 'สวัสดีค่ะ 👋\nกดปุ่มด้านล่าง หรือพิมพ์คำถามได้เลย';
}

// ── Free-form questions via Claude ─────────────────────────
function askClaude(question, role, lang){
  try{
    var parts = [];
    if(can(role,'revenue')) parts.push(fmtRevenue(lang));
    if(can(role,'unpaid'))  parts.push(fmtUnpaid(lang));
    if(can(role,'orders'))  parts.push(fmtOrders(lang));
    if(can(role,'stock'))   parts.push(fmtStock(lang));
    var langName = de(lang) ? 'German' : 'Thai';
    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method:'post', contentType:'application/json',
      headers:{ 'x-api-key':ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' }, muteHttpExceptions:true,
      payload: JSON.stringify({
        model: MODEL, max_tokens: 500,
        system: 'You are a concise assistant for KP Wallpanel (a wall-panel business). '
              + 'Answer ONLY in ' + langName + '. Use ONLY the data block provided; if the answer is '
              + 'not in the data, say you do not have that info. Money is Thai Baht (฿).',
        messages: [{ role:'user', content: 'DATA:\n' + parts.join('\n\n') + '\n\nQUESTION: ' + question }]
      })
    });
    var j = JSON.parse(res.getContentText());
    return (j.content && j.content[0] && j.content[0].text) || (de(lang)?'Konnte nicht antworten.':'ตอบไม่ได้ตอนนี้');
  }catch(err){ return de(lang) ? 'Fehler beim Antworten.' : 'เกิดข้อผิดพลาด'; }
}

// ── LINE messaging helpers ─────────────────────────────────
function textMsg(t){ return { type:'text', text:t }; }
function withMenu(msg, role, lang){
  var L = de(lang)
    ? { rev:'💰 Umsatz', unp:'⏳ Offen', stk:'📦 Lager', ord:'📊 Orders' }
    : { rev:'💰 ยอดขาย', unp:'⏳ ค้างชำระ', stk:'📦 สต็อก', ord:'📊 ออเดอร์' };
  var items = [];
  // action text = a keyword the router recognizes in either language
  if(can(role,'revenue')) items.push(qr(L.rev, de(lang)?'Umsatz':'ยอดขาย'));
  if(can(role,'unpaid'))  items.push(qr(L.unp, de(lang)?'Offen':'ค้างชำระ'));
  if(can(role,'stock'))   items.push(qr(L.stk, de(lang)?'Lager':'สต็อก'));
  if(can(role,'orders'))  items.push(qr(L.ord, de(lang)?'Orders':'ออเดอร์'));
  if(items.length) msg.quickReply = { items: items };
  return msg;
}
function qr(label, text){ return { type:'action', action:{ type:'message', label:label, text:text } }; }
function reply(token, messages){
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method:'post', contentType:'application/json',
    headers:{ Authorization:'Bearer '+LINE_TOKEN }, muteHttpExceptions:true,
    payload: JSON.stringify({ replyToken:token, messages:messages })
  });
}
