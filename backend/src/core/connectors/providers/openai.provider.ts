import { ConnectorProvider } from './provider.interface';

export const OpenaiProvider: ConnectorProvider = {
  id: 'openai',
  name: 'OpenAI',
  description: 'GPT-4, embeddings, and generative AI models',
  icon: 'sparkles',
  defaultBaseUrl: 'https://api.openai.com/v1',

  fields: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      secret: true,
      placeholder: 'sk-proj-...',
      helpText: 'From platform.openai.com/api-keys',
    },
  ],

  decorateRequest(creds, req) {
    const key = String(creds.apiKey || '').trim();
    if (key) req.headers['Authorization'] = `Bearer ${key}`;
  },

  async test(creds, baseUrl) {
    const key = String(creds.apiKey || '').trim();
    if (!key) return { success: false, message: 'OpenAI API key is required.' };

    const targetUrl = `${baseUrl.replace(/\/+$/, '')}/models`;
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
          message: `OpenAI returned HTTP ${res.status}: ${res.statusText || 'Unauthorized'}`,
        };
      }
      return {
        success: true,
        latencyMs,
        statusCode: res.status,
        message: 'OpenAI API key verified successfully (models accessible).',
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: `OpenAI connection failed: ${err instanceof Error ? err.message : 'Network error'}`,
      };
    }
  },

  maskPreview(creds) {
    const key = String(creds.apiKey || '').trim();
    if (key.startsWith('sk-')) {
      return `sk-••••••••${key.slice(-4)}`;
    }
    return key.length > 8 ? `${key.slice(0, 3)}••••••••${key.slice(-4)}` : '••••••••';
  },
};
