# DoersOS Connectors & Integrations Architecture

## 1. Overview & Strategy

The **Connectors** subsystem in DoersOS manages external APIs, third-party SaaS integrations, and autonomous AI tool execution.

DoersOS adopts a two-tier connector model:
1. **Primary / Preferred Paradigm: Model Context Protocol (MCP)**:
   - Universal, open-standard integration protocol for discovering tools, schemas, and live resources dynamically over Server-Sent Events (SSE) or HTTP JSON-RPC.
2. **Specialized Direct Providers**:
   - Native code-defined providers for direct REST APIs (Trello, Stripe, GitHub, Slack, OpenAI, Custom Webhooks) requiring custom OAuth query/header decorators.

```mermaid
flowchart TD
    Admin[Administrator] -->|Configures Connection in /admin/connectors| Vault[(Encrypted Vault DB)]
    
    subgraph Connectors Engine
        Registry[ProviderRegistry]
        MCPProvider[★ McpProvider (Preferred)]
        DirectProviders[Trello / Stripe / GitHub / Slack / Custom]
        Tester[Live Diagnostics & Test Engine]
    end
    
    Vault --> Registry
    Registry --> MCPProvider
    Registry --> DirectProviders
    
    subgraph DoersOS Applications & Workflows
        AIHub[AI Hub / Copilot]
        Workflows[Workflow Automation Engine]
        Modules[Domain Modules (CRM, Inventory, Billing)]
    end
    
    MCPProvider -->|1. tools/list Discovery| AIHub
    MCPProvider -->|2. Dynamic Tool Execution| Workflows
    DirectProviders -->|Pre-authenticated HTTP Client| Modules
    
    subgraph External World
        MCPServers[Remote / Local MCP Servers (FastMCP, Node SDK)]
        SaaSAPIs[Third-Party REST APIs]
    end
    
    MCPProvider <-->|SSE / JSON-RPC| MCPServers
    DirectProviders <-->|Decorated HTTPS| SaaSAPIs
```

---

## 2. Why MCP is the Preferred Connector Paradigm

### The Problem with Traditional API Integration
Traditional integrations require writing, testing, and maintaining static SDK wrappers and schema definitions for each SaaS endpoint. When an external API adds fields or changes endpoints, code across multiple modules breaks.

### The MCP Solution
**Model Context Protocol (MCP)** standardizes how applications provide context and tools to LLMs and workflow engines.

| Capability | Traditional Static Provider | Model Context Protocol (MCP) Server |
| :--- | :--- | :--- |
| **Tool / Action Discovery** | Hardcoded in TypeScript code | **Dynamic** via `tools/list` handshake |
| **Schema Validation** | Static JSON schemas in manifests | **Live JSON-Schema** returned by server |
| **AI Agent Usability** | Requires manual function glue | **Native Zero-Config Function Calling** |
| **Maintenance Overhead** | High (updates on every API change) | **Zero** (server self-describes capabilities) |
| **Language Agnostic** | Requires Node/TypeScript implementation | Any language (**Python, Go, Rust, Node, C#**) |

---

## 3. How MCP Empowers DoersOS Modules

### A. AI Hub & Autonomous Assistants
When an administrator configures an MCP connection (e.g. `github-mcp` or `postgres-analytics-mcp`), the DoersOS AI assistant automatically gains access to those tools without writing any custom backend code.
```typescript
// AI Hub asks connectors service for all active MCP tools
const availableTools = await connectorsService.getMcpTools(tenantId);

// Pass tools directly into OpenAI / Anthropic / Gemini function calling payload:
const response = await aiService.generateText({
  prompt: "Find all open bugs in the repository and summarize them",
  tools: availableTools,
});
```

### B. Dynamic Workflow Automation
Automated workflows can execute tasks on remote MCP servers dynamically:
```typescript
// Workflow action step:
await connectorsService.invokeMcpTool(tenantId, 'crm-mcp', 'create_lead', {
  name: 'Acme Corp',
  email: 'contact@acme.com',
  dealSize: 50000,
});
```

### C. Domain Modules (CRM, Billing, Inventory)
Modules can query MCP servers for real-time external data (e.g., live shipping rates, customer credit checks, inventory lookup) with automatic authentication and error handling.

---

## 4. Connecting an MCP Server

### 1. In the DoersOS Admin Hub (`/admin/connectors`)
1. Navigate to **Admin Hub** &rarr; **Connectors & Integrations**.
2. Click **Add Connection** (or **New**).
3. Under **Service / Provider**, select **Model Context Protocol (MCP) Server**.
4. Configure:
   - **Connection Name**: `Postgres Internal Analytics`
   - **MCP Server Endpoint**: `https://mcp.internal.company.com/sse` (or `http://localhost:8000/sse`)
   - **Transport Protocol**: `Server-Sent Events (SSE / HTTP)`
   - **API Key / Bearer Token** *(optional)*: `mcp_secret_token`
   - **Custom Headers (JSON)** *(optional)*: `{"X-Tenant-ID": "prod-1"}`
5. Click **⚡ Test Connection** to verify live connectivity.
6. Click **Save**.

### 2. Live Diagnostic Probe
When probing an MCP server, the test engine:
1. Sends a JSON-RPC 2.0 `initialize` request with `protocolVersion: "2024-11-05"`.
2. Inspects `serverInfo.name`, `serverInfo.version`, and server capabilities.
3. Displays the live operational health in the UI:
   `🟢 ok (MCP Server initialized successfully (postgres-mcp v1.2.0))`

---

## 5. Directory Structure & Provider Registry

All connector providers live in `backend/src/core/connectors/providers/`:

```text
backend/src/core/connectors/providers/
├── provider.interface.ts     # Core ConnectorProvider interface & types
├── provider.registry.ts      # Active provider registry (Dependency Injection)
├── mcp.provider.ts           # ★ Model Context Protocol provider
├── trello.provider.ts        # Trello REST provider
├── stripe.provider.ts        # Stripe API provider
├── github.provider.ts        # GitHub API provider
├── slack.provider.ts         # Slack Web API provider
├── openai.provider.ts        # OpenAI API provider
├── custom.provider.ts        # Generic Custom REST API / Webhook provider
└── index.ts                  # Barrel export
```

---

## 6. How to Build a Custom Direct Provider (Code-First)

If a service does not support MCP and requires custom OAuth query parameter decoration (like Trello), you can create a new provider in 3 steps:

### Step 1: Create `my-service.provider.ts`
```typescript
import { ConnectorProvider } from './provider.interface';

export const MyServiceProvider: ConnectorProvider = {
  id: 'myservice',
  name: 'My Service',
  description: 'Manage data and triggers in My Service',
  icon: 'cloud',
  defaultBaseUrl: 'https://api.myservice.com/v1',

  fields: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      secret: true,
      placeholder: 'mysvc_••••••••',
    },
  ],

  decorateRequest(creds, req) {
    const key = String(creds.apiKey || '').trim();
    if (key) {
      req.headers['Authorization'] = `Bearer ${key}`;
    }
  },

  async test(creds, baseUrl) {
    const targetUrl = baseUrl || 'https://api.myservice.com/v1/ping';
    const start = Date.now();
    try {
      const res = await fetch(targetUrl, {
        headers: { Authorization: `Bearer ${creds.apiKey}` },
      });
      return {
        success: res.ok,
        latencyMs: Date.now() - start,
        message: res.ok ? 'Connection verified successfully.' : `Failed: HTTP ${res.status}`,
      };
    } catch (err) {
      return { success: false, latencyMs: Date.now() - start, message: err.message };
    }
  },

  maskPreview(creds) {
    const key = String(creds.apiKey || '');
    return key.length > 8 ? `${key.slice(0, 3)}••••••••${key.slice(-4)}` : '••••••••';
  },
};
```

### Step 2: Register in `provider.registry.ts`
```typescript
import { MyServiceProvider } from './my-service.provider';

// In ProviderRegistry constructor:
this.register(MyServiceProvider);
```

### Step 3: Export in `index.ts`
```typescript
export * from './my-service.provider';
```

---

## 7. Security, Encryption & Vault Architecture

1. **AES-256-GCM Vault Encryption**:
   - All credentials stored in `CoreConnection.encryptedSecrets` are encrypted at rest using AES-256-GCM with tenant-isolated salt and IV vectors.
2. **Zero-Secret Network Exposure**:
   - Raw secrets are **never sent to client browsers** for record displays or table queries.
   - The backend masks sensitive fields using `maskSecret()` (`🔒 tre••••••••3456`) before rendering SDUI responses.
3. **Safe Preservation on Edit**:
   - Submitting a form with unaltered masked strings or empty password fields preserves existing vault credentials without corruption.
