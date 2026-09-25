# DoersOS Core Data Sources & Action Targets Reference

**Status:** Architecture Reference  
**Audience:** Module Developers, Core Engineers, AI Agents  
**Scope:** Server-Driven UI (SDUI) Data Sources, Form Registry, and Action Targets  

---

## 1. Architectural Principles

In DoersOS Server-Driven UI, views **never contain raw REST URLs**. 

```text
┌────────────────────────┐         ┌────────────────────────┐         ┌────────────────────────┐
│   SDUI View / Section  │         │   Client Registry      │         │     Backend Engine     │
│  "data": {             │  ─────> │  fetchDataSource()     │  ─────> │  GET /api/data/...     │
│    "source": "..."     │         │  getSubmitTarget()     │         │  POST /api/actions/... │
│  }                     │         └────────────────────────┘         └────────────────────────┘
└────────────────────────┘
```

1. **Controlled Client Resolution**: Client components (`DataTable`, `Dashboard`, `DynamicForm`) only accept approved namespaced data source identifiers. The client decides the exact network route.
2. **Predictable Conventions**: Every schema-driven module automatically inherits standard data sources and action targets without registering custom endpoints.
3. **Automatic Cache Invalidation**: Action targets define which data sources they invalidate on completion (e.g. creating a record invalidates both the table source and the insights source).

---

## 2. Dynamic Schema-Driven Data Sources (Auto-Generated for ANY Module)

Any module registering an entity in `schema.json` automatically receives the following data sources:

### 2.1 Table / List Data Source: `"<module>.<entity>"`

* **Format:** `"<module_id>.<entity_key>"` (e.g. `"hello-notes.note"`, `"hello-views.note"`, `"employees.employee"`)
* **Consumer Component:** `DataTable` (`type: "table"`)
* **Underlying HTTP Endpoint:** `GET /api/data/:module/:entity`
* **RBAC Requirement:** `${module}.${entity}.read`
* **Supported Query Parameters:**

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `page` | `number` | `1` | 1-indexed page number |
| `pageSize` | `number` | `50` | Maximum rows to return |
| `search` | `string` | — | Full-text keyword search across all fields marked `"searchable": true` |
| `sortBy` | `string` | — | Field name to sort by (must be marked `"sortable": true` or standard metadata) |
| `sortDir` | `'asc' \| 'desc'` | `'asc'` | Sort direction |
| `status` / `record_status` | `string` | — | Filter by lifecycle status (`draft`, `submitted`, `approved`, `cancelled`) |
| `recordDate` | `string` | — | Preset range (`today`, `yesterday`, `this_week`, `this_month`, `last_7_days`, `last_30_days`, `all_time`) or `YYYY-MM-DD` |
| `filters` | `JSON string` | — | Column filter array: `[{"field": "...", "operator": "contains|eq|gt|...", "value": "..."}]` |

* **Response Contract (`Paginated`):**
```json
{
  "items": [
    {
      "id": "80c16ac3-b19e-4d4d-a19b-016f922d80de",
      "tenant_id": "cmtesz02h0000hzyjeg4eym44",
      "record_date": "2026-09-02",
      "record_status": "draft",
      "title": "Level 2 Presentation Review",
      "content": "...",
      "assigned_to": "cmth2gl1k000qfr5jp0nsv1xx",
      "assigned_to__label": "bob.accountant"
    }
  ],
  "page": 1,
  "pageSize": 50,
  "total": 1
}
```
* **Enrichment:** Reference fields (`type: "reference"`) automatically attach `<fieldKey>__label` resolved via `ReferenceResolverService`.

---

### 2.2 Dashboard / Insights Data Source: `"<module>.<entity>.insights"`

* **Format:** `"<module_id>.<entity_key>.insights"` (e.g. `"hello-views.note.insights"`, `"todo.task.insights"`)
* **Consumer Component:** `Dashboard` (`type: "dashboard"`)
* **Underlying HTTP Endpoint:** `GET /api/data/:module/:entity/insights`
* **RBAC Requirement:** `${module}.${entity}.read`
* **Supported Query Parameters:**
  - `recordDate`: `'today'`, `'yesterday'`, `'this_week'`, `'this_month'`, `'last_7_days'`, `'last_30_days'`, `'all_time'`
* **Response Contract:**
```json
{
  "cards": [
    { "id": "total", "label": "Total Note", "value": 12, "accent": "indigo" },
    { "id": "approved", "label": "Completed", "value": 8, "accent": "emerald" },
    { "id": "pending", "label": "Pending", "value": 4, "accent": "amber" }
  ],
  "charts": []
}
```

---

## 3. Platform Built-in Data Sources (System Level)

The platform provides fixed data sources for core applications and management tools:

| Data Source Name | Consumer | Backend Route | Description |
| :--- | :--- | :--- | :--- |
| `home.dashboard` | Home / Dashboard | `GET /api/data/home/dashboard` | Platform landing page stats, active workspaces, and recent notifications |
| `apps` | App Switcher / Grid | `GET /api/data/apps` | List of installed applications enabled for the current user's tenant & role |
| `admin-tools` | Admin Workspace | `GET /api/data/admin-tools` | Available system admin consoles (Users, Roles, Modules, AI Config, Audit) |
| `modules` | Module Management | `GET /api/data/modules` | Installed & discovered modules, surfaces, versions, and activation states |
| `users` / `user-management.user` | User Management | `GET /api/data/users` | Tenant user accounts, email, role assignment, active status |
| `users.insights` | User Management | `GET /api/data/users-insights` | User count, active/inactive breakdown, role distribution cards |
| `roles` / `user-roles.role` | Roles & Permissions | `GET /api/data/roles` | Platform and custom role definitions with assigned permission sets |
| `roles.insights` | Roles & Permissions | `GET /api/data/roles-insights` | Role assignment counts and security metrics |

---

## 4. Form Registry & Sources

Forms in SDUI use `fetchFormSection(target, params)` ([frontend/src/lib/form-registry.ts](file:///var/www/web/dev-doers-os-4.altovation.in/public_html/frontend/src/lib/form-registry.ts)):

### 4.1 Schema Entity Form: `"<module>.<entity>.form"`
* **Target:** `"<module_id>.<entity_key>.form"` (e.g. `"hello-notes.note.form"`, `"hello-views.note.form"`)
* **Endpoint:** `GET /api/ui/views/:module/:entity/form?id=:recordId`
* **Behavior:**
  - When `id` is omitted: returns blank form config with default values and dynamic reference options hydrated.
  - When `id` is provided: returns form config pre-filled with existing record data, plus `record_status` for lifecycle toolbar management.

---

## 5. Action Submit Targets & Cache Invalidation

Action buttons (`type: "submit"`, `"delete"`, `"create"`) dispatch to `getSubmitTarget(target)` ([frontend/src/lib/action-registry.ts](file:///var/www/web/dev-doers-os-4.altovation.in/public_html/frontend/src/lib/action-registry.ts)).

### 5.1 Dynamic Schema Entity Actions

For any `<module>.<entity>`:

| Target | HTTP Method & Path | Body / Payload | Invalidated Sources |
| :--- | :--- | :--- | :--- |
| `<module>.<entity>.create` | `POST /api/actions/:module/:entity` | `{ ...fieldValues }` | `["<module>.<entity>", "<module>.<entity>.insights"]` |
| `<module>.<entity>.update` | `PATCH /api/actions/:module/:entity/:id` | `{ ...fieldValues }` | `["<module>.<entity>", "<module>.<entity>.insights"]` |
| `<module>.<entity>.delete` | `DELETE /api/actions/:module/:entity/:id` | — | `["<module>.<entity>", "<module>.<entity>.insights"]` |
| `<module>.<entity>.submit` | `PATCH /api/actions/:module/:entity/:id/transition` | `{"to": "submitted"}` | `["<module>.<entity>", "<module>.<entity>.insights"]` |
| `<module>.<entity>.approve` | `PATCH /api/actions/:module/:entity/:id/transition` | `{"to": "approved"}` | `["<module>.<entity>", "<module>.<entity>.insights"]` |
| `<module>.<entity>.cancel` | `PATCH /api/actions/:module/:entity/:id/transition` | `{"to": "cancelled"}` | `["<module>.<entity>", "<module>.<entity>.insights"]` |
| `<module>.<entity>.reopen` | `PATCH /api/actions/:module/:entity/:id/transition` | `{"to": "draft"}` | `["<module>.<entity>", "<module>.<entity>.insights"]` |

### 5.2 Module Management Actions

| Target | HTTP Method & Path | Invalidated Sources |
| :--- | :--- | :--- |
| `module.discover` | `POST /api/actions/modules/discover` | `["modules", "apps"]` |
| `module.install` | `POST /api/actions/modules/:id/install` | `["modules", "apps"]` |
| `module.toggle` | `POST /api/actions/modules/:id/toggle` | `["modules", "apps"]` |
| `module.uninstall` | `POST /api/actions/modules/:id/uninstall` | `["modules", "apps"]` |

---

## 6. How Module Developers Create Custom Data Sources (Outside Core)

A core tenet of DoersOS is that **the Core engine is never modified to add module functionality**. 

Module developers can create custom data sources through three mechanisms depending on complexity:

### Method 1: Pure Declarative Entity (Zero Code)
By adding an entity to `modules/<module_name>/schema.json`:
```json
{
  "entities": {
    "payslip": {
      "label": "Payslip",
      "displayField": "slip_number",
      "fields": {
        "slip_number": { "type": "string", "label": "Slip #", "required": true },
        "amount": { "type": "decimal", "label": "Amount" }
      }
    }
  }
}
```
**Auto-Generated Sources:**
- Table Source: `"payroll.payslip"` (pagination, sorting, search, column filters)
- Dashboard Source: `"payroll.payslip.insights"` (date range aggregations, card metrics)
- Form Source: `"payroll.payslip.form"`

### Method 2: Parameterized / Sliced Views in SDUI (Zero Code)
To display a specialized slice of data (e.g. *"Overdue Tasks"*, *"Pending Approvals"*), pass `params` directly in `modules/<module_name>/ui/views/home.json`:
```json
{
  "id": "pending-notes-table",
  "label": "Pending Review",
  "type": "table",
  "data": {
    "source": "hello-views.note",
    "params": {
      "status": "submitted",
      "recordDate": "this_month"
    }
  }
}
```
`DataTable` transmits `data.params` to the backend query engine, giving module authors customized data feeds without touching backend code.

### Method 3: Custom Domain Capability (Level 3+ Code Modules)
For non-CRUD data, external integrations, or complex calculations (e.g. tax calculations, live Trello boards, or document generation):

1. **Define the Capability inside the module folder:**
```typescript
// modules/payroll/capabilities/tax-breakdown.ts
export const taxBreakdownCapability: CapabilityDescriptor = {
  id: "payroll.tax-breakdown",
  module: "payroll",
  description: "Computes tax brackets and net salary calculations",
  requiredPermission: "payroll.payslip.read",
  async execute(params, { user }) {
    const data = await calculateTaxes(user.tenantId, params.year);
    return {
      operation: "insights",
      rows: data
    };
  }
};
```

2. **Use in SDUI Layout (`home.json`):**
```json
{
  "id": "tax-metrics",
  "type": "dashboard",
  "data": {
    "source": "payroll.tax-breakdown"
  }
}
```

3. **Universal Access:** Once registered as a capability, this custom data source is automatically discoverable by:
   - The **SDUI View** (`DataTable` / `Dashboard`)
   - The **AI Orchestrator** (e.g. *"Show me the tax breakdown for this year"*)
   - External Webhooks and Connectors

All security boundaries (Authentication $\to$ Tenant Isolation $\to$ RBAC $\to$ Audit Logging) continue to be enforced by the Core platform.

