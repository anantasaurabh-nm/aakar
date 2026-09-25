// DoersOS PWA Service Worker for Web Push & Background Notifications

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || 'DoersOS Notification';
    const options = {
      body: payload.body || '',
      icon: payload.icon || '/favicon.ico',
      badge: payload.badge || '/favicon.ico',
      tag: payload.notification_id || undefined,
      data: payload.data || {},
      actions: payload.actions
        ? payload.actions.map((act) => ({
            action: act.id,
            title: act.label,
          }))
        : undefined,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('[SW] Push processing error:', err);
    event.waitUntil(
      self.registration.showNotification('DoersOS Notification', {
        body: event.data.text(),
        icon: '/favicon.ico',
      }),
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = '/';

  if (data.url) {
    targetUrl = data.url;
  } else if (data.source && data.source.module) {
    targetUrl = `/app/${data.source.module}`;
    if (data.source.id) {
      targetUrl += `?record=${data.source.id}`;
    }
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url && 'focus' in client) {
            return client.navigate(targetUrl).then(() => client.focus());
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
