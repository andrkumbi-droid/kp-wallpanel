/* KP Push-Relay — echte Push-Nachrichten aufs Handy, auch wenn die App zu ist (ohne Blaze).
 *
 * Die Apps (KP-App, Sales-Portal) schreiben jede Benachrichtigung nach <season>/pushQueue.
 * Bisher hat sie niemand verschickt — offene Apps zeigten sie nur selbst an. Dieses Skript
 * laeuft jede Minute, liest die Warteschlange, schickt jeden neuen Eintrag ueber Firebase
 * Cloud Messaging (HTTP v1) an die Geraete der Zielgruppe und loescht ihn danach.
 * Laeuft unter Andres Google-Konto (Projekt-Inhaber) — kein Schluessel, kein Server, gratis.
 *
 * Ziele:   role 'office'   → <season>/fcmTokens/office/*  + <season>/fcmTokens/salesOwner/*
 *          role 'partner'  → <season>/sales/pushTokens/<uid>/*   (uid steht im Eintrag)
 *          andere Rollen   → <season>/fcmTokens/<role>/*          (nur wenn RELAY_ALL = true)
 *
 * Einrichtung (einmalig): Projekt anlegen, diese Datei + appsscript.json (siehe unten)
 * einfuegen, Funktion setup() ausfuehren und die Berechtigung erlauben.
 *
 * appsscript.json:
 * {
 *   "timeZone": "Asia/Bangkok",
 *   "runtimeVersion": "V8",
 *   "exceptionLogging": "STACKDRIVER",
 *   "oauthScopes": [
 *     "https://www.googleapis.com/auth/script.external_request",
 *     "https://www.googleapis.com/auth/script.scriptapp",
 *     "https://www.googleapis.com/auth/firebase.database",
 *     "https://www.googleapis.com/auth/firebase.messaging",
 *     "https://www.googleapis.com/auth/userinfo.email"
 *   ]
 * }
 */
var DB = 'https://kp-wallpanel-default-rtdb.asia-southeast1.firebasedatabase.app';
var PROJECT = 'kp-wallpanel';
var SEASONS = ['v2', 'lagertest'];   // lagertest = Testmodus des Sales-Portals
// false: nur Sales-Hinweise (Partner-Chat, Partner-Orders, Belege) gehen raus.
// true:  auch alle Hinweise der KP-App (neue Order, geliefert, Tour …) an Buero/Lager/Fahrer.
var RELAY_ALL = false;
var MAX_AGE_MS = 30 * 60 * 1000;     // aeltere Eintraege werden nur noch aufgeraeumt

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('relay').timeBased().everyMinutes(1).create();
  relay();
  Logger.log('Push-Relay laeuft jede Minute.');
}

function relay() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try { SEASONS.forEach(relaySeason); } finally { lock.releaseLock(); }
}

function rtdb(path, method, body, query) {
  var url = DB + '/' + path + '.json' + (query ? '?' + query : '');
  var opt = { method: method || 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
  if (body !== undefined) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
  var res = UrlFetchApp.fetch(url, opt);
  if (res.getResponseCode() >= 300) throw new Error('RTDB ' + res.getResponseCode() + ' ' + path + ': ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText() || 'null');
}

function relaySeason(season) {
  var q = rtdb(season + '/pushQueue', 'get', undefined, 'orderBy=%22$key%22&limitToFirst=60');
  if (!q) return;
  var now = Date.now(), del = {}, tokenCache = {};
  Object.keys(q).forEach(function (id) {
    var n = q[id] || {};
    del[id] = null;                                            // jeder Eintrag wird nur einmal angefasst
    if (n.delivered === true) return;
    if (!(n.ts > now - MAX_AGE_MS)) return;                    // zu alt → nur aufraeumen
    var isSales = (n.data && n.data.tag === 'sales') || n.role === 'partner';
    if (!isSales && !RELAY_ALL) return;
    var targets = tokensFor(season, n, tokenCache);
    var link = n.role === 'partner' || isSales ? 'https://kp-sales.web.app/' + (season === 'lagertest' ? '?test=1' + (n.role === 'office' ? '&owner' : '') : (n.role === 'office' ? '?owner' : ''))
                                              : 'https://andrkumbi-droid.github.io/kp-wallpanel/';
    targets.forEach(function (t) { send(t, n, link); });
  });
  rtdb(season + '/pushQueue', 'patch', del);
}

// [{token, path}] for one queue entry — path is where the token lives (removed when dead)
function tokensFor(season, n, cache) {
  var lists = [];
  if (n.role === 'partner') {
    if (!/^[A-Za-z0-9_]{1,128}$/.test(String(n.uid || ''))) return [];
    lists.push(['sales/pushTokens/' + n.uid, true]);
  } else if (n.role === 'office') {
    lists.push(['fcmTokens/office', false]); lists.push(['fcmTokens/salesOwner', true]);
  } else if (/^[A-Za-z0-9_]{1,80}$/.test(String(n.role || ''))) {
    lists.push(['fcmTokens/' + n.role, false]);
  }
  var out = [], seen = {};
  lists.forEach(function (l) {
    var key = season + '/' + l[0];
    if (!(key in cache)) { try { cache[key] = rtdb(key) || {}; } catch (e) { cache[key] = {}; } }
    var v = cache[key];
    Object.keys(v).forEach(function (k) {
      var tok = v[k] && v[k].token;
      if (tok && !seen[tok]) { seen[tok] = 1; out.push({ token: tok, path: key + '/' + k }); }
    });
  });
  return out;
}

// Data-only message: both service workers draw the notification themselves (no duplicates).
function send(t, n, link) {
  var msg = { message: { token: t.token,
    data: { title: String(n.title || 'KP Wallpanel').slice(0, 120), body: String(n.body || '').slice(0, 300),
            tag: String((n.data && n.data.tag) || 'kp'), url: link },
    webpush: { headers: { Urgency: 'high', TTL: '3600' }, fcm_options: { link: link } } } };
  var res = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + PROJECT + '/messages:send', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, payload: JSON.stringify(msg) });
  var code = res.getResponseCode(), txt = res.getContentText();
  if (code === 404 || (code === 400 && /UNREGISTERED|INVALID_ARGUMENT|registration-token/i.test(txt))) {
    try { rtdb(t.path, 'delete'); } catch (e) {}              // Geraet abgemeldet → Token weg
  } else if (code >= 300) {
    Logger.log('FCM ' + code + ': ' + txt.slice(0, 300));
  }
}

// Zum Ausprobieren im Editor: schickt einen Test an alle Buero-Geraete (v2).
function testOffice() {
  rtdb('v2/pushQueue', 'post', { role: 'office', title: '🔔 Test Push-Relay', body: 'Wenn du das siehst, funktionieren Push-Nachrichten.', data: { tag: 'sales' }, ts: Date.now(), delivered: false });
  relay();
}
