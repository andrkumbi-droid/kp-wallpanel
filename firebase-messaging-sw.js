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

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage(function(payload) {
  const n = payload.notification || {};
  const data = payload.data || {};
  self.registration.showNotification(n.title || 'KP Wallpanel', {
    body: n.body || '',
    icon: data.icon || '/kp-wallpanel/icon-192.png',
    badge: '/kp-wallpanel/icon-192.png',
    tag: data.tag || 'kp-notif',
    data: { url: data.url || '/kp-wallpanel/' }
  });
});

// Click on notification → open app
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/kp-wallpanel/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf('kp-wallpanel') >= 0 && 'focus' in list[i]) {
          return list[i].focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
