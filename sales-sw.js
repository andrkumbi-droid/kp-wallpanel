/* KP Sales — minimal service worker. It only exists so the page can show system
   notifications on phones (Android Chrome refuses `new Notification()` without one)
   and so tapping a notification brings the app back. No caching: every load is fresh. */
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(list){
    for(var i=0;i<list.length;i++){ if('focus' in list[i]) return list[i].focus(); }
    if(self.clients.openWindow) return self.clients.openWindow('./');
  }));
});
