import { ConnectorProvider } from './provider.interface';

export const GithubProvider: ConnectorProvider = {
  id: 'github',
  name: 'GitHub',
  description: 'Repositories, issues, pull requests, and webhooks',
  icon: 'github',
  defaultBaseUrl: 'https://api.github.com',

  fields: [
    {
      key: 'token',
      label: 'Personal Access Token',
      type: 'password',
      required: true,
      secret: true,
      placeholder: 'ghp_... or github_pat_...',
      helpText: 'Generated from github.com/settings/tokens (classic or fine-grained)',
    },
  ],

  decorateRequest(creds, req) {
    const token = String(creds.token || '').trim();
    if (token) req.headers['Authorization'] = `Bearer ${token}`;
    req.headers['User-Agent'] = 'DoersOS-Connectors/1.0';
    req.headers['Accept'] = 'application/vnd.github+json';
  },

  async test(creds, baseUrl) {
    const token = String(creds.token || '').trim();
    if (!token) return { success: false, message: 'GitHub token is required.' };

    const targetUrl = `${baseUrl.replace(/\/+$/, '')}/user`;
    const start = Date.now();
    try {
      const res = await fetch(targetUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'DoersOS-Connectors/1.0',
          Accept: 'application/vnd.github+json',
        },
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return {
          success: false,
          latencyMs,
          statusCode: res.status,
          message: `GitHub returned HTTP ${res.status}: ${res.statusText || 'Unauthorized'}`,
        };
      }
      const data = (await res.json()) as { login?: string; name?: string };
      return {
        success: true,
        latencyMs,
        statusCode: res.status,
        message: `Connected to GitHub as ${data.name || data.login} (@${data.login ?? ''})`,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: `GitHub connection failed: ${err instanceof Error ? err.message : 'Network error'}`,
      };
    }
  },

  maskPreview(creds) {
    const token = String(creds.token || '').trim();
    if (token.startsWith('ghp_')) {
      return `ghp_••••••••${token.slice(-4)}`;
    }
    return token.length > 8 ? `${token.slice(0, 4)}••••••••${token.slice(-4)}` : '••••••••';
  },
};
