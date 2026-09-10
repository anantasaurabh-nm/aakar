import { ConnectorProvider } from './provider.interface';

export const McpProvider: ConnectorProvider = {
  id: 'mcp',
  name: 'Model Context Protocol (MCP) Server',
  description: 'Connect to any remote MCP server over SSE/HTTP to dynamically discover AI tools and resources',
  icon: 'cpu',
  defaultBaseUrl: 'http://localhost:8000/sse',

  fields: [
    {
      key: 'serverUrl',
      label: 'MCP Server Endpoint (SSE or JSON-RPC URL)',
      type: 'text',
      required: true,
      placeholder: 'http://localhost:8000/sse or https://mcp.internal.acme.com/sse',
      helpText: 'Endpoint URL of the MCP server (e.g. FastMCP, stdio bridge, or Remote SSE)',
    },
    {
      key: 'transport',
      label: 'Transport Protocol',
      type: 'select',
      required: true,
      defaultValue: 'sse',
      options: [
        { label: 'Server-Sent Events (SSE / HTTP)', value: 'sse' },
        { label: 'HTTP JSON-RPC (Direct POST)', value: 'http' },
      ],
      helpText: 'Communication transport mechanism for MCP',
    },
    {
      key: 'apiKey',
      label: 'API Key / Bearer Token (Optional)',
      type: 'password',
      secret: true,
      placeholder: 'mcp_token_••••••••',
      helpText: 'Authorization bearer token passed in the HTTP Authorization header',
    },
    {
      key: 'customHeaders',
      label: 'Custom Headers (JSON, Optional)',
      type: 'textarea',
      placeholder: '{\n  "X-MCP-Session": "default",\n  "X-Tenant-ID": "acme"\n}',
      helpText: 'Optional JSON headers sent with MCP handshakes and tool invocations',
    },
  ],

  decorateRequest(creds, req) {
    const apiKey = String(creds.apiKey || '').trim();
    if (apiKey) {
      req.headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    }

    if (creds.customHeaders && typeof creds.customHeaders === 'string' && creds.customHeaders.trim()) {
      try {
        const parsed = JSON.parse(creds.customHeaders);
        if (typeof parsed === 'object' && parsed !== null) {
          Object.assign(req.headers, parsed);
        }
      } catch {
        // Ignore JSON parse error in decorator
      }
    }
  },

  async test(creds, baseUrl) {
    const targetUrl = baseUrl || String(creds.serverUrl || '').trim();
    if (!targetUrl) {
      return { success: false, message: 'MCP server endpoint URL is required.' };
    }

    const start = Date.now();
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json, text/event-stream, */*',
        'Content-Type': 'application/json',
      };

      const fakeReq = { url: new URL(targetUrl), headers, method: 'POST' };
      McpProvider.decorateRequest(creds, fakeReq);

      // Attempt MCP JSON-RPC initialize handshake
      const initPayload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: {}, prompts: {} },
          clientInfo: { name: 'DoersOS-Client', version: '1.0.0' },
        },
      };

      let response: Response | undefined;
      let isJsonRpcSuccess = false;
      let serverName = '';

      try {
        response = await fetch(targetUrl, {
          method: 'POST',
          headers: fakeReq.headers,
          body: JSON.stringify(initPayload),
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = (await response.json()) as Record<string, unknown>;
            if (data && typeof data === 'object' && data.result && typeof data.result === 'object') {
              isJsonRpcSuccess = true;
              const resObj = data.result as Record<string, unknown>;
              const serverInfo = resObj.serverInfo as Record<string, unknown> | undefined;
              if (serverInfo && typeof serverInfo.name === 'string') {
                serverName = serverInfo.name;
                if (typeof serverInfo.version === 'string') {
                  serverName += ` v${serverInfo.version}`;
                }
              }
            }
          }
        }
      } catch {
        // Fallback to GET probe (typical for SSE initial handshake)
      }

      // If POST wasn't accepted or server is SSE GET endpoint:
      if (!isJsonRpcSuccess) {
        response = await fetch(targetUrl, {
          method: 'GET',
          headers: { ...fakeReq.headers, Accept: 'text/event-stream, application/json, */*' },
          signal: AbortSignal.timeout(5000),
        });
      }

      const latencyMs = Date.now() - start;

      if (isJsonRpcSuccess) {
        return {
          success: true,
          latencyMs,
          statusCode: 200,
          message: `MCP Server initialized successfully${serverName ? ` (${serverName})` : ''}.`,
        };
      }

      const isHttpOk = response ? response.status >= 200 && response.status < 400 : false;
      return {
        success: isHttpOk,
        latencyMs,
        statusCode: response?.status,
        message: isHttpOk
          ? `MCP endpoint connected (HTTP ${response?.status} OK, ready for SSE).`
          : `MCP server responded with HTTP ${response?.status ?? 'Unknown'} ${response?.statusText || 'Error'}.`,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: `MCP server test failed: ${err instanceof Error ? err.message : 'Network / timeout error'}`,
      };
    }
  },

  maskPreview(creds) {
    const targetUrl = String(creds.serverUrl || '').trim();
    const token = String(creds.apiKey || '').trim();
    if (token) {
      const maskedToken = token.length > 8 ? `${token.slice(0, 3)}••••••••${token.slice(-4)}` : '••••••••';
      return targetUrl ? `${targetUrl} (${maskedToken})` : maskedToken;
    }
    return targetUrl ? `${targetUrl} (Public)` : 'MCP Server';
  },
};
