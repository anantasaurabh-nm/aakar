import { ConnectorProvider } from './provider.interface';

export const McpProvider: ConnectorProvider = {
  id: 'mcp',
  name: 'Model Context Protocol (MCP) Server',
  description: 'Connect to any remote MCP server over SSE/HTTP to dynamically discover AI tools and resources',
  icon: 'cpu',
  defaultBaseUrl: '',

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

    if (!req.headers['MCP-Protocol-Version']) {
      req.headers['MCP-Protocol-Version'] = '2024-11-05';
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
    // Priority: creds.serverUrl explicitly configured on the connection takes precedence
    const targetUrl = String(creds.serverUrl || baseUrl || '').trim();
    if (!targetUrl) {
      return { success: false, message: 'MCP server endpoint URL is required.' };
    }

    const transport = String(creds.transport || 'sse').toLowerCase();
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
      let postErrorDetail = '';

      try {
        response = await fetch(targetUrl, {
          method: 'POST',
          headers: fakeReq.headers,
          body: JSON.stringify(initPayload),
          signal: AbortSignal.timeout(10000),
        });

        const rawBody = await response.text().catch(() => '');

        if (response.ok) {
          let parsedData: Record<string, unknown> | null = null;
          try {
            parsedData = JSON.parse(rawBody);
          } catch {
            // Check for SSE stream formatted payload: e.g. "event: message\ndata: { ... }"
            const dataMatch = rawBody.match(/data:\s*(\{.*\})/);
            if (dataMatch?.[1]) {
              try {
                parsedData = JSON.parse(dataMatch[1]);
              } catch {
                // Ignore SSE JSON parse error
              }
            }
          }

          if (parsedData && typeof parsedData === 'object') {
            if (parsedData.result && typeof parsedData.result === 'object') {
              isJsonRpcSuccess = true;
              const resObj = parsedData.result as Record<string, unknown>;
              const serverInfo = resObj.serverInfo as Record<string, unknown> | undefined;
              if (serverInfo && typeof serverInfo.name === 'string') {
                serverName = serverInfo.name;
                if (typeof serverInfo.version === 'string') {
                  serverName += ` v${serverInfo.version}`;
                }
              }
            } else if (parsedData.error) {
              const errObj = parsedData.error as Record<string, unknown>;
              postErrorDetail = String(errObj.message || JSON.stringify(errObj));
            }
          } else if (rawBody) {
            isJsonRpcSuccess = true;
          }
        } else {
          postErrorDetail = `HTTP ${response.status} ${response.statusText}${
            rawBody ? ` (${rawBody.slice(0, 180).replace(/\s+/g, ' ').trim()})` : ''
          }`;
        }
      } catch (postErr) {
        const causeMsg = (postErr as any)?.cause?.message || (postErr as any)?.cause?.code;
        postErrorDetail = `${postErr instanceof Error ? postErr.message : 'POST failed'}${
          causeMsg ? ` (${causeMsg})` : ''
        }`;
      }

      // If transport is 'sse' and POST handshake didn't succeed, fallback probe GET (typical for legacy SSE endpoints)
      if (!isJsonRpcSuccess && transport === 'sse') {
        try {
          response = await fetch(targetUrl, {
            method: 'GET',
            headers: { ...fakeReq.headers, Accept: 'text/event-stream, application/json, */*' },
            signal: AbortSignal.timeout(5000),
          });
        } catch (getErr) {
          const causeMsg = (getErr as any)?.cause?.message || (getErr as any)?.cause?.code;
          return {
            success: false,
            latencyMs: Date.now() - start,
            message: `MCP connection failed [${targetUrl}]: ${
              postErrorDetail || (getErr instanceof Error ? getErr.message : 'Network error')
            }${causeMsg ? ` (${causeMsg})` : ''}`,
          };
        }
      }

      const latencyMs = Date.now() - start;

      if (isJsonRpcSuccess) {
        return {
          success: true,
          latencyMs,
          statusCode: response?.status ?? 200,
          message: `MCP Server initialized successfully${serverName ? ` (${serverName})` : ''}.`,
        };
      }

      const isHttpOk = response ? response.status >= 200 && response.status < 400 : false;
      return {
        success: isHttpOk,
        latencyMs,
        statusCode: response?.status,
        message: isHttpOk
          ? `MCP endpoint connected (HTTP ${response?.status} OK).`
          : `MCP server error [${targetUrl}]: ${
              postErrorDetail || `HTTP ${response?.status ?? 'Unknown'} ${response?.statusText || 'Error'}`
            }`,
      };
    } catch (err) {
      const causeMsg = (err as any)?.cause?.message || (err as any)?.cause?.code;
      return {
        success: false,
        latencyMs: Date.now() - start,
        message: `MCP server test failed [${targetUrl}]: ${
          err instanceof Error ? err.message : 'Network / timeout error'
        }${causeMsg ? ` (${causeMsg})` : ''}`,
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
