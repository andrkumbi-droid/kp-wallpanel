// KP Wallpanel service worker.
//
// BUILD must go up with EVERY deploy, together with KP_BUILD in index.html. The browser
// only starts a service-worker update when the bytes of THIS file change, and that
// update is the only handle we have on a tab that has been open since before the
// deploy: such a tab runs code that knows nothing about the new build, so it can not
// reload itself and nothing sent through Firebase reaches it.
//
// The browser fetches this file again on any navigation in scope, and — for a worker it
// has not checked in 24 hours — on ordinary fetch events too. So a device that is simply
// left running picks the new build up by itself within a day, and one where somebody
// opens the app picks it up at once.
const BUILD = 20260901022;
const CACHE = 'kp-' + BUILD;
const SHELL = [
  '/kp-wallpanel/',
  '/kp-wallpanel/index.html'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { return c.addAll(SHELL); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil((async function() {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function(k){ return k !== CACHE; })
                          .map(function(k){ return caches.delete(k); }));
    await self.clients.claim();

    // Tell every open window that a new build is live — and leave it at that.
    // Until 06.08.2026 this worker navigated every window that did not answer, so a
    // deploy in the middle of the working day pulled the page away under everybody at
    // once. Now the window only raises its blue "new version" bar; the person in front
    // of it reloads when it suits them (F5 / the round KP button). One reload still
    // goes out unasked, and only because somebody pressed it: "Reload all devices" in
    // Management → Audit Log.
    // The price: a tab left open keeps running old code until somebody refreshes it —
    // that is a deliberate trade, not an oversight.
    const wins = await self.clients.matchAll({ type: 'window' });
    if (!wins.length) return;
    wins.forEach(function(c) { try { c.postMessage({ type: 'kp-newbuild', build: BUILD }); } catch(err) {} });
  })());
});

self.addEventListener('fetch', function(e) {
  // Only handle GET requests for our own pages
  if(e.request.method !== 'GET') return;
  var url = e.request.url;

  // Firebase / CDN requests — network only, no cache
  if(url.indexOf('firebasedatabase.app')>=0 || url.indexOf('googleapis.com')>=0 ||
     url.indexOf('gstatic.com')>=0 || url.indexOf('jsdelivr')>=0 || url.indexOf('tabler')>=0) {
    e.respondWith(
      fetch(e.request).catch(function() { return new Response('', {status: 503}); })
    );
    return;
  }

  // Never cache the worker itself — a stale copy here would stop every future update.
  if(url.indexOf('/sw.js')>=0) return;

  // App shell — NETWORK FIRST so the latest deployed code always loads when
  // online; fall back to cache only when offline. (Previously cache-first,
  // which served stale code for one reload after every deploy.)
  e.respondWith(
    fetch(e.request).then(function(res) {
      if(res && res.status === 200) {
        var clone = res.clone();
        caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
      }
      return res;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
