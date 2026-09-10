import { ConnectorProvider } from './provider.interface';

export const TrelloProvider: ConnectorProvider = {
  id: 'trello',
  name: 'Trello',
  description: 'Manage boards, lists, and cards on Trello',
  icon: 'trello',
  defaultBaseUrl: 'https://api.trello.com/1',

  fields: [
    {
      key: 'apiKey',
      label: 'Developer API Key',
      type: 'text',
      required: true,
      secret: true,
      placeholder: '32-character API key from trello.com/app-key',
      helpText: 'Get your developer API key from https://trello.com/app-key',
    },
    {
      key: 'token',
      label: 'User Access Token',
      type: 'password',
      required: true,
      secret: true,
      placeholder: 'User authorization token',
      helpText: 'Generate your token from the link at https://trello.com/app-key',
    },
    {
      key: 'secret',
      label: 'OAuth / Webhook Secret (optional)',
      type: 'password',
      required: false,
      secret: true,
      placeholder: 'Optional OAuth 1.0 secret',
      helpText: 'Used for OAuth 1.0 signing or verifying X-Trello-Webhook signatures',
    },
  ],

  decorateRequest(creds, req) {
    const key = String(creds.apiKey || '').trim();
    const token = String(creds.token || '').trim();
    if (key) req.url.searchParams.set('key', key);
    if (token) req.url.searchParams.set('token', token);
  },

  async test(creds, baseUrl) {
    const key = String(creds.apiKey || '').trim();
    const token = String(creds.token || '').trim();
    if (!key || !token) {
      return { success: false, message: 'Developer API Key and User Token are required.' };
    }

    const targetUrl = new URL(`${baseUrl.replace(/\/+$/, '')}/members/me`);
    targetUrl.searchParams.set('key', key);
    targetUrl.searchParams.set('token', token);

    const start = Date.now();
    try {
      const res = await fetch(targetUrl.toString());
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return {
          success: false,
          latencyMs,
          statusCode: res.status,
          message: `Trello returned HTTP ${res.status}: ${res.statusText || 'Unauthorized'}`,
        };
      }
      const data = (await res.json()) as { fullName?: string; username?: string };
      const identity = data.fullName || data.username || 'User';
      return {
        success: true,
        latencyMs,
        statusCode: res.status,
        message: `Connected to Trello as ${identity} (@${data.username ?? ''})`,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: `Trello connection failed: ${err instanceof Error ? err.message : 'Network error'}`,
      };
    }
  },

  maskPreview(creds) {
    const key = String(creds.apiKey || '').trim();
    const token = String(creds.token || '').trim();
    const maskedKey = key.length > 6 ? `${key.slice(0, 4)}••••` : '••••';
    const maskedToken = token.length > 8 ? `${token.slice(0, 4)}••••${token.slice(-4)}` : '••••';
    return `Key: ${maskedKey} | Token: ${maskedToken}`;
  },
};
