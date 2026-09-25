# DoersOS SDUI — Declarative Conditional Views & Forms Guide (`showWhen`)

**Status:** Active Standard  
**Version:** 1.0  
**Scope:** Server-Driven UI (SDUI) Conditional Rendering Contract & Implementation  

---

## 1. Overview & Architectural Philosophy

In the DoersOS Server-Driven UI architecture, application modules (both core modules and future user-created or partner modules) define their interfaces declaratively using JSON view manifests or backend controller contracts.

The **Conditional Visibility Engine (`showWhen`)** allows module developers to:
- Dynamically display or hide form fields in real-time based on the value of other fields (e.g. toggling authentication archetypes, service providers, or payment gateways).
- Conditionally display or collapse entire layout groups / card sections.
- Automatically hide irrelevant fields and cards in read-only **Show Mode** (`RecordView`).
- **Achieve all of this with zero React, CSS, or frontend code.** Any custom module author can drop a `showWhen` rule into their `ui/views/*.json` file and the DoersOS client engine will handle reactivity, rendering, and validation seamlessly.

---

## 2. The `showWhen` Contract

The declarative contract is defined in `@erp/shared-contracts` (`src/sdui/form.ts`):

```typescript
export const FieldConditionOperatorSchema = z.enum([
  'eq',       // Equal to target value
  'neq',      // Not equal to target value
  'in',       // Current value matches an item in target array
  'not_in',   // Current value does NOT match any item in target array
  'truthy',   // Value is non-empty, true, or not '0'/'false'
  'falsy',    // Value is empty, null, undefined, false, '0', or 'false'
]);

export const FieldConditionSchema = z.object({
  field: z.string(),                                  // Name of dependent field
  operator: FieldConditionOperatorSchema.default('eq'), // Comparison operator
  value: z.unknown().optional(),                      // Comparison value
});

export type SDUIFieldCondition = z.infer<typeof FieldConditionSchema>;
```

### Supported Operators

| Operator | Comparison Logic | Example Payload |
| :--- | :--- | :--- |
| `eq` | `actual === target || String(actual) === String(target)` | `{"field": "authType", "operator": "eq", "value": "custom"}` |
| `neq` | `actual !== target && String(actual) !== String(target)` | `{"field": "authType", "operator": "neq", "value": "custom"}` |
| `in` | `Array.isArray(target) && target.includes(actual)` | `{"field": "authType", "operator": "in", "value": ["basic_auth", "oauth2"]}` |
| `not_in` | `Array.isArray(target) && !target.includes(actual)` | `{"field": "status", "operator": "not_in", "value": ["archived", "deleted"]}` |
| `truthy` | `Boolean(actual && actual !== 'false' && actual !== '0')` | `{"field": "enableCustomWebhook", "operator": "truthy"}` |
| `falsy` | `!actual \|\| actual === 'false' \|\| actual === '0'` | `{"field": "isCompleted", "operator": "falsy"}` |

---

## 3. How Module Authors Use `showWhen`

### 3.1 Declarative View Manifests (`modules/<module-id>/ui/views/*.json`)

Module authors do not need access to the platform source code. When authoring a view manifest (e.g. `connection-form.json`, `product-form.json`), simply add the `showWhen` property to fields or layout groups.

#### Example: Conditional Form Field
```json
{
  "name": "headerName",
  "label": "Custom Auth Header Name",
  "type": "text",
  "required": false,
  "defaultValue": "X-API-Key",
  "showWhen": {
    "field": "authType",
    "operator": "eq",
    "value": "api_key"
  }
}
```

#### Example: Conditional Layout Group (Card Section)
```json
{
  "id": "vault",
  "title": "Secure Vault Credentials",
  "description": "Encrypted at rest. Raw credentials are never returned to clients.",
  "columns": 2,
  "fields": ["apiKey", "headerName", "username"],
  "showWhen": {
    "field": "authType",
    "operator": "neq",
    "value": "custom"
  }
}
```

---

## 4. Frontend Execution Mechanics

The DoersOS SDUI frontend implements three critical runtime behaviors to ensure great UX:

### 4.1 Zero-Latency Client-Side Reactivity
In `DynamicForm.tsx`, the form subscribes to state changes via React Hook Form's `watch()`. Whenever the user selects an option in a dropdown or toggles a switch, `evalFieldCondition(field.showWhen, formValues)` is evaluated immediately on the client. Dependent fields appear or disappear instantaneously without any network request or loading spinners.

### 4.2 Dynamic Validation Schema Resolution
If a field is configured with `required: true` (for example, an API token or password), but its `showWhen` rule currently evaluates to `false` (hidden), a standard static validator would fail and prevent form submission.

DoersOS solves this with dynamic Zod schema resolution:
```typescript
const activeSchema = buildDynamicSchema(config.fields, currentValues);
```
When a field is hidden:
- Its validation constraint is dynamically relaxed to `z.any().optional()`.
- The user can submit the form without validation blocking them on invisible fields.
- Secret fields that are hidden are automatically excluded from the final mutation payload to prevent sending stale credentials.

### 4.3 Automatic Layout Card Collapsing
When layout groups are defined in `config.layout.groups`:
1. If the group's own `showWhen` rule evaluates to `false`, the entire card container is omitted.
2. If all fields assigned to a group evaluate to hidden (even if the group itself has no explicit rule), the container automatically collapses, keeping the interface clean and compact.

### 4.4 Show Mode (`RecordView`) Consistency
In read-only Show Mode, `RecordView` evaluates `evalFieldCondition(condition, data.record)` against the record retrieved from the server. This ensures that users inspecting a record only see the fields that are relevant to that record's archetype or status.

---

## 5. Real-World Reference Implementation: The Connectors Module

The Connectors module demonstrates provider-first conditional visibility. Instead of exposing confusing HTTP authentication protocols, the form lets users select the service provider, and `showWhen` automatically displays only that vendor's exact required fields:

- **`provider === 'trello'`**: Shows Developer API Key (`trello_apiKey`), User Access Token (`trello_token`), and optional OAuth / Webhook Secret (`trello_secret`).
- **`provider === 'stripe'`**: Shows Secret API Key (`stripe_secretKey`).
- **`provider === 'github'`**: Shows Personal Access Token (`github_token`).
- **`provider === 'slack'`**: Shows Bot User OAuth Token (`slack_botToken`).
- **`provider === 'openai'`**: Shows API Key (`openai_apiKey`).
- **`provider === 'custom'`**: Shows Base URL (`custom_baseUrl`), Auth Header Name (`custom_authHeader`), Secret (`custom_authSecret`), and Custom Headers (`custom_customHeaders`).

### Field Rules Summary in Connectors Form

```json
{
  "name": "provider",
  "label": "Service / Provider",
  "type": "select",
  "defaultValue": "trello",
  "options": [
    { "label": "Trello — Manage boards, lists, and cards on Trello", "value": "trello" },
    { "label": "Stripe — Payments, subscriptions, invoices, and customers", "value": "stripe" },
    { "label": "GitHub — Repositories, issues, pull requests, and webhooks", "value": "github" },
    { "label": "Slack — Team messaging, channel alerts, and bot integrations", "value": "slack" },
    { "label": "OpenAI — GPT-4, embeddings, and generative AI models", "value": "openai" },
    { "label": "Custom REST API / Webhook — Connect to any custom API", "value": "custom" }
  ]
},
{
  "name": "trello_apiKey",
  "label": "Developer API Key",
  "type": "text",
  "required": true,
  "showWhen": {
    "field": "provider",
    "operator": "eq",
    "value": "trello"
  }
},
{
  "name": "trello_token",
  "label": "User Access Token",
  "type": "password",
  "required": true,
  "secret": true,
  "showWhen": {
    "field": "provider",
    "operator": "eq",
    "value": "trello"
  }
},
{
  "name": "stripe_secretKey",
  "label": "Secret API Key",
  "type": "password",
  "required": true,
  "secret": true,
  "showWhen": {
    "field": "provider",
    "operator": "eq",
    "value": "stripe"
  }
},
{
  "name": "custom_baseUrl",
  "label": "Base URL (API Endpoint)",
  "type": "text",
  "required": true,
  "showWhen": {
    "field": "provider",
    "operator": "eq",
    "value": "custom"
  }
}
```

---

## 6. Best Practices for Module Authors

1. **Use Layout Groups**: When multiple fields depend on the same condition, place them in a dedicated layout group with a `showWhen` rule rather than repeating the rule on every individual field.
2. **Use the `in` Operator for Multiple Triggers**: If a field applies to multiple modes (e.g. 3 out of 5 choices), use `operator: 'in'` with an array of values instead of complex nested conditions.
3. **Provide Sensible Defaults**: Ensure the controlling field (e.g. `authType`) has a valid `defaultValue` in the schema so the form immediately renders with the correct initial field set.
4. **Combine with `secret: true`**: When using sensitive fields like API keys or tokens that are conditionally shown, set `secret: true` so the client omits empty strings when editing existing records and omits hidden secrets from payloads.
