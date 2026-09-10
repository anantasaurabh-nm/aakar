import { ConnectorProvider } from './provider.interface';

export const SlackProvider: ConnectorProvider = {
  id: 'slack',
  name: 'Slack',
  description: 'Team messaging, channel alerts, and bot integrations',
  icon: 'slack',
  defaultBaseUrl: 'https://slack.com/api',

  fields: [
    {
      key: 'botToken',
      label: 'Bot User OAuth Token',
      type: 'password',
      required: true,
      secret: true,
      placeholder: 'xoxb-...',
      helpText: 'From your Slack App at api.slack.com/apps -> OAuth & Permissions',
    },
  ],

  decorateRequest(creds, req) {
    const token = String(creds.botToken || '').trim();
    if (token) req.headers['Authorization'] = `Bearer ${token}`;
  },

  async test(creds, baseUrl) {
    const token = String(creds.botToken || '').trim();
    if (!token) return { success: false, message: 'Slack bot token is required.' };

    const targetUrl = `${baseUrl.replace(/\/+$/, '')}/auth.test`;
    const start = Date.now();
    try {
      const res = await fetch(targetUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const latencyMs = Date.now() - start;
      const data = (await res.json()) as { ok?: boolean; team?: string; user?: string; error?: string };
      if (!data.ok) {
        return {
          success: false,
          latencyMs,
          statusCode: res.status,
          message: `Slack auth failed: ${data.error || 'Invalid token'}`,
        };
      }
      return {
        success: true,
        latencyMs,
        statusCode: res.status,
        message: `Connected to Slack workspace "${data.team}" as @${data.user}`,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: `Slack connection failed: ${err instanceof Error ? err.message : 'Network error'}`,
      };
    }
  },

  maskPreview(creds) {
    const token = String(creds.botToken || '').trim();
    if (token.startsWith('xoxb-')) {
      return `xoxb-••••••••${token.slice(-4)}`;
    }
    return token.length > 8 ? `${token.slice(0, 5)}••••••••${token.slice(-4)}` : '••••••••';
  },
};
