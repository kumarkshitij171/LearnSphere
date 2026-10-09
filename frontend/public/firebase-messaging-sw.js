/* global importScripts, firebase */
// Background push for LearnSphere. The Firebase web config arrives in this script's URL
// (lib/push.ts), because a service worker cannot read the app's build-time environment.
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

const config = JSON.parse(new URL(self.location.href).searchParams.get('config') || '{}');

if (config.apiKey) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  // Data-only fallbacks; messages with a `notification` block are shown by FCM itself.
  messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return;
    const title = (payload.data && payload.data.title) || 'LearnSphere';
    self.registration.showNotification(title, {
      body: (payload.data && payload.data.body) || '',
      data: { link: payload.data && payload.data.link },
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/dashboard';
  event.waitUntil(self.clients.openWindow(link));
});
