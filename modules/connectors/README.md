# Connectors Module (`connectors`)

The **Connectors** module manages external integrations, third-party APIs, and AI tool capabilities in DoersOS.

---

## 1. Primary Strategy: Model Context Protocol (MCP) as Preferred Connector

DoersOS adopts **Model Context Protocol (MCP)** as the **primary and preferred paradigm** for connecting external services and internal microservices.

### Why MCP is Preferred
1. **Dynamic Tool & Resource Discovery**:
   - Instead of writing and maintaining static SDK wrappers for every external API, an MCP server advertises its available tools, schemas, and resource templates dynamically via JSON-RPC (`tools/list`, `resources/list`).
2. **Instant AI & Workflow Integration**:
   - The DoersOS AI Hub, background worker agents, and automated workflows can immediately inspect schemas and execute tool calls against connected MCP servers without manual code changes.
3. **Universal Standardization**:
   - Developers and teams can wrap their proprietary databases, microservices, and SaaS integrations in any standard MCP runtime (Python FastMCP, Node.js `@modelcontextprotocol/sdk`, etc.) and connect them to DoersOS in seconds over standard SSE/HTTP.

---

## 2. Provider Architecture

Connectors uses an autonomous **Provider-First** architecture in `backend/src/core/connectors/providers/`:

```text
backend/src/core/connectors/providers/
├── provider.interface.ts     # Standard ConnectorProvider & ProviderField contract
├── provider.registry.ts      # Active provider registry
├── mcp.provider.ts           # ★ Model Context Protocol (MCP) Server (Preferred)
├── trello.provider.ts        # Trello (Developer Key + User Token + OAuth Secret)
├── stripe.provider.ts        # Stripe (Secret API Key)
├── github.provider.ts        # GitHub (Personal Access Token)
├── slack.provider.ts         # Slack (Bot User OAuth Token)
├── openai.provider.ts        # OpenAI (API Key)
├── custom.provider.ts        # Generic Custom REST API / Webhooks
└── index.ts                  # Barrel export
```

---

## 3. How Connectors Power DoersOS Modules

### A. Dynamic AI Tool Calling via MCP
Any module or AI configuration can query active MCP connections to retrieve LLM function calling schemas:
```typescript
// Discover tools exposed by a connected MCP server
const tools = await connectorsService.getMcpTools(tenantId, 'postgres-db-mcp');
// tools => [{ name: "run_query", description: "...", inputSchema: {...} }]
```

### B. Pre-Authenticated HTTP Clients for Modules
Modules can request pre-authenticated HTTP clients that automatically inject credentials and headers:
```typescript
// 1. Obtain pre-authenticated HTTP client
const client = await connectorsService.getHttpClient(tenantId, 'trello');

// 2. Make authenticated API calls
const boards = await client.get('/members/me/boards');

// 3. Or obtain decrypted credentials directly for low-level tasks
const { credentials } = await connectorsService.getDecryptedCredentials(tenantId, 'stripe');
```

---

## 4. Declarative SDUI Management

- **Administrative Vault Table**: `/admin/connectors` (`GET /api/ui/pages/admin/connectors`).
- **Connection Form Manifest**: `ui/views/connection-form.json` (`GET /api/ui/views/connectors/connection/form`).
  - Available services are dynamically listed from registered providers.
  - Form fields use declarative `showWhen` conditions to display only relevant fields.
  - Zero technical protocol jargon exposed to administrators.

---

## 5. Live Diagnostics & Connection Testing

- **Provider `test()` Method**: Each provider declares a `test(credentials, baseUrl)` method for authentic remote connectivity probes.
  - **MCP Test**: Executes standard JSON-RPC `initialize` handshake, verifies server capabilities, and reports server name, version, and latency (e.g. `🟢 ok (Connected to "postgres-mcp" v1.2.0)`).
- **In-Form Live Test**: Admins can test newly entered credentials directly in the form before saving.
- **Record View Diagnostics**: Displays real-time operational status, diagnostic probe results, and timestamps.

---

## 6. Security & Secret Masking

- Sensitive fields (`secret: true`, `type: 'password'`) are masked by the server (`maskSecret()`) before sending view responses.
- The UI renders masked secrets with a lock badge (`🔒 mcp••••••••3456`).
- Unaltered masked values on save preserve existing encrypted vault secrets without overwrite corruption.

For comprehensive architectural guides and examples of building custom providers, see [_docs/DoersOS-Connectors-Provider-Architecture.md](file:///_docs/DoersOS-Connectors-Provider-Architecture.md).
