# Progressive Module Complexity in DoersOS
DoersOS should use **progressive module complexity** rather than rigid module types. Modules start simple and gain capabilities only when needed.

## Level 0 — Data Module

Minimal structure:

```text
module.json
schema.json
```

Used for simple/reference data such as:

* Countries
* Departments
* Expense Categories
* Tags
* Simple Contacts
* Reference Data

The platform treats these as standard CRUD entities automatically.

---

## Level 1 — Customized CRUD

Structure:

```text
module.json
schema.json

ui/
  views/
```

The module still uses generic platform behavior but can define how its UI should look and behave instead of relying entirely on the generic UI.

Example:

```text
products/
├── module.json
├── schema.json
└── ui/
    └── views/
        ├── product-list.json
        └── product-form.json
```

**No custom code is required.**

---

## Level 2 — Business Logic

When generic CRUD cannot handle the required behavior, the module can introduce custom backend logic.

Example:

```text
orders/
├── module.json
├── schema.json
├── ui/
└── services/
    └── order.service.ts
```

For example, submitting an order might require:

```text
Submit Order
    ↓
Validate stock
    ↓
Calculate tax
    ↓
Reserve inventory
    ↓
Create accounting entry
```

This is the point where custom business/backend logic becomes necessary.

---

## Level 3 — Full Application

Complex applications such as Minutes can become full modules:

```text
minutes/
├── module.json
├── schema.json
├── permissions.json
│
├── domain/
├── ui/
├── ai/
├── integrations/
├── workflows/
└── services/
```

A Level 3 module can contain:

* Custom UI
* Custom business logic
* AI agents
* AI skills
* Workflows
* Connectors/integrations
* Background jobs
* Events

---

# Capabilities Instead of Rigid Module Types

DoersOS should **not** define rigid categories such as:

```text
CRUD_MODULE
ADVANCED_MODULE
AI_MODULE
INTEGRATION_MODULE
```

Instead, capabilities should be **additive and optional**.

Conceptually:

```text
Module
│
├── Manifest
├── Schema
│
├── UI definitions       [optional]
├── Business logic       [optional]
├── Workflows            [optional]
├── AI                   [optional]
├── Integrations         [optional]
├── Events               [optional]
└── Jobs                 [optional]
```

A module simply grows by adding capabilities when they are required.

---

# Platform Conventions

The power of DoersOS comes from providing strong conventions.

If a developer creates only:

```text
module.json
schema.json
```

the platform understands:

> This is a standard CRUD entity.

It can automatically derive generic APIs such as:

```text
GET    /data/expenses
GET    /data/expenses/:id
POST   /data/expenses
PATCH  /data/expenses/:id
DELETE /data/expenses/:id
```

It can also automatically provide generic SDUI:

```text
Table
 ↓
Form
 ↓
Filters
 ↓
Search
 ↓
Pagination
```

The developer does not need to manually implement these.

---

# Generated Behavior Must Be Overridable

Generated behavior should never become a limitation.

The progression should be:

```text
Convention
    ↓
Configuration
    ↓
Custom implementation
```

For example:

### Default behavior

A `schema.json` automatically produces a generic table.

### UI customization

If customization is needed:

```text
ui/views/expense-table.json
```

can override/configure the generated table.

### Custom behavior

If business behavior requires code:

```text
services/expense.service.ts
```

can provide custom implementation.

### AI

If AI capabilities are required:

```text
ai/soul.md
ai/skills/
```

can be added.

### Integrations

If external systems are required:

```text
integrations/
```

can be added.

**Only the layer that is actually needed should be added.**

---

# Generated Definitions / Schema as Source of Truth

A critical concept is that developers should **not have to manually define everything**.

Given a schema such as:

```json
{
  "title": {
    "type": "string"
  },
  "amount": {
    "type": "decimal"
  },
  "record_date": {
    "type": "date"
  }
}
```

DoersOS can automatically generate:

* Database schema
* API schema
* Validation schema
* Form fields
* Table columns
* Filter definitions
* SDUI
* AI-readable entity metadata

Therefore:

> **The schema becomes the source of truth.**

This dramatically reduces the amount of code and configuration required to build modules.

---

# Core Principle

The overall DoersOS architecture should follow:

```text
Simple schema
     ↓
Automatic generated behavior
     ↓
Optional configuration
     ↓
Optional custom implementation
     ↓
Optional advanced capabilities
```

Modules should therefore be **progressive, composable, convention-driven, and overrideable** rather than divided into rigid types.
