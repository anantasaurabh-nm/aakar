# DoersOS Connectors — Provider-First Architecture Guide

**Status:** Active Standard  
**Version:** 2.0  
**Location:** `backend/src/core/connectors/providers/`  

---

## 1. Overview & Architectural Philosophy

The **Connectors Module** in DoersOS manages integrations with external services (e.g., Trello, Stripe, GitHub, Slack, OpenAI, Shopify) and custom REST APIs.

Rather than forcing users to understand abstract HTTP authentication archetypes (`bearer_token`, `api_key`, `basic_auth`, `oauth2`, `custom`), DoersOS adopts a **Provider-First** architecture:
- **Each external service is defined by a single TypeScript file in code** (`connectors/providers/<name>.provider.ts`).
- **Zero Frontend Code Required**: The UI form automatically discovers registered providers and renders only the exact fields required for the selected service using declarative SDUI `showWhen` visibility rules.
- **Unified Request Decoration & Testing**: Each provider implements its own request decoration logic (injecting query params or headers) and test ping method.

---

## 2. Directory Structure

```text
backend/src/core/connectors/
├── providers/
│   ├── provider.interface.ts     # Standard ConnectorProvider & ProviderField contracts
│   ├── provider.registry.ts      # Registry service maintaining all active providers
│   ├── trello.provider.ts        # Trello (Developer Key + User Token + OAuth Secret)
│   ├── stripe.provider.ts        # Stripe (Secret Key)
│   ├── github.provider.ts        # GitHub (Personal Access Token)
│   ├── slack.provider.ts         # Slack (Bot User OAuth Token)
│   ├── openai.provider.ts        # OpenAI (API Key)
│   ├── custom.provider.ts        # Generic Custom REST API / Webhooks
│   └── index.ts                  # Barrel export
├── connectors.service.ts         # Core encryption vault and HTTP client factory
└── connectors.module.ts          # Core NestJS module
```

---

## 3. The `ConnectorProvider` Interface

Every provider file must export an object conforming to `ConnectorProvider`:

```typescript
export interface ProviderField {
  key: string;                                          // Field identifier (e.g. 'apiKey', 'token')
  label: string;                                        // User-facing label in the UI
  type: 'text' | 'password' | 'textarea' | 'select';    // Input type
  required?: boolean;                                   // Whether the field is mandatory
  secret?: boolean;                                     // Write-only (masked on edit, omitted if blank)
  placeholder?: string;
  helpText?: string;
  defaultValue?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface ConnectorProvider {
  id: string;                                           // Unique lowercase id (e.g. 'trello')
  name: string;                                         // Human-readable name (e.g. 'Trello')
  description: string;                                  // Short subtitle
  icon?: string;                                        // Optional UI icon name
  defaultBaseUrl?: string;                              // Remote service base URL
  fields: ProviderField[];                              // Form fields displayed to the user

  /** Injects credentials into outgoing HTTP calls (query params, headers, etc.) */
  decorateRequest: (credentials: Record<string, unknown>, req: ConnectorRequest) => void;

  /** Verifies connection status during diagnostic pings */
  test: (credentials: Record<string, unknown>, baseUrl: string) => Promise<ConnectorTestResult>;

  /** Generates safe masked preview for tables (e.g. "Key: 94a1•••• | Token: atta••••") */
  maskPreview?: (credentials: Record<string, unknown>) => string;
}
```

---

## 4. How to Add a New Provider in 5 Minutes

To add support for a new service (e.g., **Shopify**, **Resend**, or **Jira**):

### Step 1: Create the Provider File
Create `backend/src/core/connectors/providers/shopify.provider.ts`:

```typescript
import { ConnectorProvider } from './provider.interface';

export const ShopifyProvider: ConnectorProvider = {
  id: 'shopify',
  name: 'Shopify Store',
  description: 'Manage products, orders, and webhooks via Admin REST API',
  icon: 'shopping-bag',

  fields: [
    {
      key: 'storeDomain',
      label: 'Store Subdomain or Domain',
      type: 'text',
      required: true,
      placeholder: 'my-store (or my-store.myshopify.com)',
      helpText: 'Your Shopify store name or myshopify.com domain',
    },
    {
      key: 'accessToken',
      label: 'Admin API Access Token',
      type: 'password',
      required: true,
      secret: true,
      placeholder: 'shpat_...',
      helpText: 'From Shopify Admin -> Settings -> Apps -> App Development',
    },
  ],

  decorateRequest(creds, req) {
    const token = String(creds.accessToken || '').trim();
    if (token) req.headers['X-Shopify-Access-Token'] = token;
  },

  async test(creds, baseUrl) {
    const store = String(creds.storeDomain || '').replace(/\.myshopify\.com$/, '').trim();
    const token = String(creds.accessToken || '').trim();
    const url = `https://${store}.myshopify.com/admin/api/2024-01/shop.json`;

    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    if (!res.ok) return { success: false, message: `Shopify error: HTTP ${res.status}` };
    const data = await res.json();
    return { success: true, message: `Connected to store: ${data.shop?.name}` };
  },

  maskPreview(creds) {
    const token = String(creds.accessToken || '').trim();
    return token.startsWith('shpat_') ? `shpat_••••••••${token.slice(-4)}` : '••••••••';
  },
};
```

### Step 2: Register in `provider.registry.ts`
Add it to the registry constructor:
```typescript
import { ShopifyProvider } from './shopify.provider';

// In constructor:
this.register(ShopifyProvider);
```

### Step 3: Export from `index.ts`
```typescript
export * from './shopify.provider';
```

**That's it!** The UI form immediately displays **Shopify Store** in the provider dropdown, dynamically reveals the `storeDomain` and `accessToken` fields, encrypts the credentials, and provides instant API access to workflows and modules.

---

## 5. Using Connectors in Workflows and Modules

Any business module or workflow can interact with a configured connector with a single line of code:

```typescript
// 1. Get a pre-authenticated HTTP client
const client = await connectorsService.getHttpClient(tenantId, 'trello');

// 2. Make authenticated API requests (auth params/headers injected automatically)
const boards = await client.get('/members/me/boards');
const newCard = await client.post('/cards', { name: 'Urgent Task', idList: 'list_123' });

// 3. Or obtain decrypted credentials directly if using an official SDK
const { credentials } = await connectorsService.getDecryptedCredentials(tenantId, 'stripe');
const stripe = new Stripe(credentials.secretKey as string);
```

---

## 6. Connection Testing & Diagnostic Probing

Testing connections is built natively into each provider and accessible throughout the platform:

1. **Provider Test Contract**:
   Each provider implements `test: (credentials: Record<string, unknown>, baseUrl: string) => Promise<ConnectorTestResult>`.
   The method performs an authentic remote probe (e.g., querying Trello `/members/me`, Stripe `/balance`, GitHub `/user`, Slack `/auth.test`, OpenAI `/models`) and returns:
   - `success`: boolean status
   - `message`: human-readable confirmation or diagnostic error
   - `latencyMs`: network roundtrip latency in milliseconds
   - `statusCode`: HTTP status code returned by the provider

2. **Endpoints**:
   - `POST /api/actions/connectors/:id/test`: Probes an existing connection saved in the vault.
   - `POST /api/actions/connectors/test`: Probes live in-flight credentials directly from the form (supporting both existing connection edits and new connection creation before saving).

3. **User Experience Surfaces**:
   - **Vault Table (`all-connections`)**: Clicking the **Test Connection** row action triggers an immediate diagnostic probe, displays a toast with latency and status, and refreshes the diagnostic status in the table.
   - **Record View Toolbar**: A dedicated `⚡ Test Connection` button in the header toolbar probes the active connection and refreshes the record state.
   - **Form Setup Card**: An inline `⚡ Test Connection` button inside the provider's setup card lets users test their credentials before submitting the form.
   - **Operational Health**: The `Operational Status & Health` card presents the live status, `Diagnostic Test Status` (e.g. `🟢 ok (185ms)` or `🔴 Failed: 401 Unauthorized`), and `Last Probed At` timestamp.

---

## 7. Security & Secret Masking Guarantee

1. **In-Transit Protection**:
   Sensitive fields marked with `secret: true` or `type: 'password'` are automatically masked server-side using `maskSecret()` before entering any view/form payload (e.g., `tre••••••••3456`). Raw plaintext secrets are never sent over HTTP for read operations (CWE-312 / CWE-359).

2. **Frontend Masking Badge**:
   The `FieldDisplay` component renders secret fields in a dedicated monospace badge with a lock icon (`🔒 tre••••••••3456`).

3. **Safe Form Edits**:
   Secret inputs in edit forms default to empty (`''`). If a secret field is left blank or retains masked bullet dots (`•`) upon submission, the backend automatically preserves the existing encrypted credential in the vault without corruption.

