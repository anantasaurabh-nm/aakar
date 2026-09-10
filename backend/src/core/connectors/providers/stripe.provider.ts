import { ConnectorProvider } from './provider.interface';

export const StripeProvider: ConnectorProvider = {
  id: 'stripe',
  name: 'Stripe',
  description: 'Payments, subscriptions, invoices, and customers',
  icon: 'credit-card',
  defaultBaseUrl: 'https://api.stripe.com/v1',

  fields: [
    {
      key: 'secretKey',
      label: 'Secret API Key',
      type: 'password',
      required: true,
      secret: true,
      placeholder: 'sk_live_... or sk_test_...',
      helpText: 'Obtain from dashboard.stripe.com/apikeys',
    },
  ],

  decorateRequest(creds, req) {
    const key = String(creds.secretKey || '').trim();
    if (key) req.headers['Authorization'] = `Bearer ${key}`;
  },

  async test(creds, baseUrl) {
    const key = String(creds.secretKey || '').trim();
    if (!key) return { success: false, message: 'Stripe secret key is required.' };

    const targetUrl = `${baseUrl.replace(/\/+$/, '')}/balance`;
    const start = Date.now();
    try {
      const res = await fetch(targetUrl, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return {
          success: false,
          latencyMs,
          statusCode: res.status,
          message: `Stripe returned HTTP ${res.status}: ${res.statusText || 'Unauthorized'}`,
        };
      }
      return {
        success: true,
        latencyMs,
        statusCode: res.status,
        message: 'Stripe balance endpoint verified successfully.',
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: `Stripe connection failed: ${err instanceof Error ? err.message : 'Network error'}`,
      };
    }
  },

  maskPreview(creds) {
    const key = String(creds.secretKey || '').trim();
    if (key.startsWith('sk_')) {
      return `sk_••••••••${key.slice(-4)}`;
    }
    return key.length > 8 ? `${key.slice(0, 3)}••••••••${key.slice(-4)}` : '••••••••';
  },
};
