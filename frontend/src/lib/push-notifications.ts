import { apiClient } from './api-client';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushNotificationSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    return registration;
  } catch (err) {
    console.warn('Service worker registration failed:', err);
    return null;
  }
}

export async function subscribeToPushNotifications(): Promise<{ success: boolean; message?: string }> {
  if (!isPushNotificationSupported()) {
    return { success: false, message: 'Push notifications are not supported by this browser.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { success: false, message: 'Notification permission was denied or dismissed.' };
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    return { success: false, message: 'Could not register PWA service worker.' };
  }

  try {
    const { publicKey } = (await apiClient.get('actions/notifications/vapid-public-key')) as { publicKey: string };
    if (!publicKey) {
      return { success: false, message: 'VAPID public key not configured on server.' };
    }

    const applicationServerKey = urlBase64ToUint8Array(publicKey) as unknown as BufferSource;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      return { success: false, message: 'Failed to generate browser push subscription keys.' };
    }

    await apiClient.post('actions/notifications/push-subscriptions', {
      endpoint: subJson.endpoint,
      keys: {
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
      },
      userAgent: navigator.userAgent,
    });

    return { success: true, message: 'Push notifications enabled successfully!' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to subscribe to push notifications.' };
  }
}

export async function unsubscribeFromPushNotifications(): Promise<{ success: boolean; message?: string }> {
  if (!isPushNotificationSupported()) return { success: false };

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await apiClient.post('actions/notifications/push-subscriptions/unregister', {
        endpoint: subscription.endpoint,
      });
      await subscription.unsubscribe();
    }
    return { success: true, message: 'Push notifications disabled.' };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}
