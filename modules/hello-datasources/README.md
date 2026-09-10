# Hello Data Sources (`hello-datasources`)

**Canonical Reference Module — Data Source Consumption & Customization Patterns**

---

## 1. Architectural Purpose

In DoersOS Server-Driven UI, views **never specify raw REST endpoints or direct SQL queries**. Instead, views declare abstract **Data Source identifiers** (e.g., `"source": "hello-datasources.metric"`). 

This module serves as the canonical reference for how module developers and AI agents consume and customize data sources **without touching core files**.

For full architecture specifications, refer to:
* Central Reference Guide: [`_docs/DoersOS-Core-Data-Sources-Reference.md`](file:///var/www/web/dev-doers-os-4.altovation.in/_docs/DoersOS-Core-Data-Sources-Reference.md)
* Summary Reference: [`_docs/done-summary/core_data_sources_reference.txt`](file:///var/www/web/dev-doers-os-4.altovation.in/_docs/done-summary/core_data_sources_reference.txt)

---

## 2. Four Data Source Patterns Demonstrated

### Pattern 1: Auto-Generated Standard Entity Source
* **In `schema.json`:** Defining the `metric` entity.
* **In `ui/views/home.json`:**
  ```json
  "data": {
    "source": "hello-datasources.metric"
  }
  ```
* **What happens:** The platform automatically wires up pagination (`page`, `pageSize`), full-text search (`search`), column sorting (`sortBy`, `sortDir`), column filters (`filters`), and batch-enrichment of foreign user references (`assigned_to__label`).

---

### Pattern 2: Auto-Generated Insights Dashboard Source
* **In `ui/views/home.json`:**
  ```json
  "data": {
    "source": "hello-datasources.metric.insights"
  }
  ```
* **What happens:** The platform runs SQL aggregations grouped by status and date, auto-generating metric cards (`Total Metrics`, `Completed`, `Pending`). It integrates seamlessly with the period filter toolbar (`today`, `this_week`, `this_month`, `all_time`).

---

### Pattern 3: Parameterized / Sliced Custom Feeds (Zero Core Code)
* **In `ui/views/home.json`:**
  ```json
  "data": {
    "source": "hello-datasources.metric",
    "params": {
      "priority": "high"
    }
  }
  ```
* **What happens:** Instead of creating a custom backend endpoint for "High Priority Metrics", the developer declares `data.params`. The frontend `DataTable` passes these parameters to the backend entity engine, automatically applying `priority = 'high'` filter at query time.

---

### Pattern 4: Consuming Platform Built-in Sources
* **In `ui/views/home.json`:**
  ```json
  "data": {
    "source": "users"
  }
  ```
* **What happens:** The module consumes platform data (e.g. active users in the tenant) via the controlled client registry, without querying the database directly.

---

### Pattern 5A: Declarative Capabilities (Direct from `capabilities.json`)
* **When to use:** For simple metric summaries, fixed filters, or standard aggregations without writing any backend code.
* **In `capabilities.json`:**
  ```json
  [
    {
      "id": "hello-datasources.declarative-kpi",
      "module": "hello-datasources",
      "entity": "metric",
      "description": "Declarative KPI summary defined purely in capabilities.json",
      "requiredPermission": "hello-datasources.metric.read",
      "type": "summary",
      "cards": [
        { "id": "declarative_mode", "label": "Mode", "value": "Declarative JSON", "accent": "indigo" },
        { "id": "total", "label": "Total Count", "accent": "emerald" },
        { "id": "zero_code", "label": "Backend Code Needed", "value": "0 lines", "accent": "amber" }
      ]
    }
  ]
  ```
* **In `ui/views/home.json`:**
  ```json
  "data": {
    "source": "capabilities.hello-datasources.declarative-kpi"
  }
  ```

---

### Pattern 5B: Code-Based Capabilities (Via TypeScript `.ts` Files)
* **When to use:** For complex computational logic, external API integrations (e.g. Trello/Stripe), or custom database operations.
* **In `capabilities/critical-alerts.ts`:**
  ```typescript
  export const capability = {
    id: 'hello-datasources.critical-alerts',
    module: 'hello-datasources',
    entity: 'metric',
    description: 'Critical alerts requiring immediate attention',
    requiredPermission: 'hello-datasources.metric.read',
    async execute(params, ctx) {
      const page = await ctx.repository.list('hello-datasources', 'metric', ctx.entityDef, ctx.user.tenantId, {
        columnFilters: [{ field: 'priority', operator: 'eq', value: 'critical' }],
      });
      return { operation: 'list', rows: page.items, total: page.total };
    },
  };
  ```

* **In `capabilities/system-health.ts`:**
  ```typescript
  export const capability = {
    id: 'hello-datasources.system-health',
    module: 'hello-datasources',
    entity: 'metric',
    description: 'Calculates real-time health score and operational KPIs',
    requiredPermission: 'hello-datasources.metric.read',
    async execute(params, ctx) {
      const insights = await ctx.repository.insights('hello-datasources', 'metric', ctx.user.tenantId, {});
      return {
        operation: 'insights',
        rows: [{
          cards: [
            { id: 'health_score', label: 'System Health Score', value: '99.4%', accent: 'emerald' },
            { id: 'total', label: 'Active Indicators', value: insights.total, accent: 'indigo' },
            { id: 'latency_kpi', label: 'API Response P95', value: '112ms', accent: 'amber' },
          ],
          charts: [],
        }],
      };
    },
  };
  ```

* **In `ui/views/home.json`:**
  ```json
  "data": {
    "source": "capabilities.hello-datasources.system-health"
  }
  ```
  ```json
  "data": {
    "source": "capabilities.hello-datasources.critical-alerts"
  }
  ```

* **What happens:** The Core platform automatically discovers `.ts` files inside `modules/<module>/capabilities/` and declarative capabilities inside `capabilities.json`. The `CapabilitiesController` (`GET /api/data/capabilities/:id`) intercepts requests, verifies authentication, tenant isolation, and RBAC, and invokes the handler, streaming results directly into the SDUI layout.

---

## 3. Package Structure

```text
hello-datasources/
├── README.md              <-- This reference document
├── module.json            <-- Module manifest & dependencies
├── schema.json            <-- Entity schema ("metric" entity)
├── capabilities.json      <-- Level 2 Declarative capabilities (Pattern 5A)
├── capabilities/          <-- Level 3 TypeScript code capabilities (Pattern 5B)
│   ├── critical-alerts.ts <-- Custom alert query logic in TypeScript
│   └── system-health.ts   <-- Custom KPI metric calculation logic in TypeScript
└── ui/
    └── views/
        └── home.json      <-- SDUI layout demonstrating all data source patterns
```

---

## 4. Anti-Patterns (What NOT to do)

- ❌ **Never specify raw URLs in SDUI:** Do not write `"source": "/api/v1/metrics"`. Always use namespaced data source identifiers (`"<module>.<entity>"` or `"capabilities.<id>"`).
- ❌ **Never write custom endpoints for simple filtered views:** Use `data.params` in `ui/views/*.json` instead of adding backend controller routes.
- ❌ **Never bypass the CapabilityRegistry for custom operations:** Register domain operations as capabilities so they are automatically accessible to both SDUI and the AI Orchestrator.
- ❌ **Never access another module's database table directly:** Always reference other entities through the platform schema reference contract (`"type": "reference"`, `"entity": "core.user"`).
