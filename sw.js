const CACHE = 'kp-v1';
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
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){ return k!==CACHE; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
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

  // App shell — cache first, network fallback
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var network = fetch(e.request).then(function(res) {
        if(res && res.status === 200) {
          var clone = res.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
        }
        return res;
      }).catch(function(){ return cached; });
      return cached || network;
    })
  );
});
