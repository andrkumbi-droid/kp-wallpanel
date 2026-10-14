/* KP Sales — service worker. Shows system notifications on phones (Android Chrome refuses
   `new Notification()` without one), receives real push messages from the push relay
   (Apps Script → Firebase Cloud Messaging, also when the app is closed) and brings the
   app back when a notification is tapped. No caching: every load is fresh. */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: "AIzaSyBhUzwMR28dvulez9q6AZ4gZS80Y9VK0qQ",
  authDomain: "kp-wallpanel.firebaseapp.com",
  databaseURL: "https://kp-wallpanel-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "kp-wallpanel",
  storageBucket: "kp-wallpanel.firebasestorage.app",
  messagingSenderId: "794246593779",
  appId: "1:794246593779:web:703fc0a4ba89ba58734b86"
});
var ICON = 'https://andrkumbi-droid.github.io/kp-wallpanel/pos-icon-192.png';
firebase.messaging().onBackgroundMessage(function(payload){
  var d = payload.data || {}, n = payload.notification || {};
  return self.registration.showNotification(d.title || n.title || 'KP Sales', {
    body: d.body || n.body || '', tag: d.tag || 'kp-sales', renotify: true, icon: ICON, badge: ICON,
    data: { url: d.url || './' }
  });
});
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(list){
    for(var i=0;i<list.length;i++){ if(list[i].url.indexOf('kp-sales')>=0 && 'focus' in list[i]) return list[i].focus(); }
    if(self.clients.openWindow) return self.clients.openWindow(url);
  }));
});
