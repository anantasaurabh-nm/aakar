# DoersOS Module System — PRD

**Status:** Draft  
**Version:** 1.0  
**Audience:** Developers  
**Purpose:** Define the installable module/package architecture for DoersOS.

---

## 1. Objective

DoersOS is a modular ERP platform.

A **module** is an installable package that adds one or more business capabilities to DoersOS.

A module may provide:

- Domain/data models
- Local database storage
- External system connectivity
- Business logic
- UI pages/views
- AI agent and skills
- Permissions
- Integrations

A module does **not** have to own data.

---

# 2. Core Principle

> **A module provides capabilities; it does not necessarily own the underlying data.**

A module can be:

```text
Native
Connector
Hybrid
```

---

# 3. Module Types

## 3.1 Native Module

DoersOS owns the module's data.

Example:

```text
Todo
```

```text
todo/
├── module.json
├── data/
│   ├── schema.json
│   └── migrations/
├── domain/
├── ui/
└── ai/
```

A native module normally has:

- `schema.json`
- Migrations
- Domain services
- Local data provider

---

## 3.2 Connector Module

An external system owns the data.

Example:

```text
Odoo CRM
```

```text
odoo-crm/
├── module.json
├── connector/
├── permissions.json
├── ui/
└── ai/
```

A connector module:

- Does not require `schema.json`
- Does not copy the external database into DoersOS by default
- Provides a DoersOS-compatible provider
- Maps external data into stable DoersOS representations
- Stores connection configuration separately from secrets

Examples:

```text
Odoo
Salesforce
HubSpot
QuickBooks
Shopify
Custom REST API
```

---

## 3.3 Hybrid Module

A module can use both local and external data.

Example:

```text
CRM
├── Customer → Odoo
├── Lead → Odoo
└── AI Insight → DoersOS
```

The module declares the provider for each capability/entity.

```text
crm.customer → odoo
crm.lead     → odoo
crm.insight  → local
```

---

# 4. Package Structure

Recommended structure:

```text
todo/
│
├── module.json
├── permissions.json
│
├── data/
│   ├── schema.json
│   └── migrations/
│       ├── 001_initial.sql
│       └── 002_add_priority.sql
│
├── domain/
│   ├── task.service.ts
│   └── ...
│
├── connector/
│   └── ...                  # Optional
│
├── ui/
│   ├── pages/
│   │   ├── home.json
│   │   └── tasks.json
│   │
│   └── views/
│       ├── task-dashboard.json
│       ├── task-table.json
│       └── task-form.json
│
├── ai/
│   ├── soul.md
│   ├── skills.json
│   └── skills/
│       ├── get-tasks/
│       │   ├── skill.json
│       │   └── handler.ts
│       ├── create-task/
│       │   ├── skill.json
│       │   └── handler.ts
│       └── complete-task/
│           ├── skill.json
│           └── handler.ts
│
└── README.md
```

Directories are optional according to module capabilities.

---

# 5. Module Manifest

`module.json` is the package entry point.

Example:

```json
{
  "id": "todo",
  "name": "Todo",
  "version": "1.0.0",
  "description": "Task management",

  "type": "native",

  "surfaces": [
    "app"
  ],

  "permissions": "permissions.json",

  "data": {
    "schema": "data/schema.json",
    "migrations": "data/migrations"
  },

  "ui": {
    "pages": "ui/pages",
    "views": "ui/views"
  },

  "ai": {
    "soul": "ai/soul.md",
    "skills": "ai/skills"
  }
}
```

Connector example:

```json
{
  "id": "odoo-crm",
  "name": "Odoo CRM",
  "version": "1.0.0",

  "type": "connector",

  "surfaces": [
    "app"
  ],

  "permissions": "permissions.json",

  "connector": {
    "provider": "odoo",
    "entry": "connector/provider.ts"
  },

  "ui": {
    "pages": "ui/pages",
    "views": "ui/views"
  },

  "ai": {
    "soul": "ai/soul.md",
    "skills": "ai/skills"
  }
}
```

Hybrid example:

```json
{
  "id": "crm",
  "name": "CRM",
  "version": "1.0.0",

  "type": "hybrid",

  "surfaces": [
    "app",
    "admin"
  ],

  "data": {
    "providers": {
      "crm.customer": "odoo",
      "crm.lead": "odoo",
      "crm.insight": "local"
    }
  }
}
```

---

# 6. Module ID and Namespaces

Every module must have a globally unique ID.

Use namespaced domain identifiers.

Examples:

```text
todo.task
crm.customer
crm.lead
finance.invoice
hr.employee
```

Do not use generic global identifiers such as:

```text
task
customer
invoice
```

Module IDs should be:

- Lowercase
- Stable
- URL-safe
- Immutable after publication

Changing a module ID should be treated as a migration/replacement, not a normal rename.

---

# 7. Data Model

## Native modules

Native modules may define:

```text
data/schema.json
data/migrations/
```

The schema describes:

- Entities
- Fields
- Types
- Relationships
- Indexes
- Constraints
- Tenant scope
- Audit requirements

Schema describes the data model.

Business rules belong in domain/application code.

Do not put executable business logic in `schema.json`.

---

## Connector modules

Connector modules do not need to reproduce the external system's schema.

Instead:

```text
External API
     ↓
Connector
     ↓
Provider interface
     ↓
DoersOS representation
```

Example:

```text
Odoo customer
     ↓
mapper
     ↓
crm.customer
```

The connector should hide vendor-specific implementation details from the rest of DoersOS.

---

# 8. Provider Architecture

Use a provider abstraction for data access.

Conceptually:

```ts
interface CustomerProvider {
  listCustomers(query): Promise<Customer[]>;
  getCustomer(id): Promise<Customer>;
  createCustomer(input): Promise<Customer>;
}
```

Possible implementations:

```text
LocalCustomerProvider
OdooCustomerProvider
SalesforceCustomerProvider
```

The consumer should depend on the interface, not the provider implementation.

```text
DataTable
    ↓
crm.customer
    ↓
CustomerProvider
    ↓
Odoo / Local DB / Other provider
```

---

# 9. External Connections

Connector credentials must not be stored in:

```text
module.json
schema.json
ui/*.json
ai/*.md
skill.json
```

The module declares a connection requirement.

Example:

```json
{
  "connector": {
    "provider": "odoo",
    "connection": "odoo"
  }
}
```

The actual credentials are managed by DoersOS Core using a secure server-side credential store.

Credentials must never be sent to:

- Browser
- SDUI response
- AI model
- Agent prompt
- Client logs

---

# 10. Multiple External Connections

A single connector module may support multiple installations.

Example:

```text
Odoo CRM module
       |
       +── Connection A → Company A Odoo
       |
       +── Connection B → Company B Odoo
```

The selected connection must be resolved from trusted tenant/platform context.

The client must not be able to choose an arbitrary connection.

---

# 11. Permissions

Every module may provide permissions.

Example:

```json
{
  "permissions": [
    {
      "id": "todo.read",
      "description": "View tasks"
    },
    {
      "id": "todo.create",
      "description": "Create tasks"
    },
    {
      "id": "todo.update",
      "description": "Update tasks"
    },
    {
      "id": "todo.delete",
      "description": "Delete tasks"
    }
  ]
}
```

Permissions are capabilities, not roles.

Roles/groups are managed by the platform/RBAC system.

---

# 12. Module Surfaces

A module can declare one or more surfaces.

Initial values:

```text
app
admin
```

Example:

```json
{
  "surfaces": [
    "app"
  ]
}
```

Admin-only:

```json
{
  "surfaces": [
    "admin"
  ]
}
```

Both:

```json
{
  "surfaces": [
    "app",
    "admin"
  ]
}
```

Surface determines discovery/navigation, not authorization.

---

# 13. UI

Modules can provide SDUI page and view definitions.

```text
ui/
├── pages/
└── views/
```

A page composes sections.

A view defines reusable configuration for a predefined renderer.

Example:

```text
page
 ├── Dashboard view
 └── Table view
```

The module does not need to provide React components for standard DoersOS views.

The core client provides:

```text
Dashboard
DataTable
DynamicForm
Detail
...
```

---

# 14. AI

AI-enabled modules can provide:

```text
ai/
├── soul.md
├── skills.json
└── skills/
```

`soul.md` defines agent behavior and scope.

`skills.json` provides the machine-readable skill registry.

Individual `skill.json` files define:

- Skill ID
- Description
- Input schema
- Output schema
- Permission
- Read/write classification
- Handler

The actual skill implementation is code.

Do not use Markdown as the executable skill contract.

---

# 15. Domain Logic

Business logic belongs in the module's domain/application layer.

Example:

```text
Todo
 ├── TaskService
 ├── TaskRules
 └── TaskRepository/Provider
```

AI skills and API controllers should call domain services rather than duplicating business logic.

```text
UI
 ↓
API
 ↓
Domain Service
 ↓
Provider
 ↓
Database / External System
```

and:

```text
AI
 ↓
Skill
 ↓
Domain Service
 ↓
Provider
 ↓
Database / External System
```

Both paths should use the same business rules.

---

# 16. Cross-Module Dependencies

Modules can depend on other modules.

Example:

```text
Todo
 └── optional integration → CRM
```

Manifest:

```json
{
  "dependencies": {
    "core": ">=1.0.0"
  },

  "optionalDependencies": {
    "crm": ">=1.0.0"
  }
}
```

Use:

```text
dependencies
```

for mandatory requirements.

Use:

```text
optionalDependencies
```

for integrations that enhance the module but are not required.

---

# 17. Cross-Module References

Use stable namespaced references.

Example:

```json
{
  "field": "customerId",
  "type": "reference",
  "entity": "crm.customer"
}
```

Do not duplicate another module's entity just to create a relationship.

Example:

```text
Todo.task
   |
   +── customerId
          ↓
      crm.customer
```

The referenced module may be local or external.

The provider layer resolves the data.

---

# 18. Module Installation Lifecycle

Installing a module is a privileged administrative operation.

Process:

```text
Package
   ↓
Verify package/signature
   ↓
Validate manifest
   ↓
Validate dependencies
   ↓
Validate permissions
   ↓
Validate schemas
   ↓
Register module
   ↓
Apply migrations
   ↓
Register providers
   ↓
Register UI
   ↓
Register AI agent/skills
   ↓
Enable module
```

Installation must be transactional where possible.

A failed installation must not leave the system in a partially registered state.

---

# 19. Module Upgrade

Modules are versioned using semantic versions.

Example:

```text
1.0.0
1.1.0
2.0.0
```

Upgrade process:

```text
Current version
      ↓
Check compatibility
      ↓
Backup/rollback strategy
      ↓
Run migrations
      ↓
Update registry
      ↓
Reload/re-register capabilities
      ↓
New version active
```

Database migrations must be ordered and idempotent where practical.

---

# 20. Module Disable

Disabling a module must not silently delete its data.

Possible state:

```text
installed
enabled
disabled
```

When disabled:

- Its apps should not appear in discovery.
- Its pages should not be accessible through normal navigation.
- Its AI agent should not be routable.
- Its skills should not be executable.
- Its data should remain unless explicitly uninstalled.

---

# 21. Module Uninstall

Uninstallation is a separate, privileged operation.

Default behavior should be conservative.

```text
Disable
   ↓
Check dependencies
   ↓
Check data retention requirements
   ↓
Explicit administrator confirmation
   ↓
Uninstall
```

Do not automatically destroy production data merely because a module is removed.

Native module data deletion should require an explicit destructive operation.

Connector uninstall normally removes DoersOS configuration, not data stored in the external provider.

---

# 22. Package Security

A module package can contain executable backend code.

Therefore:

> Installing a module is equivalent to installing trusted server-side software.

Production installation should support:

- Package integrity verification
- Trusted publisher/signature verification
- Version validation
- Dependency validation
- Permission review
- Audit logging
- Controlled installation privileges

Do not treat uploaded packages as untrusted configuration files that can automatically execute.

---

# 23. AI Security

AI must not:

- Install modules
- Enable modules
- Disable modules
- Modify module permissions
- Access package credentials
- Execute arbitrary package code

AI can use registered skills subject to normal authorization.

The agent can request a capability.

The backend decides whether the operation is allowed.

---

# 24. Module Registry

DoersOS Core maintains a central module registry.

Conceptually:

```text
Module Registry
│
├── todo
│   ├── native
│   └── enabled
│
├── crm
│   ├── hybrid
│   └── enabled
│
├── odoo-crm
│   ├── connector
│   └── enabled
│
└── user-management
    ├── native
    └── enabled
```

The registry tracks:

- Module ID
- Version
- Type
- Status
- Dependencies
- Surfaces
- Providers
- Permissions
- UI capabilities
- AI capabilities

---

# 25. Capability Registration

Modules register capabilities rather than exposing implementation details.

Example:

```text
todo.task
todo.task.read
todo.task.create
todo.task.complete
```

The same principle applies to external providers.

```text
crm.customer
```

can resolve to:

```text
OdooProvider
```

without the rest of DoersOS needing to know that Odoo is being used.

---

# 26. Module-to-Platform Boundary

### Module owns

```text
Domain model
Business logic
Provider implementation
UI definitions
AI behavior
AI skills
Module permissions
Module migrations
```

### DoersOS Core owns

```text
Authentication
Tenant context
RBAC engine
Module registry
Module lifecycle
Credential management
SDUI renderer
AI orchestrator
Security enforcement
Shared design system
```

---

# 27. Example: Native Todo Module

```text
todo/
│
├── module.json
├── permissions.json
│
├── data/
│   ├── schema.json
│   └── migrations/
│
├── domain/
│   └── task.service.ts
│
├── ui/
│   ├── pages/
│   │   └── todo.json
│   └── views/
│       ├── dashboard.json
│       ├── table.json
│       └── form.json
│
└── ai/
    ├── soul.md
    ├── skills.json
    └── skills/
        ├── get-tasks/
        ├── create-task/
        └── complete-task/
```

---

# 28. Example: Odoo CRM Connector

```text
odoo-crm/
│
├── module.json
├── permissions.json
│
├── connector/
│   ├── client.ts
│   ├── provider.ts
│   ├── mapper.ts
│   └── entities/
│       ├── customer.ts
│       └── lead.ts
│
├── ui/
│   ├── pages/
│   └── views/
│
└── ai/
    ├── soul.md
    ├── skills.json
    └── skills/
        ├── search-customers/
        └── create-lead/
```

No local `schema.json` is required.

---

# 29. Example: User Experience

After installing Todo:

```text
DoersOS
 └── Apps
      └── Todo
```

Opening Todo:

```text
Todo
 ├── Insights
 └── Tasks
```

AI:

```text
User:
"Show me my today's todo."

Orchestrator
    ↓
Todo Agent
    ↓
get-tasks skill
    ↓
Todo provider
    ↓
DoersOS database
    ↓
Response Planner
    ↓
SDUI
    ↓
SectionRotator
```

For Odoo CRM:

```text
User:
"Show me my customers."

Orchestrator
    ↓
CRM Agent
    ↓
search-customers skill
    ↓
CRM provider
    ↓
Odoo API
    ↓
Response Planner
    ↓
SDUI
    ↓
DataTable
```

The user experience remains consistent regardless of where the data lives.

---

# 30. Definition of Done

- [ ] Modules are installable packages.
- [ ] `module.json` is the package manifest.
- [ ] Native, connector, and hybrid module types are supported.
- [ ] Native modules can provide `data/schema.json`.
- [ ] Connector modules do not require a local schema.
- [ ] Hybrid modules can map capabilities/entities to different providers.
- [ ] Providers abstract local vs external data sources.
- [ ] External credentials are managed outside the package.
- [ ] Modules have stable namespaced IDs.
- [ ] Modules can declare dependencies.
- [ ] Modules can provide permissions.
- [ ] Modules can provide UI pages/views.
- [ ] Modules can provide AI agents and skills.
- [ ] AI skills use explicit machine-readable contracts.
- [ ] Domain logic is reusable by both API and AI paths.
- [ ] Cross-module references use stable namespaced identifiers.
- [ ] Module installation is privileged and auditable.
- [ ] Module upgrades are versioned and migration-aware.
- [ ] Disabled modules do not expose normal capabilities.
- [ ] Uninstall does not silently destroy data.
- [ ] AI cannot install or modify modules.
- [ ] Package code is treated as trusted executable software.
- [ ] Authentication, tenancy, and RBAC remain platform-level security boundaries.
