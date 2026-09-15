/* ══════════════════════════════════════════════════════════════════════════
   TOUR 2 — der neue Tour-Tab, parallel zum alten gebaut.

   Läuft NEBEN dem laufenden Tour-Tab, ersetzt ihn nicht. Am alten Tour-Code ist
   nichts geändert: dieser File liest dieselben Globals (orders, activeTours,
   drivers, ofSelOrders, ofSelDriver) und ruft dieselben Aktionen (ofSendTourAsk,
   ofTourDeliver, ofTourSettle, …), also zeigen beide Ansichten immer dasselbe.
   Angehängt wird er nur an zwei Stellen — `oft` und `ofRenderTour` werden unten
   umwickelt. Diesen File löschen = die App ist exakt wie vorher.

   Aufbau: eine dünne Statusleiste, darunter vier Unter-Tabs, ein Job pro Schirm:
     ➕ จัดทัวร์ / Plan   Orders nach Zone picken → Ladeliste → Fahrer → senden
     🚚 ทัวร์ / Tours     eine Zeile je Tour, klappt in ihre Stops auf
     💸 เงิน / Money      Bargeld gegen Lohn je Tour, danach die Auszahlungen
     🆔 รหัส / IDs        das Tour-ID-Register
   Plan steht vorn: Touren bauen ist das, wofür der Tab am meisten benutzt wird.

   Sichtbar ist der Tab nur für André, oder mit ?tour2=1 (merkt sich der Browser,
   ?tour2=0 schaltet ihn wieder ab).
   ══════════════════════════════════════════════════════════════════════════ */

var _t2Sub = 'plan', _t2Zone = '', _t2St = '', _t2Q = '', _t2NewTour = false;
var _t2OpenTour = {}, _t2DrvFilt = '', _t2Msg = '';
try { _t2Sub = localStorage.getItem('kp_t2_sub') || 'plan'; } catch (e) {}

var T2_TRUCK = 100000;               // ฿ je Zone, ab dem sich eine Tour lohnt
var T2_ZC = { 'Bangkok':'#1a73e8', 'Northern':'#8b5cf6', 'Northeastern':'#f59e0b',
              'Eastern':'#06b6d4', 'Southern':'#ec4899', 'Instore':'#16a34a', 'Unknown':'#64748b' };
function t2zc(z) { return T2_ZC[z] || '#64748b'; }
function t2n(v) { return (Number(v) || 0).toLocaleString(); }
function t2Active() { var v = document.getElementById('ofv-tour2'); return !!(v && v.classList.contains('active')); }

/* Mengen einer Order — gezählt wie in der alten Übersicht. */
function t2Met(o) {
  var p = (o.lineItems || []).filter(function (i) { return i.type === 'panel'; })
          .reduce(function (a, i) { return a + (parseInt(i.qty) || 0); }, 0);
  if (!p) p = parseInt(o.panels) || 0;
  return { panels: p, ctn: parseInt(o.ctn) || 0, bun: parseInt(o.bundle) || 0, baht: ofOrderTotalNum(o) };
}
function t2Sum(list) {
  return list.reduce(function (a, o) {
    var m = t2Met(o);
    a.panels += m.panels; a.ctn += m.ctn; a.bun += m.bun; a.baht += m.baht; a.n++;
    return a;
  }, { n: 0, panels: 0, ctn: 0, bun: 0, baht: 0 });
}
/* Alles, was auf eine Tour könnte und noch auf keiner ist. */
function t2Pool() {
  var used = {};
  (activeTours || []).forEach(function (t) { (t.orders || []).forEach(function (id) { used[id] = 1; }); });
  return (orders || []).filter(function (o) {
    return ['new', 'packing', 'ready'].indexOf(o.status) >= 0 && !used[o.id];
  });
}
/* Geld, das auf DIESER Tour kassiert wurde — nicht, was die Order je bezahlt hat. */
function t2TourMoney(t) {
  var m = { cash: 0, online: 0, unknown: 0 };
  (t.orders || []).forEach(function (id) {
    if (((t.status || {})[id] || '') !== 'delivered') return;
    var o = (orders || []).find(function (x) { return x.id === id; });
    if (!o) return;
    var c = tourPayCO(t, o);
    m.cash += c.cash; m.online += c.online; m.unknown += (c.unknown || 0);
  });
  return m;
}
function t2TourProg(t) {
  var done = 0, open = 0;
  (t.orders || []).forEach(function (id) {
    var s = tourEffStatus(t, id);
    if (s === 'delivered' || s === 'shipped') done++;
    else if (s !== 'cancelled') open++;
  });
  var tot = (t.orders || []).length;
  return { done: done, open: open, total: tot, pct: tot ? Math.round(done / tot * 100) : 0 };
}

/* ── Rahmen: Statusleiste + Unter-Tabs ───────────────────────────────────── */
function t2Chip(icon, val, lbl, col, go) {
  return '<button type="button"' + (go ? ' onclick="t2Go(\'' + go + '\')"' : '') +
    ' class="t2kpi" style="border-left-color:' + col + ';cursor:' + (go ? 'pointer' : 'default') + '">' +
    '<span class="t2kpil">' + icon + ' ' + lbl + '</span>' +
    '<span class="t2kpiv" style="color:' + col + '">' + val + '</span></button>';
}
function t2Strip() {
  var pool = t2Pool(), ready = pool.filter(function (o) { return o.status === 'ready'; });
  var sR = t2Sum(ready);
  var tours = (activeTours || []), driving = tours.filter(function (t) { return t.driving; }).length;
  var cash = 0, openStops = 0;
  tours.forEach(function (t) { cash += t2TourMoney(t).cash; openStops += t2TourProg(t).open; });
  var owe = 0;
  try { owe = ofUnpaidGroups().reduce(function (a, g) { return a + (Number(g.pay) || 0); }, 0); } catch (e) {}
  return '<div class="t2strip">' +
    t2Chip('📦', pool.length + ' <span style="font-size:11px;font-weight:700;color:var(--text2)">(' + t2n(sR.baht) + ' ฿)</span>', 'รอจัด / to plan', '#b45309', 'plan') +
    t2Chip('🚚', tours.length + (driving ? ' <span style="font-size:11px;font-weight:700;color:#16a34a">·' + driving + ' 🚀</span>' : ''), 'ทัวร์ / tours', '#1d4ed8', 'tours') +
    t2Chip('⏳', t2n(openStops), 'ค้างส่ง / open stops', '#92400e', 'tours') +
    t2Chip('💵', t2n(cash) + ' ฿', 'เงินสดบนรถ / cash out', '#166534', 'money') +
    (owe > 0 ? t2Chip('💸', t2n(owe) + ' ฿', 'ค้างจ่ายคนขับ / unpaid', '#b91c1c', 'money') : '') +
    '</div>';
}
function t2SubBar() {
  var tours = (activeTours || []).length, pool = t2Pool().length;
  var defs = [['plan', '➕', 'จัดทัวร์ / Plan', pool], ['tours', '🚚', 'ทัวร์ / Tours', tours],
              ['money', '💸', 'เงิน / Money', 0], ['ids', '🆔', 'รหัส / IDs', 0]];
  return '<div class="t2subs">' + defs.map(function (d) {
    return '<button type="button" class="t2sub' + (_t2Sub === d[0] ? ' on' : '') + '" onclick="t2Go(\'' + d[0] + '\')">' +
      d[1] + ' ' + d[2] + (d[3] ? '<span class="t2cnt">' + d[3] + '</span>' : '') + '</button>';
  }).join('') + '</div>';
}
function t2Go(s) {
  _t2Sub = s;
  try { localStorage.setItem('kp_t2_sub', s); } catch (e) {}
  t2Render();
}

/* ── geliehene Blöcke (Tour-IDs, Auszahlungen) ────────────────────────────
   Der Knoten wird VERSCHOBEN, nicht kopiert — dieselbe id, dieselben Handler.
   Ein Kommentar merkt sich die alte Stelle, dahin geht er beim Verlassen zurück. */
var _t2Ado = {};
function t2Adopt(id, hostId) {
  var el = document.getElementById(id), h = document.getElementById(hostId);
  if (!el || !h) return;
  if (!_t2Ado[id]) {
    var ph = document.createComment('t2-home:' + id);
    el.parentNode.insertBefore(ph, el);
    _t2Ado[id] = ph;
  }
  if (el.parentNode !== h) h.appendChild(el);
  el.style.display = '';
}
function t2Release() {
  Object.keys(_t2Ado).forEach(function (id) {
    var el = document.getElementById(id), ph = _t2Ado[id];
    if (el && ph && ph.parentNode && el.parentNode !== ph.parentNode) ph.parentNode.insertBefore(el, ph);
  });
}

/* ── PLAN ────────────────────────────────────────────────────────────────── */
var T2_ST = { 'ready':   { l: 'พร้อม / ready',        bg: '#dcfce7', c: '#166534' },
              'packing': { l: 'กำลังแพ็ค / packing',  bg: '#fef3c7', c: '#92400e' },
              'new':     { l: 'ใหม่ / new',           bg: '#e0e7ff', c: '#3730a3' } };
function t2PlanFilt(pool) {
  var q = (_t2Q || '').trim().toLowerCase();
  return pool.filter(function (o) {
    if (_t2Zone && (o.zone || 'Unknown') !== _t2Zone) return false;
    if (_t2St && o.status !== _t2St) return false;
    if (q) {
      var hay = [o.id, o.customer, o.phone, o.address, o.zone].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });
}
function t2SetZone(z) { _t2Zone = (_t2Zone === z ? '' : z); t2RenderBody(); }
function t2SetSt(s) { _t2St = (_t2St === s ? '' : s); t2RenderBody(); }
function t2Search(v) { _t2Q = v; t2RenderPool(); }
function t2Pick(btn) {
  var id = btn.getAttribute('data-oid');
  if (ofSelOrders.indexOf(id) >= 0) ofSelOrders = ofSelOrders.filter(function (x) { return x !== id; });
  else ofSelOrders.push(id);
  _t2Msg = '';
  t2RenderPool(); t2RenderLoad();
}
function t2ClearSel() { ofSelOrders = []; t2RenderPool(); t2RenderLoad(); }
function t2PickZone(z) {
  var list = t2PlanFilt(t2Pool()).filter(function (o) { return (o.zone || 'Unknown') === z; });
  var allIn = list.length > 0 && list.every(function (o) { return ofSelOrders.indexOf(o.id) >= 0; });
  list.forEach(function (o) {
    var i = ofSelOrders.indexOf(o.id);
    if (allIn) { if (i >= 0) ofSelOrders.splice(i, 1); }
    else if (i < 0) ofSelOrders.push(o.id);
  });
  t2RenderPool(); t2RenderLoad();
}
function t2Drv(btn) {
  var id = btn.getAttribute('data-did');
  ofSelDriver = (ofSelDriver === id ? null : id);
  _t2Msg = '';
  t2RenderLoad();
}
function t2NewToggle(cb) { _t2NewTour = !!cb.checked; t2RenderLoad(); }
function t2Send() {
  if (!ofSelDriver) { _t2Msg = '⚠️ เลือกคนขับก่อน / pick a driver first'; t2RenderLoad(); return; }
  if (!ofSelOrders.length) { _t2Msg = '⚠️ ยังไม่ได้เลือกออเดอร์ / no orders picked'; t2RenderLoad(); return; }
  _t2Msg = '';
  var c = document.getElementById('of-newtour-chk');
  if (c) c.checked = _t2NewTour;
  ofSendTourAsk();                    // derselbe Tagesdialog wie im alten Tab
}

/* Eine Order im Pool. Tippen legt sie auf die Ladeliste. */
function t2OrderRow(o) {
  var m = t2Met(o), sm = T2_ST[o.status] || { l: o.status, bg: '#eee', c: '#555' };
  var on = ofSelOrders.indexOf(o.id) >= 0;
  var bits = [];
  if (m.ctn) bits.push('<b style="color:#16a34a">📦 ' + m.ctn + '</b>');
  if (m.bun) bits.push('<b style="color:#ea580c">🧶 ' + m.bun + '</b>');
  if (m.panels) bits.push('<span style="color:var(--text2)">' + t2n(m.panels) + ' pcs</span>');
  var note = [(o.reqNote || '').trim(), (o.notes || '').trim()].filter(Boolean).join(' · ');
  var age = ''; try { age = ofAgeBadge(o) || ''; } catch (e) {}
  return '<div class="t2ord' + (on ? ' on' : '') + '" data-oid="' + _esc(o.id) + '" onclick="t2Pick(this)">' +
    '<div style="flex:1;min-width:0">' +
      '<div class="t2ordtop">' +
        '<span style="font-size:12.5px;font-weight:800">' + _esc(o.id) + '</span>' +
        '<span class="t2tag" style="background:' + sm.bg + ';color:' + sm.c + '">' + sm.l + '</span>' +
        age +
        (o.date ? '<span class="t2dim">📅 ' + fmtD(o.date).slice(0, 5) + '</span>' : '') +
      '</div>' +
      '<div style="font-size:12px;font-weight:600;margin-top:2px">' + _esc(o.customer || '—') + '</div>' +
      (o.address && o.address !== '—' ? '<div class="t2dim">📍 ' + _esc(o.address) + '</div>' : '') +
      (bits.length ? '<div style="font-size:11px;margin-top:2px">' + bits.join(' · ') + '</div>' : '') +
      (note ? '<div class="t2dim" style="color:#b45309">📝 ' + _esc(note) + '</div>' : '') +
    '</div>' +
    '<div class="t2ordR">' +
      '<div style="font-size:13px;font-weight:900;white-space:nowrap">' + t2n(m.baht) + ' ฿</div>' +
      '<div class="t2tick">' + (on ? '✓' : '+') + '</div>' +
    '</div></div>';
}

function t2PoolHTML() {
  var pool = t2Pool(), shown = t2PlanFilt(pool);
  // Die Zonen-Chips zählen immer den GANZEN Pool — ein Filter darf nie verstecken,
  // wo die Arbeit liegt.
  var zAll = {};
  pool.forEach(function (o) { var z = o.zone || 'Unknown'; (zAll[z] = zAll[z] || []).push(o); });
  var rdyBaht = function (z) { return t2Sum(zAll[z].filter(function (o) { return o.status === 'ready'; })).baht; };
  var zKeys = Object.keys(zAll).sort(function (a, b) { return rdyBaht(b) - rdyBaht(a); });

  var zoneChips = '<div class="t2chips">' +
    '<button type="button" class="t2f' + (!_t2Zone ? ' on' : '') + '" onclick="t2SetZone(\'\')">ทั้งหมด / all <b>' + pool.length + '</b></button>' +
    zKeys.map(function (z) {
      return '<button type="button" class="t2f' + (_t2Zone === z ? ' on' : '') + '" style="border-left:3px solid ' + t2zc(z) + '" onclick="t2SetZone(\'' + z + '\')">' +
        z + ' <b>' + zAll[z].length + '</b> <span style="color:var(--text2);font-weight:700">' + t2n(t2Sum(zAll[z]).baht) + ' ฿</span></button>';
    }).join('') + '</div>';

  var stChips = '<div class="t2chips">' +
    ['ready', 'packing', 'new'].map(function (s) {
      var n = pool.filter(function (o) { return o.status === s; }).length;
      return '<button type="button" class="t2f' + (_t2St === s ? ' on' : '') + '" style="border-left:3px solid ' + T2_ST[s].c + '" onclick="t2SetSt(\'' + s + '\')">' + T2_ST[s].l + ' <b>' + n + '</b></button>';
    }).join('') +
    '<input type="text" class="t2q" id="t2-q" value="' + _esc(_t2Q) + '" oninput="t2Search(this.value)" placeholder="🔍 ค้นหา / search order, customer, phone…">' +
    '</div>';

  var zShown = {};
  shown.forEach(function (o) { var z = o.zone || 'Unknown'; (zShown[z] = zShown[z] || []).push(o); });
  var ord = { 'ready': 0, 'packing': 1, 'new': 2 };
  var blocks = zKeys.filter(function (z) { return zShown[z]; }).map(function (z) {
    var list = zShown[z].sort(function (a, b) {
      return (ord[a.status] - ord[b.status]) || String(a.date || '').localeCompare(String(b.date || ''));
    });
    var sAll = t2Sum(list), sRdy = t2Sum(list.filter(function (o) { return o.status === 'ready'; }));
    var pct = Math.min(100, Math.round(sRdy.baht / T2_TRUCK * 100));
    var full = sRdy.baht >= T2_TRUCK;
    var nSel = list.filter(function (o) { return ofSelOrders.indexOf(o.id) >= 0; }).length;
    return '<div class="t2zone" style="border-top:3px solid ' + t2zc(z) + '">' +
      '<div class="t2zh">' +
        '<div style="min-width:0">' +
          '<div style="font-size:13px;font-weight:800;color:' + t2zc(z) + '">' + z + '</div>' +
          '<div class="t2dim">' + list.length + ' orders · ' + (sAll.ctn ? '📦 ' + sAll.ctn + ' · ' : '') + (sAll.bun ? '🧶 ' + sAll.bun + ' · ' : '') + t2n(sAll.baht) + ' ฿</div>' +
        '</div>' +
        '<button type="button" class="t2mini" onclick="t2PickZone(\'' + z + '\')">' + (nSel === list.length ? '✕ เอาออก / clear' : '✓ ทั้งโซน / all') + '</button>' +
      '</div>' +
      '<div class="t2bar" title="พร้อมส่ง ' + t2n(sRdy.baht) + ' ฿ / ' + t2n(T2_TRUCK) + ' ฿"><span style="width:' + pct + '%;background:' + (full ? '#eab308' : t2zc(z)) + '"></span></div>' +
      '<div class="t2dim" style="padding:0 10px 7px">' + (full ? '🟡 เต็มคันแล้ว / truck-worthy · ' : '') + 'พร้อม / ready ' + t2n(sRdy.baht) + ' ฿</div>' +
      '<div>' + list.map(t2OrderRow).join('') + '</div>' +
    '</div>';
  }).join('');

  return zoneChips + stChips + (blocks || '<div class="t2empty">ไม่มีออเดอร์ / nothing to plan</div>');
}
function t2RenderPool() { var el = document.getElementById('t2-pool'); if (el) el.innerHTML = t2PoolHTML(); }

/* Die Ladeliste: was auf den LKW geht, wer fährt, abschicken. */
function t2LoadHTML() {
  var sel = ofSelOrders.map(function (id) { return (orders || []).find(function (x) { return x.id === id; }); }).filter(Boolean);
  var s = t2Sum(sel);
  var box = function (l, v, c) {
    return '<div class="t2box"><div class="t2boxl">' + l + '</div><div class="t2boxv" style="color:' + (c || 'var(--text)') + '">' + v + '</div></div>';
  };
  var et = ofSelDriver ? (activeTours || []).find(function (t) { return t.driverId === ofSelDriver; }) : null;
  var sendLbl = (!_t2NewTour && et && !et.driving) ? 'เพิ่มในทัวร์ / Add to tour'
              : (_t2NewTour && et) ? 'ส่งทัวร์ใหม่ / Send NEW tour'
              : 'ส่งให้คนขับ / Send to driver';

  var drvBtn = function (id, top, name, sub, cls) {
    return '<button type="button" class="t2drv' + (ofSelDriver === id ? ' on' : '') + (cls ? ' ' + cls : '') + '" data-did="' + _esc(id) + '" onclick="t2Drv(this)">' +
      '<span class="t2av">' + top + '</span><span class="t2dn">' + _esc(name) + '</span>' +
      (sub ? '<span class="t2ds">' + sub + '</span>' : '') + '</button>';
  };
  var drvHTML = drvBtn(TOUR_NODRIVER, '⏳', 'ยังไม่กำหนด', 'no driver yet') +
    (drivers || []).map(function (d) {
      var ht = (activeTours || []).find(function (t) { return t.driverId === d.id; });
      var sub = ht ? (ht.driving ? '<span style="color:#16a34a">🚚 กำลังส่ง</span>' : '<span style="color:#ea580c">กำลังโหลด</span>')
                   : (d.phone ? _esc(d.phone) : '');
      return drvBtn(d.id, initials(d.name), kpName(d.name), sub, ht ? 'ontour' : '');
    }).join('');

  return '<div class="t2loadin">' +
    '<div class="t2lh">🚛 ใบจัดของ / Load list' +
      (sel.length ? '<button type="button" class="t2mini" onclick="t2ClearSel()">✕ ล้าง / clear</button>' : '') + '</div>' +
    (sel.length === 0
      ? '<div class="t2empty" style="padding:18px 10px">แตะออเดอร์ทางซ้ายเพื่อใส่ในทัวร์<br><span style="color:var(--text3)">tap an order to load it</span></div>'
      : '<div class="t2boxes">' + box('ออเดอร์ / Orders', s.n) + box('📦 ลัง / CTN', s.ctn, '#16a34a') +
          (s.bun ? box('🧶 มัด / Bundle', s.bun, '#ea580c') : '') + box('ยอดรวม / Total', t2n(s.baht) + ' ฿', '#1d4ed8') + '</div>' +
        '<div class="t2sel">' + sel.map(function (o) {
          var m = t2Met(o);
          return '<div class="t2selrow"><span class="t2zd" style="background:' + t2zc(o.zone || 'Unknown') + '"></span>' +
            '<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700">' + _esc(o.id) + ' · ' + _esc(o.customer || '—') + '</div>' +
            '<div class="t2dim">' + (o.zone || '—') + (m.ctn ? ' · 📦 ' + m.ctn : '') + (m.bun ? ' · 🧶 ' + m.bun : '') + ' · ' + t2n(m.baht) + ' ฿</div></div>' +
            '<button type="button" class="t2x" data-oid="' + _esc(o.id) + '" onclick="t2Pick(this)">✕</button></div>';
        }).join('') + '</div>') +
    '<div class="t2lh" style="margin-top:10px">🧑‍✈️ คนขับ / Driver</div>' +
    '<div class="t2drvs">' + drvHTML + '</div>' +
    '<label class="t2chk"><input type="checkbox" ' + (_t2NewTour ? 'checked' : '') + ' onchange="t2NewToggle(this)"> ➕ แยกเป็นทัวร์ใหม่ / separate new tour</label>' +
    (_t2Msg ? '<div class="t2warn">' + _t2Msg + '</div>' : '') +
    '<button type="button" class="t2send' + (sel.length && ofSelDriver ? '' : ' off') + '" onclick="t2Send()">' + sendLbl + (sel.length ? ' · ' + sel.length : '') + '</button>' +
  '</div>';
}
function t2RenderLoad() { var el = document.getElementById('t2-load'); if (el) el.innerHTML = t2LoadHTML(); }

/* ── TOURS ───────────────────────────────────────────────────────────────── */
function t2TourToggle(tid) { _t2OpenTour[tid] = !_t2OpenTour[tid]; t2RenderBody(); }
function t2DrvFilt(v) { _t2DrvFilt = (_t2DrvFilt === v ? '' : v); t2RenderBody(); }
function t2Deliver(b) { ofTourDeliver(b.getAttribute('data-tid'), b.getAttribute('data-oid')); }
function t2Ship(b) { ofTourShip(b.getAttribute('data-tid'), b.getAttribute('data-oid')); }
function t2AllOpen(on) { (activeTours || []).forEach(function (t) { _t2OpenTour[t.id] = !!on; }); t2RenderBody(); }

function t2StopRow(t, id, i, ro) {
  var o = (orders || []).find(function (x) { return x.id === id; }) || { id: id, customer: '—', address: '—' };
  var st = tourEffStatus(t, id), m = t2Met(o);
  var meta = { 'delivered': { l: '✓ ส่งแล้ว / delivered',   bg: '#dcfce7', c: '#166534' },
               'shipped':   { l: '🚚 ส่งขนส่ง / at shipper', bg: '#dbeafe', c: '#1d4ed8' },
               'cancelled': { l: '✗ ยกเลิก / cancelled',    bg: '#fee2e2', c: '#b91c1c' } }[st]
            || { l: '→ กำลังไป / on route', bg: '#f1f5f9', c: '#475569' };
  var co = tourPayCO(t, o), pay = [];
  if (co.cash)    pay.push('<span style="color:#166534;font-weight:800">💵 ' + t2n(co.cash) + '</span>');
  if (co.online)  pay.push('<span style="color:#1d4ed8;font-weight:800">🏦 ' + t2n(co.online) + '</span>');
  if (co.unknown) pay.push('<span style="color:#92400e;font-weight:800">❓ ' + t2n(co.unknown) + '</span>');
  if (st === 'delivered' && !pay.length) pay.push('<span style="color:#b91c1c;font-weight:800">⏳ ค้าง / unpaid</span>');
  var done = (st === 'delivered' || st === 'shipped' || st === 'cancelled');
  var acts = ro ? '' : '<div class="t2sacts">' +
      (done ? '' : '<button type="button" class="t2b t2bg" data-tid="' + _esc(t.id) + '" data-oid="' + _esc(id) + '" onclick="t2Deliver(this)">✓ ส่งแล้ว / delivered</button>' +
                   '<button type="button" class="t2b t2bb" data-tid="' + _esc(t.id) + '" data-oid="' + _esc(id) + '" onclick="t2Ship(this)">🚚 ขนส่ง / shipper</button>') +
      '<button type="button" class="t2b t2br" data-tid="' + _esc(t.id) + '" data-oid="' + _esc(id) + '" onclick="rmFromTour(this)">✕</button>' +
    '</div>';
  return '<div class="t2stop' + (done ? ' done' : '') + '">' +
    '<span class="t2num">' + (i + 1) + '</span>' +
    '<div style="flex:1;min-width:0">' +
      '<div class="t2ordtop">' +
        '<span style="font-size:12.5px;font-weight:800">' + _esc(o.id) + '</span>' +
        '<span class="t2tag" style="background:' + meta.bg + ';color:' + meta.c + '">' + meta.l + '</span>' +
        '<span style="margin-left:auto;font-size:12.5px;font-weight:900;white-space:nowrap">' + t2n(m.baht) + ' ฿</span>' +
      '</div>' +
      '<div style="font-size:12px;font-weight:600;margin-top:1px">' + _esc(o.customer || '—') + '</div>' +
      (o.address && o.address !== '—' ? '<div class="t2dim">📍 ' + _esc(o.address) + '</div>' : '') +
      ((m.ctn || m.bun) ? '<div class="t2dim">' + (m.ctn ? '📦 ' + m.ctn + ' ' : '') + (m.bun ? '🧶 ' + m.bun : '') + '</div>' : '') +
      (pay.length ? '<div style="font-size:11px;margin-top:2px;display:flex;gap:8px;flex-wrap:wrap">' + pay.join('') + '</div>' : '') +
      acts +
    '</div></div>';
}

function t2TourCard(t) {
  var ti = (activeTours || []).indexOf(t), ro = !!window.ofReadOnly;
  var p = t2TourProg(t), mon = t2TourMoney(t);
  var s = t2Sum((t.orders || []).map(function (id) { return (orders || []).find(function (x) { return x.id === id; }); }).filter(Boolean));
  var open = !!_t2OpenTour[t.id];
  var slipO = [], slipDone = 0, slipFlag = 0;
  try {
    slipO = ofTourSlipOrders(t) || [];
    slipDone = slipO.filter(function (o) { return o.slipReview && o.slipReview.status; }).length;
    slipFlag = slipO.filter(function (o) { return o.slipReview && o.slipReview.status === 'flag'; }).length;
  } catch (e) {}
  var when = (!t.driving && !t.departedAt)
    ? (ro ? '<span class="t2dim">⏳ ยังไม่ออก / not out yet</span>'
          : '<button type="button" class="t2b t2ba" onclick="ofSetDeparted(' + ti + ')">🚀 ออกรถ / Departed</button>')
    : tourWhenHtml(t);
  var money = [];
  if (mon.cash)    money.push('<span style="color:#166534">💵 ' + t2n(mon.cash) + ' ฿</span>');
  if (mon.online)  money.push('<span style="color:#1d4ed8">🏦 ' + t2n(mon.online) + ' ฿</span>');
  if (mon.unknown) money.push('<span style="color:#92400e">❓ ' + t2n(mon.unknown) + ' ฿</span>');
  if (!money.length) money.push('<span style="color:var(--text3)">💵 0 ฿</span>');
  var note = ''; try { note = tourNoteOf(t) ? '<span title="โน้ตออฟฟิศ / office note">📝</span>' : ''; } catch (e) {}
  var phone = ''; try { phone = drvPhoneTag(t.driverName, t.driverId, t.driverPhone) || ''; } catch (e) {}

  var acts = '<div class="t2acts">' +
    '<button type="button" class="t2b t2bb" onclick="openTourDetail(' + ti + ')">📋 รายละเอียด / Detail</button>' +
    '<button type="button" class="t2b t2bt" onclick="ofTourMap(\'' + _esc(t.id) + '\')">🌐 Map</button>' +
    '<button type="button" class="t2b t2bg" onclick="currentTourDetailIdx=' + ti + ';printDeliverySheet()">🖨 ใบส่งของ / Sheet</button>' +
    '<button type="button" class="t2b t2bb" onclick="printTourReceipts(' + ti + ')">🧾 ใบเสร็จ / Receipts</button>' +
    (ro ? '' : '<button type="button" class="t2b t2bc" onclick="ofAddOrderToTour(\'' + _esc(t.id) + '\')">➕ Add</button>') +
    (!ro && slipO.length ? '<button type="button" class="t2b" style="background:' + (slipFlag ? '#dc2626' : (slipDone < slipO.length ? '#d97706' : '#16a34a')) + ';color:#fff;border-color:transparent" onclick="ofReviewTourSlips(\'' + _esc(t.id) + '\')">🧾 Slips ' + slipDone + '/' + slipO.length + (slipFlag ? ' ⚠' : '') + '</button>' : '') +
    (!ro && !ofIsLala(t) ? '<button type="button" class="t2b t2bb" onclick="ofTourSettle(\'' + _esc(t.id) + '\')">🧮 ปิดยอด / Settle</button>' : '') +
    (ofIsLala(t) ? '<button type="button" class="t2b t2bc" onclick="openLalaInfo(\'' + _esc(t.id) + '\')">🛺 ข้อมูลคนขับ / Info</button>' : '') +
  '</div>';

  return '<div class="t2tour' + (t.driving ? ' driving' : '') + '">' +
    '<div class="t2th" onclick="t2TourToggle(\'' + _esc(t.id) + '\')">' +
      '<span class="t2chev">' + (open ? '▾' : '▸') + '</span>' +
      (tidOk(t.tid) ? '<span class="t2tid">' + t.tid + '</span>' : '') +
      '<span class="t2drvn">🚚 ' + _esc(kpName(t.driverName) || '—') + '</span>' + phone + note +
      '<span class="t2pill">📦 ' + p.total + '</span>' +
    '</div>' +
    '<div class="t2trow">' + when + '<span style="margin-left:auto;display:flex;gap:9px;font-size:11.5px;font-weight:800;flex-wrap:wrap">' + money.join('') + '</span></div>' +
    '<div class="t2bar t2barw"><span style="width:' + p.pct + '%;background:var(--green)"></span></div>' +
    '<div class="t2trow t2dim">' +
      '<span>' + (s.ctn ? '📦 ' + s.ctn + ' CTN ' : '') + (s.bun ? '🧶 ' + s.bun + ' มัด' : '') + '</span>' +
      '<span style="margin-left:auto">' + (p.open > 0 ? '<b style="color:#b45309">⏳ ' + p.open + ' ค้าง / open</b>' : '<b style="color:var(--green)">✓ ครบ / all done</b>') + ' · ' + p.pct + '%</span>' +
    '</div>' +
    (open ? '<div class="t2stops">' + (t.orders || []).map(function (id, i) { return t2StopRow(t, id, i, ro); }).join('') + acts + '</div>' : '') +
  '</div>';
}

function t2ToursHTML() {
  var list = (activeTours || []).slice();
  if (!list.length) return '<div class="t2empty">ยังไม่มีทัวร์ / no active tours</div>';
  var names = [];
  list.forEach(function (t) { var n = t.driverName || '—'; if (names.indexOf(n) < 0) names.push(n); });
  if (_t2DrvFilt && names.indexOf(_t2DrvFilt) < 0) _t2DrvFilt = '';
  var chips = names.length > 1 ? '<div class="t2chips">' +
    '<button type="button" class="t2f' + (!_t2DrvFilt ? ' on' : '') + '" onclick="t2DrvFilt(\'\')">ทั้งหมด / all <b>' + list.length + '</b></button>' +
    names.map(function (n) {
      var c = list.filter(function (t) { return (t.driverName || '—') === n; });
      var dv = c.some(function (t) { return t.driving; });
      return '<button type="button" class="t2f' + (_t2DrvFilt === n ? ' on' : '') + '" onclick="t2DrvFilt(\'' + String(n).replace(/['\\]/g, '') + '\')">🚚 ' + _esc(kpName(n)) + (dv ? ' <span style="color:#16a34a">●</span>' : '') + ' <b>' + c.length + '</b></button>';
    }).join('') + '</div>' : '';
  var show = _t2DrvFilt ? list.filter(function (t) { return (t.driverName || '—') === _t2DrvFilt; }) : list;
  var lala = show.filter(ofIsLala), rest = show.filter(function (t) { return !ofIsLala(t); });
  var allOpen = show.length > 0 && show.every(function (t) { return _t2OpenTour[t.id]; });
  var bar = '<div class="t2chips"><button type="button" class="t2f" onclick="t2AllOpen(' + (allOpen ? 'false' : 'true') + ')">' +
    (allOpen ? '▴ ย่อทั้งหมด / collapse all' : '▾ กางทั้งหมด / expand all') + '</button></div>';
  return chips + bar + '<div class="t2tours">' +
    (lala.length ? '<div class="t2grp">🛺 Lalamove</div>' + lala.map(t2TourCard).join('') : '') +
    (rest.length ? (lala.length ? '<div class="t2grp">🚚 Tours</div>' : '') + rest.map(t2TourCard).join('') : '') +
  '</div>';
}

/* ── MONEY ───────────────────────────────────────────────────────────────── */
function t2MoneyHTML() {
  var rows = (activeTours || []).map(function (t) {
    var m = t2TourMoney(t), net = 0;
    try { net = tourNetPay(t); } catch (e) {}
    var paid = (t.payMethodTour === 'cash') || ((t.carFeeSlips || []).length > 0);
    var left = Math.max(0, m.cash - net);
    return '<div class="t2mrow">' +
      '<div class="t2mh">' + (tidOk(t.tid) ? '<span class="t2tid">' + t.tid + '</span>' : '') +
        '<span style="font-weight:800;font-size:13px">🚚 ' + _esc(kpName(t.driverName) || '—') + '</span>' +
        (paid ? '<span class="t2paid">✓ จ่ายแล้ว / paid</span>' : '') + '</div>' +
      '<div class="t2mgrid">' +
        '<div><div class="t2boxl">💵 เงินสด / cash</div><div class="t2boxv" style="color:#166534">' + t2n(m.cash) + '</div></div>' +
        '<div><div class="t2boxl">🏦 โอน / online</div><div class="t2boxv" style="color:#1d4ed8">' + t2n(m.online) + '</div></div>' +
        '<div><div class="t2boxl">🧑‍✈️ ค่าทัวร์ / pay</div><div class="t2boxv" style="color:#b45309">' + t2n(net) + '</div></div>' +
        '<div><div class="t2boxl">= เข้าออฟฟิศ / to office</div><div class="t2boxv">' + t2n(left) + '</div></div>' +
      '</div>' +
      (window.ofReadOnly ? '' : '<div class="t2acts">' +
        (ofIsLala(t) ? '' : '<button type="button" class="t2b t2bb" onclick="ofTourSettle(\'' + _esc(t.id) + '\')">🧮 ปิดยอด / Settle up</button>') +
        '<button type="button" class="t2b ' + (paid ? 't2bg' : 't2bc') + '" onclick="ofTourPayCash(\'' + _esc(t.id) + '\')">💵 ' + (paid ? 'จ่ายแล้ว / paid' : 'จ่ายเงินสด / pay cash') + '</button>' +
      '</div>') +
    '</div>';
  }).join('');
  return '<div class="t2sec">💰 ทัวร์ที่กำลังวิ่ง / running tours</div>' +
    (rows || '<div class="t2empty">—</div>') +
    '<div class="t2sec" style="margin-top:14px">💸 ค้างจ่ายคนขับ / driver payouts</div>' +
    '<div id="t2-unpaid-host"></div>';
}

/* ── Gerüst ──────────────────────────────────────────────────────────────── */
function t2RenderBody() {
  var b = document.getElementById('t2-body');
  if (!b) return;
  // IMMER zuerst zurückgeben. Ein geliehener Block liegt in t2-body drin, und
  // das nächste innerHTML würde ihn sonst wegwerfen statt nach Hause zu schicken —
  // dann wäre er auch im alten Tour-Tab weg, bis die Seite neu lädt.
  t2Release();
  if (_t2Sub === 'plan') {
    b.innerHTML = '<div id="t2-plan"><div id="t2-pool"></div><div id="t2-load"></div></div>';
    t2RenderPool(); t2RenderLoad();
    return;
  }
  if (_t2Sub === 'tours') { b.innerHTML = t2ToursHTML(); return; }
  if (_t2Sub === 'money') {
    b.innerHTML = t2MoneyHTML();
    try { ofRenderUnpaid(); } catch (e) {}
    t2Adopt('of-unpaid-wrap', 't2-unpaid-host');
    return;
  }
  b.innerHTML = '<div id="t2-ids-host"></div>';
  try { ofRenderTourIds(); } catch (e) {}
  t2Adopt('of-tourid-wrap', 't2-ids-host');
}
function t2Render() {
  if (!document.getElementById('ofv-tour2')) return;
  var s = document.getElementById('t2-strip'); if (s) s.innerHTML = t2Strip();
  var n = document.getElementById('t2-subtabs'); if (n) n.innerHTML = t2SubBar();
  t2RenderBody();
}
/* Wer den neuen Tab sieht, solange er gebaut wird. */
function t2TabInit() {
  var b = document.getElementById('oft-tour2');
  if (!b) return;
  var on = false;
  try {
    if (/[?&]tour2=1/.test(location.search)) localStorage.setItem('kp_t2', '1');
    if (/[?&]tour2=0/.test(location.search)) localStorage.removeItem('kp_t2');
    on = localStorage.getItem('kp_t2') === '1' || /andr/i.test(ofWho() || '');
  } catch (e) {}
  b.style.display = on ? '' : 'none';
}

/* ── die einzigen zwei Haken in die alte App ─────────────────────────────── */
(function () {
  var _oft = window.oft;
  window.oft = function (t) {
    if (t !== 'tour2') t2Release();                    // geliehene Blöcke zurückgeben
    var r = _oft.apply(this, arguments);
    try { t2TabInit(); } catch (e) {}
    if (t === 'tour2') { try { t2Render(); } catch (e) {} }
    return r;
  };
  var _rt = window.ofRenderTour;
  window.ofRenderTour = function () {
    var r = _rt.apply(this, arguments);
    try { if (t2Active()) t2Render(); } catch (e) {}   // gleiche Daten → beide Ansichten im Takt
    return r;
  };
  try { t2TabInit(); } catch (e) {}
})();
