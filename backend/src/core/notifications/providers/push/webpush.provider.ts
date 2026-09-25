import * as webpush from 'web-push';
import type { PushProvider, PushSubscriptionTarget, SendResult, TestResult } from '../provider.interface';

export const WebPushProvider: PushProvider = {
  id: 'webpush',
  name: 'Web Push (VAPID)',

  generateVapidKeys() {
    return webpush.generateVAPIDKeys();
  },

  async send(
    subscription: PushSubscriptionTarget,
    payload: Record<string, unknown>,
    config: Record<string, unknown>,
    credentials: Record<string, unknown>,
  ): Promise<SendResult & { expired?: boolean }> {
    const subject = String(config.vapidSubject ?? 'mailto:notifications@doers-os.internal').trim();
    const publicKey = String(config.vapidPublicKey ?? '').trim();
    const privateKey = String(credentials.vapidPrivateKey ?? credentials.privateKey ?? '').trim();

    if (!publicKey || !privateKey) {
      return { success: false, error: 'VAPID keys are not configured' };
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);

      const pushPayload = JSON.stringify(payload);
      const pushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dhKey,
          auth: subscription.authKey,
        },
      };

      await webpush.sendNotification(pushSubscription, pushPayload);
      return { success: true };
    } catch (err: any) {
      const statusCode = err.statusCode || err.status;
      // 404 or 410 indicates the client unsubscribed or the endpoint has expired
      if (statusCode === 404 || statusCode === 410) {
        return {
          success: false,
          expired: true,
          error: `Subscription endpoint no longer active (${statusCode})`,
        };
      }
      return {
        success: false,
        error: err.message ?? `Web push error (${statusCode})`,
      };
    }
  },

  async test(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<TestResult> {
    const subject = String(config.vapidSubject ?? '').trim();
    const publicKey = String(config.vapidPublicKey ?? '').trim();
    const privateKey = String(credentials.vapidPrivateKey ?? credentials.privateKey ?? '').trim();

    if (!publicKey || !privateKey) {
      return { success: false, message: 'Both VAPID Public Key and Private Key are required' };
    }

    if (!subject.startsWith('mailto:') && !subject.startsWith('http')) {
      return { success: false, message: 'VAPID Subject must start with mailto: or https://' };
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      return {
        success: true,
        message: 'VAPID configuration is cryptographically valid and active!',
      };
    } catch (err: any) {
      return { success: false, message: `VAPID verification failed: ${err.message}` };
    }
  },
};
