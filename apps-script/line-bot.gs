/**
 * KP Wallpanel — LINE Bot (Apps Script Web App)
 * ------------------------------------------------------------
 * Buttons: Umsatz · Verkaufte Panele · Stock (nur Panele) · Incoming.
 * Free-form questions via Claude. Per-user language (Thai/German),
 * auto-detected in open mode.
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
var DEFAULT_LANG = 'th';

// ── ACCESS CONTROL + LANGUAGE ──────────────────────────────
// Open mode: USERS empty -> everyone sees everything (lang auto-detected).
// To restrict + set languages:
//   var USERS = { 'U_ANDRE':{role:'admin',lang:'de'}, 'U_PIM':{role:'admin',lang:'th'}, ... };
var USERS = {};
var ROLE_PERMS = {
  admin: { revenue:true, panels:true, stock:true, incoming:true, unpaid:true, orders:true },
  staff: { revenue:true, panels:true, stock:true, incoming:true, unpaid:true, orders:true }
};

function userInfo(userId){
  if(!Object.keys(USERS).length) return { role:'admin', lang:DEFAULT_LANG };
  var u = USERS[userId];
  if(!u) return null;
  if(typeof u === 'string') return { role:u, lang:DEFAULT_LANG };
  return { role:u.role || 'admin', lang:u.lang || DEFAULT_LANG };
}
function can(role, area){ var p = ROLE_PERMS[role]; return !!(p && p[area]); }
function de(lang){ return lang === 'de'; }
function detectLang(t){ if(/[฀-๿]/.test(t)) return 'th'; if(/[a-zA-Z]/.test(t)) return 'de'; return DEFAULT_LANG; }
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
  if(!info){ return reply(ev.replyToken, [textMsg('ไม่มีสิทธิ์เข้าถึง / Kein Zugriff.\nSchreibe "meine id".')]); }
  var lang = Object.keys(USERS).length ? info.lang : detectLang(text0);
  reply(ev.replyToken, [withMenu(textMsg(route(text0, info.role, lang)), info.role, lang)]);
}

function route(text, role, lang){
  var t = text.toLowerCase();
  if(/umsatz|revenue|ยอดขาย|รายได้|sales/.test(t))                  return can(role,'revenue')  ? fmtRevenue(lang)  : denied(lang);
  if(/panele|panel|verkauft|sold|แผ่นที่ขาย|แผ่นขาย/.test(t))         return can(role,'panels')   ? fmtPanels(lang)   : denied(lang);
  if(/stock|lager|สต็อก|คลัง|bestand/.test(t))                       return can(role,'stock')    ? fmtStock(lang)    : denied(lang);
  if(/incoming|eingang|lieferung|container|ของเข้า|ตู้/.test(t))      return can(role,'incoming') ? fmtIncoming(lang) : denied(lang);
  if(/unpaid|offen|zahlung|ค้างชำระ|cod|ยังไม่/.test(t))              return can(role,'unpaid')   ? fmtUnpaid(lang)   : denied(lang);
  if(/order|bestell|ออเดอร์|ออเด/.test(t))                          return can(role,'orders')   ? fmtOrders(lang)   : denied(lang);
  if(/hilfe|help|menu|เมนู|\?/.test(t))                              return fmtHelp(lang);
  if(ANTHROPIC_API_KEY) return askClaude(text, role, lang);
  return de(lang) ? 'Bitte unten ein Thema wählen 👇' : 'เลือกเมนูด้านล่าง 👇';
}

// ── Firebase reads ─────────────────────────────────────────
function fbGet(path){
  var url = FIREBASE_URL + '/' + path + '.json' + (FIREBASE_SECRET ? ('?auth=' + FIREBASE_SECRET) : '');
  var res = UrlFetchApp.fetch(url, {muteHttpExceptions:true});
  try{ return JSON.parse(res.getContentText() || 'null'); }catch(e){ return null; }
}
function asArr(v){ return v ? (Array.isArray(v) ? v.filter(Boolean) : Object.keys(v).map(function(k){return v[k];})) : []; }
function getOrders(){ return asArr(fbGet('orders')); }
function getStock(){ return asArr(fbGet('stockItems')); }
function getContainers(){ return asArr(fbGet('containerLog')); }
function amt(o){ return parseFloat(String(o && o.total!=null ? o.total : '0').replace(/[^0-9.]/g,'')) || 0; }
function f(n){ return Math.round(n).toLocaleString('en-US'); }
function dToday(){ return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function dMonth(){ return Utilities.formatDate(new Date(), TZ, 'yyyy-MM'); }
function dYear(){  return Utilities.formatDate(new Date(), TZ, 'yyyy'); }
function dmy(s){ if(!s) return ''; var p = String(s).split('-'); return p.length===3 ? (parseInt(p[2],10)+'/'+parseInt(p[1],10)) : String(s); }
function isPanelCode(code){ var c = String(code||'').toUpperCase(); return /^KP/.test(c) || /^K-?PVC/.test(c); }

// ── 1) Revenue (paid + total incl. unpaid) ─────────────────
function fmtRevenue(lang){
  var os = getOrders();
  var paid = os.filter(function(o){ return o.status==='delivered' && o.payMethod; });
  var del  = os.filter(function(o){ return o.status==='delivered'; });
  var t=dToday(), mk=dMonth(), yk=dYear();
  function sum(arr, pred){ return arr.filter(pred).reduce(function(a,o){ return a+amt(o); },0); }
  var pT=sum(paid,function(o){return (o.payDate||o.date||'')===t;}), aT=sum(del,function(o){return (o.date||'')===t;});
  var pM=sum(paid,function(o){return (o.payDate||o.date||'').indexOf(mk)===0;}), aM=sum(del,function(o){return (o.date||'').indexOf(mk)===0;});
  var pY=sum(paid,function(o){return (o.payDate||o.date||'').indexOf(yk)===0;}), aY=sum(del,function(o){return (o.date||'').indexOf(yk)===0;});
  if(de(lang)) return '💰 Umsatz\n\nHeute\n  Bezahlt '+f(pT)+' ฿  (gesamt '+f(aT)+')\n\nMonat\n  Bezahlt '+f(pM)+' ฿  (gesamt '+f(aM)+')\n\nJahr\n  Bezahlt '+f(pY)+' ฿  (gesamt '+f(aY)+')';
  return '💰 ยอดขาย\n\nวันนี้\n  จ่ายแล้ว '+f(pT)+' ฿  (รวม '+f(aT)+')\n\nเดือนนี้\n  จ่ายแล้ว '+f(pM)+' ฿  (รวม '+f(aM)+')\n\nปีนี้\n  จ่ายแล้ว '+f(pY)+' ฿  (รวม '+f(aY)+')';
}

// ── 2) Sold panels (day / month / year) ────────────────────
function countPanels(arr){
  var n = 0;
  arr.forEach(function(o){
    if(o.panels && o.panels !== '—') o.panels.split('·').forEach(function(p){
      var m = p.trim().match(/^([A-Z0-9\-]+)\s*[×x]\s*(\d+)/i);
      if(m && !/^CL/i.test(m[1])) n += parseInt(m[2]) || 0;
    });
  });
  return n;
}
function fmtPanels(lang){
  var del = getOrders().filter(function(o){ return o.status==='delivered'; });
  var t=dToday(), mk=dMonth(), yk=dYear();
  var pt = countPanels(del.filter(function(o){ return (o.date||'')===t; }));
  var pm = countPanels(del.filter(function(o){ return (o.date||'').indexOf(mk)===0; }));
  var py = countPanels(del.filter(function(o){ return (o.date||'').indexOf(yk)===0; }));
  if(de(lang)) return '🧱 Verkaufte Panele\n\nHeute: '+f(pt)+'\nMonat: '+f(pm)+'\nJahr: '+f(py);
  return '🧱 แผ่นที่ขาย\n\nวันนี้: '+f(pt)+'\nเดือนนี้: '+f(pm)+'\nปีนี้: '+f(py);
}

// ── 3) Stock — panels only ─────────────────────────────────
function fmtStock(lang){
  var s = getStock().filter(function(x){ return isPanelCode(x.code); });
  if(!s.length) return de(lang) ? '📦 Kein Panel-Bestand.' : '📦 ไม่มีสต็อกแผ่น';
  s.sort(function(a,b){ return (parseInt(a.qty)||0)-(parseInt(b.qty)||0); });
  var low = s.filter(function(x){ return (parseInt(x.qty)||0) <= 50; });
  var lines = s.slice(0,30).map(function(x){ var q=parseInt(x.qty)||0; return '• '+x.code+': '+q+(q<=50?' ⚠️':''); });
  var head = de(lang) ? ('📦 Panel-Lager\n\n'+(low.length?('⚠️ '+low.length+' niedrig\n\n'):''))
                      : ('📦 สต็อกแผ่น\n\n'+(low.length?('⚠️ '+low.length+' ใกล้หมด\n\n'):''));
  return head + lines.join('\n') + (s.length>30 ? '\n…' : '');
}

// ── 4) Incoming — containers not yet at warehouse ──────────
function fmtIncoming(lang){
  var cs = getContainers().filter(function(c){ return !c.arrivedWh; });
  if(!cs.length) return de(lang) ? '🚢 Keine Lieferungen unterwegs.' : '🚢 ไม่มีของเข้า';
  // furthest-along first
  cs.sort(function(a,b){ return ((b.arrivedTh?2:b.loading?1:0)) - ((a.arrivedTh?2:a.loading?1:0)); });
  var lines = cs.slice(0,15).map(function(c){
    var stage = c.arrivedTh ? (de(lang)?'🏪 Zoll/Thailand':'🏪 ถึงไทย')
              : c.loading   ? (de(lang)?'🛳️ unterwegs':'🛳️ กำลังมา')
              :               (de(lang)?'🏭 Produktion':'🏭 ผลิต');
    var when = dmy(c.arrivedTh || c.loading || c.deposit || '');
    var items = (c.items || []).map(function(i){ return i.code+'×'+i.qty; }).join(', ') || '—';
    var whenLbl = de(lang)?'voraussichtlich':'คาดว่า';
    return '• ' + (c.supplier||'?') + (c.containerNo?(' ('+c.containerNo+')'):'') + '\n'
         + '   ' + stage + (when?('  · '+whenLbl+' '+when):'') + '\n'
         + '   ' + items;
  });
  var head = de(lang) ? ('🚢 Incoming ('+cs.length+')\n\n') : ('🚢 ของเข้า ('+cs.length+')\n\n');
  return head + lines.join('\n\n');
}

// ── extra (keyword/AI only, no button) ─────────────────────
function fmtUnpaid(lang){
  var os = getOrders();
  var u = os.filter(function(o){ return o.status==='delivered' && !o.payMethod; });
  var total = u.reduce(function(a,o){ return a+amt(o); }, 0);
  u.sort(function(a,b){ return amt(b)-amt(a); });
  var lines = u.slice(0,15).map(function(o){ return '• '+o.id+' — '+f(amt(o))+' ฿  '+String(o.customer||'').slice(0,18); });
  var head = de(lang) ? ('⏳ Offene Zahlungen\n\n'+u.length+' Bestellungen · '+f(total)+' ฿\n\n')
                      : ('⏳ ค้างชำระ\n\n'+u.length+' orders · '+f(total)+' ฿\n\n');
  return head + lines.join('\n') + (u.length>15 ? ('\n… +'+(u.length-15)) : '');
}
function fmtOrders(lang){
  var os = getOrders(); var t = dToday();
  function c(pred){ return os.filter(pred).length; }
  var td = c(function(o){ return o.status==='delivered' && (o.date||'')===t; });
  if(de(lang)) return '📊 Bestellungen\n\nHeute geliefert: '+td+'\n\nNeu: '+c(function(o){return o.status==='new';})+'\nPacken: '+c(function(o){return o.status==='packing';})+'\nBereit: '+c(function(o){return o.status==='ready';})+'\nGeladen: '+c(function(o){return o.status==='loaded';})+'\nGeliefert: '+c(function(o){return o.status==='delivered';});
  return '📊 ออเดอร์\n\nวันนี้ส่งแล้ว: '+td+'\n\nNew: '+c(function(o){return o.status==='new';})+'\nPacking: '+c(function(o){return o.status==='packing';})+'\nReady: '+c(function(o){return o.status==='ready';})+'\nLoaded: '+c(function(o){return o.status==='loaded';})+'\nDelivered: '+c(function(o){return o.status==='delivered';});
}
function fmtHelp(lang){ return de(lang)?'Hallo! 👋\nTippe einen Knopf oder stelle eine Frage.':'สวัสดีค่ะ 👋\nกดปุ่มด้านล่าง หรือพิมพ์คำถามได้เลย'; }

// ── Free-form questions via Claude ─────────────────────────
function askClaude(question, role, lang){
  try{
    var parts = [];
    if(can(role,'revenue'))  parts.push(fmtRevenue(lang));
    if(can(role,'panels'))   parts.push(fmtPanels(lang));
    if(can(role,'unpaid'))   parts.push(fmtUnpaid(lang));
    if(can(role,'orders'))   parts.push(fmtOrders(lang));
    if(can(role,'stock'))    parts.push(fmtStock(lang));
    if(can(role,'incoming')) parts.push(fmtIncoming(lang));
    var langName = de(lang) ? 'German' : 'Thai';
    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method:'post', contentType:'application/json',
      headers:{ 'x-api-key':ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' }, muteHttpExceptions:true,
      payload: JSON.stringify({
        model: MODEL, max_tokens: 500,
        system: 'You are a concise assistant for KP Wallpanel (wall-panel business). Answer ONLY in '
              + langName + '. Use ONLY the data block provided; if not in the data, say you do not have it. '
              + 'Money is Thai Baht (฿).',
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
    ? { rev:'💰 Umsatz', pan:'🧱 Panele', stk:'📦 Stock', inc:'🚢 Incoming' }
    : { rev:'💰 ยอดขาย', pan:'🧱 แผ่นที่ขาย', stk:'📦 สต็อก', inc:'🚢 ของเข้า' };
  var items = [];
  if(can(role,'revenue'))  items.push(qr(L.rev, de(lang)?'Umsatz':'ยอดขาย'));
  if(can(role,'panels'))   items.push(qr(L.pan, de(lang)?'Panele':'แผ่นที่ขาย'));
  if(can(role,'stock'))    items.push(qr(L.stk, de(lang)?'Stock':'สต็อก'));
  if(can(role,'incoming')) items.push(qr(L.inc, de(lang)?'Incoming':'ของเข้า'));
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
