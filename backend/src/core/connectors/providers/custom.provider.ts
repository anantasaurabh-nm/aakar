import { ConnectorProvider } from './provider.interface';

export const CustomProvider: ConnectorProvider = {
  id: 'custom',
  name: 'Custom REST API / Webhook',
  description: 'Connect to any external service or internal microservice',
  icon: 'globe',

  fields: [
    {
      key: 'baseUrl',
      label: 'Base URL (API Endpoint)',
      type: 'text',
      required: true,
      placeholder: 'https://api.example.com/v1',
      helpText: 'Remote API endpoint URL',
    },
    {
      key: 'authHeader',
      label: 'Authentication Header Name (optional)',
      type: 'text',
      placeholder: 'Authorization, X-API-Key, or Api-Token',
      defaultValue: 'Authorization',
      helpText: 'Defaults to Authorization if left blank',
    },
    {
      key: 'authSecret',
      label: 'API Key / Secret Token (optional)',
      type: 'password',
      secret: true,
      placeholder: 'Secret token or key',
      helpText: 'Value sent in the authentication header',
    },
    {
      key: 'customHeaders',
      label: 'Custom Headers (JSON, optional)',
      type: 'textarea',
      placeholder: '{\n  "X-Custom-Client": "my-client-id"\n}',
      helpText: 'Additional HTTP headers to include with every request',
    },
  ],

  decorateRequest(creds, req) {
    const headerName = String(creds.authHeader || 'Authorization').trim();
    const secret = String(creds.authSecret || '').trim();
    if (headerName && secret) {
      if (headerName.toLowerCase() === 'authorization') {
        req.headers[headerName] = secret.startsWith('Bearer ') || secret.startsWith('Basic ')
          ? secret
          : `Bearer ${secret}`;
      } else {
        req.headers[headerName] = secret;
      }
    }

    if (creds.customHeaders && typeof creds.customHeaders === 'string' && creds.customHeaders.trim()) {
      try {
        const parsed = JSON.parse(creds.customHeaders);
        if (typeof parsed === 'object' && parsed !== null) {
          Object.assign(req.headers, parsed);
        }
      } catch {
        // Ignore JSON parse errors in decoration
      }
    }
  },

  async test(creds, baseUrl) {
    const targetUrl = baseUrl || String(creds.baseUrl || '').trim();
    if (!targetUrl) return { success: false, message: 'Base URL is required to test connection.' };

    const req = { url: new URL(targetUrl), headers: {} as Record<string, string>, method: 'HEAD' };
    CustomProvider.decorateRequest(creds, req);

    const start = Date.now();
    try {
      const res = await fetch(req.url.toString(), {
        method: 'HEAD',
        headers: req.headers,
      }).catch(async () => {
        return fetch(req.url.toString(), {
          method: 'GET',
          headers: req.headers,
        });
      });

      const latencyMs = Date.now() - start;
      const isSuccess = res.status >= 200 && res.status < 400;
      return {
        success: isSuccess,
        latencyMs,
        statusCode: res.status,
        message: isSuccess
          ? `Endpoint returned HTTP ${res.status} OK.`
          : `Endpoint responded with HTTP ${res.status} ${res.statusText || 'Error'}.`,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: `Endpoint test failed: ${err instanceof Error ? err.message : 'Network error'}`,
      };
    }
  },

  maskPreview(creds) {
    const secret = String(creds.authSecret || '').trim();
    if (secret) {
      return secret.length > 8 ? `${secret.slice(0, 3)}••••••••${secret.slice(-4)}` : '••••••••';
    }
    if (creds.customHeaders) {
      return 'Custom Headers (configured)';
    }
    return 'No Auth (Public)';
  },
};
