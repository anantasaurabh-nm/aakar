# DoersOS Module System — PRD v2

**Status:** Draft  
**Version:** 2.0  
**Audience:** Developers  
**Purpose:** Define how DoersOS modules are packaged, installed, discovered, executed, extended, and integrated.

---

# 1. Core Principle

> **A module must be as simple as the problem requires.**

DoersOS must support modules ranging from:

```text
module.json
schema.json
```

to complex applications containing:

```text
schema
UI
business logic
workflows
AI
integrations
events
background jobs
```

Do not create empty files/directories just to satisfy a framework convention.

Use:

> **Convention → Configuration → Custom Code**

A developer should only add complexity when the module actually needs it.

---

# 2. What Is a Module?

A module is an installable package that adds a business capability to DoersOS.

A module may provide one or more of:

```text
Data
API
UI
Business Logic
Workflow
AI Capabilities
Integrations
Events
Background Jobs
```

A module may also be a wrapper around an external system.

Examples:

```text
Countries
Expenses
Todo
Minutes
CRM
Odoo CRM Connector
```

---

# 3. Progressive Complexity

Modules have no mandatory complexity level.

Conceptually:

```text
                         ┌───────────────┐
                         │    Module     │
                         └───────┬───────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              Simple Module             Complex Module
                    │                         │
              module.json                 schema
              schema.json                    UI
                    │                       Logic
                    │                     Workflow
                    │                        AI
                    │                   Integrations
                    │                      Events
                    │                       Jobs
                    └─────────────────────────┘
```

---

# 4. Level 0 — Manifest Only

A module can contain only metadata when it provides a platform-level capability or configuration.

Example:

```text
feature/
└── module.json
```

This is valid if the module does not define database entities.

---

# 5. Level 1 — Schema-Driven CRUD

This is the most important simple-module case.

Example:

```text
departments/
├── module.json
└── schema.json
```

The developer defines the business entities.

DoersOS automatically provides standard functionality.

For a normal entity, the platform can generate:

```text
Database structure
Validation
CRUD API
List API
Get API
Create API
Update API
Delete API
Search
Filtering
Sorting
Pagination
Basic form
Basic table
Audit hooks
RBAC hooks
AI capabilities
```

The developer does not implement these manually.

---

# 6. Example Simple Module

```json
{
  "id": "departments",
  "name": "Departments",
  "version": "1.0.0"
}
```

Schema conceptually:

```json
{
  "entities": {
    "department": {
      "fields": {
        "name": {
          "type": "string",
          "required": true
        },
        "description": {
          "type": "text"
        }
      }
    }
  }
}
```

This is enough to create a usable module.

---

# 7. Schema Is the Source of Truth

For schema-driven entities, `schema.json` defines:

```text
Entities
Fields
Types
Required fields
Defaults
Relationships
Validation
Searchability
Filtering
Semantic metadata
```

The platform uses this information to generate infrastructure and capabilities.

Do not duplicate the same definition unnecessarily in:

```text
API definitions
UI definitions
AI definitions
Database migrations
```

where the platform can derive it safely.

---

# 8. Standard Business Record Metadata

Every persistent business entity must support the DoersOS standard:

```text
id
record_date
record_status
created_at
created_by
updated_at
updated_by
```

`record_date` is the business date.

It must not be confused with:

```text
created_at
updated_at
```

Business date filters normally operate on:

```text
record_date
```

---

# 9. Standard Record Lifecycle

Business entities use:

```text
draft
submitted
approved
cancelled
deleted
```

The module may restrict valid transitions.

The backend enforces lifecycle rules.

Where required:

```text
Maker
 ↓
submitted
 ↓
Checker
 ↓
approved
```

Maker-checker rules are enforced server-side.

---

# 10. Level 2 — Custom UI

When generated UI is insufficient, add UI definitions.

Example:

```text
products/
├── module.json
├── schema.json
└── ui/
    └── views/
        ├── product-table.json
        └── product-form.json
```

The module can customize:

```text
Form layout
Table columns
Filters
Dashboard
Toolbar
Field presentation
Sections
Actions
```

The module still uses the standard DoersOS renderers.

It does not need to create a new React component unless genuinely necessary.

### Declarative Conditional Visibility (`showWhen`)

Module views support zero-code conditional field and group visibility via the `showWhen` contract. This enables dynamic forms and detail views (e.g. showing OAuth fields only when `authType === 'oauth2'`, or hiding secret tokens when `authType === 'custom'`) purely through JSON configuration without touching core platform files.

#### Contract Schema (`FieldCondition`)

```typescript
type FieldConditionOperator = 'eq' | 'neq' | 'in' | 'not_in' | 'truthy' | 'falsy';

interface FieldCondition {
  field: string;                     // Target form/record field name to evaluate against
  operator: FieldConditionOperator;  // Comparison operator (defaults to 'eq')
  value?: unknown;                   // Target value or array of values (for 'in' / 'not_in')
}
```

#### Supported Operators

| Operator | Evaluates `true` when | Example |
| :--- | :--- | :--- |
| `eq` | `record[field] === value` | `{"field": "authType", "operator": "eq", "value": "custom"}` |
| `neq` | `record[field] !== value` | `{"field": "authType", "operator": "neq", "value": "custom"}` |
| `in` | `value.includes(record[field])` | `{"field": "authType", "operator": "in", "value": ["basic_auth", "oauth2"]}` |
| `not_in` | `!value.includes(record[field])` | `{"field": "tier", "operator": "not_in", "value": ["free", "trial"]}` |
| `truthy` | `Boolean(record[field]) && record[field] !== 'false' && record[field] !== '0'` | `{"field": "enableWebhook", "operator": "truthy"}` |
| `falsy` | `!record[field] || record[field] === 'false' || record[field] === '0'` | `{"field": "isArchived", "operator": "falsy"}` |

#### Usage in Views JSON

Both individual fields (`fields[]`) and layout groups (`layout.groups[]`) support `showWhen`:

```json
{
  "layout": {
    "groups": [
      {
        "id": "oauth_section",
        "title": "OAuth 2.0 Credentials",
        "columns": 2,
        "fields": ["clientId", "clientSecret"],
        "showWhen": {
          "field": "authType",
          "operator": "eq",
          "value": "oauth2"
        }
      }
    ]
  },
  "fields": [
    {
      "name": "authType",
      "label": "Authentication Type",
      "type": "select",
      "defaultValue": "api_key",
      "options": [
        { "label": "API Key", "value": "api_key" },
        { "label": "OAuth 2.0", "value": "oauth2" }
      ]
    },
    {
      "name": "clientId",
      "label": "Client ID",
      "type": "text",
      "required": true,
      "showWhen": {
        "field": "authType",
        "operator": "eq",
        "value": "oauth2"
      }
    }
  ]
}
```

#### Runtime Rules & Validation Behavior

1. **Zero-Latency Client Reactivity**: In edit/create mode (`DynamicForm`), conditions are evaluated against live form values using reactive state watchers. When a parent dropdown changes, dependent fields toggle immediately without server roundtrips.
2. **Exemption of Hidden Fields from Validation**: If a field is `required: true` but is hidden by `showWhen`, the client-side validation schema dynamically relaxes it so hidden fields never block form submission.
3. **Card Group Collapsing**: In both `DynamicForm` and `RecordView` (Show mode), if a group's `showWhen` evaluates to `false` or all fields within a group are hidden, the entire card group container automatically collapses.
4. **Detail / Show Mode Consistency**: In `RecordView`, `showWhen` is evaluated against the fetched record values, ensuring read-only cards only present relevant data.

---

# 11. SDUI Relationship

Module UI definitions produce SDUI-compatible responses.

Conceptually:

```text
Module Schema
      ↓
View Definition
      ↓
SDUI Contract
      ↓
Predefined Renderer
      ↓
UI
```

Standard layouts include:

```text
dashboard
form
table
```

A page can contain heterogeneous sections:

```text
Section A → dashboard
Section B → table
Section C → form
```

`SectionRotator` can display these sections sequentially.

---

# 12. Level 3 — Custom Business Logic

When standard CRUD is insufficient, add server-side business logic.

Example:

```text
orders/
├── module.json
├── schema.json
└── services/
    └── order.service.ts
```

Example operation:

```text
Submit Order
 ↓
Validate order
 ↓
Calculate tax
 ↓
Reserve inventory
 ↓
Create accounting entry
 ↓
Approve
```

The custom service becomes the authority for that operation.

AI and UI must use the approved operation instead of recreating the business logic.

---

# 13. Custom API / Operations

A module may expose operations that are not CRUD.

Examples:

```text
orders.submit
orders.cancel
invoice.post
inventory.reserve
```

These should be explicit capabilities.

Do not model complex operations as arbitrary database updates.

Bad:

```text
PATCH order.status = approved
```

when approval requires business logic.

Good:

```text
orders.approve
```

---

# 14. Level 4 — Workflows

When a module has meaningful state transitions, it may define workflows.

Example:

```text
draft
  ↓ submit
submitted
  ↓ approve
approved
```

Workflow definitions may specify:

```text
Allowed transitions
Required permissions
Required roles
Maker-checker rules
Validation
Side effects
Events
```

The backend remains authoritative.

---

# 15. Level 5 — AI

AI is **available to every module**, but an AI directory is not mandatory.

This distinction is critical.

> **Every module must be AI-addressable. Not every module needs its own AI agent.**

A schema-driven module automatically receives standard AI capabilities.

Example:

```text
departments.department.list
departments.department.get
departments.department.search
departments.department.create
departments.department.update
```

No:

```text
ai/
```

is required.

---

# 16. AI Capability Registry

DoersOS Core maintains a:

```text
Capability Registry
```

Installed modules register capabilities into it.

Conceptually:

```text
Capability Registry
│
├── todo.task.list
├── todo.task.create
├── crm.customer.search
├── minutes.meeting.get
└── minutes.extract_actions
```

The AI Orchestrator discovers and invokes capabilities through this registry.

---

# 17. AI Must Not Access Databases Directly

Never implement:

```text
AI
 ↓
SQL
 ↓
Database
```

Use:

```text
AI Orchestrator
 ↓
Capability Registry
 ↓
Capability Executor
 ↓
Authorization
 ↓
Module
 ↓
Data / Service
```

The module remains responsible for its own data and business rules.

---

# 18. Capability vs Skill vs Agent

## Capability

A concrete operation.

```text
todo.task.list
crm.customer.search
minutes.meeting.get
```

## Skill

A higher-level domain operation.

```text
minutes.extract_actions
minutes.summarize_meeting
finance.reconcile_transactions
```

## Agent

An AI reasoning/orchestration component.

```text
AI Orchestrator
Minutes Agent
Reporting Agent
```

These concepts must not be treated as interchangeable.

---

# 19. Generated Capabilities

Schema-driven entities can automatically produce capabilities.

For:

```text
crm.customer
```

the platform may generate:

```text
crm.customer.list
crm.customer.get
crm.customer.search
crm.customer.create
crm.customer.update
crm.customer.delete
```

Generation depends on module/entity configuration and permissions.

A read-only entity should not automatically expose write capabilities.

---

# 20. Semantic Schema Metadata

Schema should contain enough information for AI discovery.

Example:

```json
{
  "amount": {
    "type": "decimal",
    "label": "Amount",
    "description": "Total expense amount",
    "semantic_type": "currency"
  }
}
```

Relationships:

```json
{
  "customer_id": {
    "type": "reference",
    "entity": "crm.customer"
  }
}
```

This helps AI understand:

```text
What a field means
What an entity represents
How entities relate
Which fields can be searched
Which fields can be filtered
```

---

# 21. Custom AI Skills

A module adds custom skills only when generic capabilities are insufficient.

Example:

```text
minutes/
├── module.json
├── schema.json
└── ai/
    ├── soul.md
    └── skills/
        ├── summarize-meeting/
        ├── extract-actions/
        └── extract-decisions/
```

These skills are registered with the Capability Registry.

---

# 22. `soul.md`

`soul.md` is optional.

Use it for domain knowledge that cannot be adequately represented by schema metadata.

It may explain:

```text
Domain concepts
Terminology
Relationships
Business interpretation
AI guidance
Important rules
```

It must not contain:

```text
API keys
Passwords
Secrets
Database credentials
Security bypass instructions
```

---

# 23. Shared Core Agents

Core agents should be used for cross-module intelligence.

Examples:

```text
AI Orchestrator
Search Agent
Reporting Agent
Data Assistant
```

Do not duplicate generic intelligence inside every module.

Rule:

> **Shared behavior belongs in Core. Specialized domain behavior belongs in the module.**

---

# 24. Module-Specific Agents

A complex module may provide its own agent.

Example:

```text
Minutes Agent
```

It may coordinate:

```text
minutes.meeting.get
minutes.extract_actions
minutes.extract_decisions
todo.task.create
```

The module-specific agent is still subject to all platform authorization.

---

# 25. Level 6 — Integrations

A module may integrate with other DoersOS modules or external systems.

Examples:

```text
Minutes → Todo
Minutes → Calendar
Minutes → CRM
Minutes → Transcription Provider
```

Integrations should use provider/connector abstractions.

---

# 26. Wrapper / Connector Modules

A module does not always need local data.

A wrapper module can represent an external system.

Example:

```text
odoo-crm/
├── module.json
├── connector.json
└── mappings/
```

It may expose:

```text
odoo.crm.customer.list
odoo.crm.customer.get
odoo.crm.customer.search
```

The data may remain in Odoo.

The wrapper provides a DoersOS-compatible capability surface.

---

# 27. External System as Source of Truth

When a module wraps an external system:

```text
DoersOS
   ↓
Connector
   ↓
External System
```

Do not unnecessarily copy all external data into the DoersOS database.

The connector should map:

```text
External schema
      ↓
DoersOS semantic model
      ↓
Capability contract
```

External lifecycle/status values should be mapped to DoersOS concepts only when their meaning is genuinely equivalent.

### Provider-First Integration Vault

Integration credentials and endpoint definitions are managed via the **Connectors Module** (`backend/src/core/connectors/providers/`). 

Rather than requiring users to configure technical protocol archetypes (`bearer_token`, `basic_auth`, etc.), integrations use a **Provider-First** architecture:
- Each integration (Trello, Stripe, GitHub, Slack, OpenAI, Shopify) is an autonomous code provider (`providers/<name>.provider.ts`).
- Providers declare their specific required fields, request decoration logic, and health test pings.
- The UI form automatically discovers all registered providers and renders only the relevant fields via declarative `showWhen` visibility rules.
- Modules interact with external services through `connectorsService.getHttpClient(tenantId, providerId)` or `connectorsService.getDecryptedCredentials(tenantId, providerId)`.

See [_docs/DoersOS-Connectors-Provider-Architecture.md](file:///var/www/web/dev-doers-os-4.altovation.in/_docs/DoersOS-Connectors-Provider-Architecture.md) for full implementation details.

---

# 28. Level 7 — Events

Modules may publish or consume events.

Examples:

```text
meeting.approved
todo.created
invoice.posted
customer.updated
```

Events allow modules to react without tight coupling.

Example:

```text
Minutes
  ↓
meeting.approved
  ↓
Integration
  ↓
Notify participants
```

Events should have stable contracts.

---

# 29. Level 8 — Background Jobs

Complex modules may require asynchronous processing.

Examples:

```text
Audio transcription
Large imports
Report generation
Synchronization
Scheduled processing
```

A module may define jobs when required.

Do not use synchronous HTTP requests for long-running operations.

---

# 30. Module Package Examples

## Simple reference module

```text
countries/
├── module.json
└── schema.json
```

---

## Standard CRUD module

```text
expenses/
├── module.json
└── schema.json
```

---

## Customized CRUD module

```text
products/
├── module.json
├── schema.json
└── ui/
    └── views/
```

---

## Business application

```text
orders/
├── module.json
├── schema.json
├── ui/
├── services/
└── workflows/
```

---

## AI-heavy application

```text
minutes/
├── module.json
├── schema.json
├── ui/
├── services/
├── workflows/
├── ai/
└── integrations/
```

---

## External wrapper

```text
odoo-crm/
├── module.json
├── connector.json
└── mappings/
```

---

# 31. Recommended Module Manifest

The manifest identifies the package and declares optional capabilities.

Conceptual example:

```json
{
  "id": "minutes",
  "name": "Minutes",
  "version": "1.0.0",
  "description": "Meeting intelligence and accountability",

  "type": "native",

  "dependencies": {
    "core": ">=1.0.0"
  },

  "optionalDependencies": {
    "todo": ">=1.0.0"
  }
}
```

The exact manifest contract is defined separately.

Do not duplicate information that can be derived from `schema.json`.

---

# 32. Module Types

The platform may internally distinguish broad implementation types:

```text
native
connector
```

But module complexity should not be determined by the type.

A native module can be:

```text
schema-only
```

or:

```text
full application
```

A connector module can be:

```text
simple wrapper
```

or:

```text
complex integration
```

Type describes **what the module represents**, not how complicated it is.

---

# 33. Dependencies

Dependencies should be explicit.

Example:

```text
Minutes
  └── optional → Todo
```

Do not make optional integrations mandatory dependencies.

A module should fail installation only when a required dependency is missing.

---

# 34. Module Registry

DoersOS Core maintains a module registry.

It should know:

```text
Module ID
Name
Version
Status
Type
Dependencies
Entities
Capabilities
Permissions
Installed version
```

The registry should not contain business records.

---

# 35. Installation Lifecycle

Conceptual installation:

```text
Upload package
      ↓
Validate package
      ↓
Validate manifest
      ↓
Validate schema
      ↓
Validate dependencies
      ↓
Validate permissions
      ↓
Validate capabilities
      ↓
Run migrations
      ↓
Register module
      ↓
Register capabilities
      ↓
Activate module
```

Installation must fail safely if validation fails.

---

# 36. Upgrade

Modules must be versioned.

Upgrade flow:

```text
New package
 ↓
Validate
 ↓
Check compatibility
 ↓
Migration plan
 ↓
Run migration
 ↓
Update registry
 ↓
Register changed capabilities
 ↓
Activate new version
```

Never silently destroy existing business data during an upgrade.

---

# 37. Uninstall

Uninstallation must be explicit and permission-protected.

The system must distinguish:

```text
Disable module
```

from:

```text
Uninstall module
```

and:

```text
Delete module data
```

These are different operations.

Data deletion should require explicit confirmation and follow retention/audit rules.

---

# 38. Security Model

Module code is never trusted merely because it is installed.

All operations must follow:

```text
Authentication
 ↓
Tenant isolation
 ↓
RBAC
 ↓
Record authorization
 ↓
Business validation
 ↓
Operation
```

The same security rules apply to:

```text
UI
API
AI
Jobs
Events
Integrations
```

---

# 39. AI Security

AI must never bypass module authorization.

Example:

```text
User:
"Show me the confidential board meeting."
```

The orchestrator must still call:

```text
minutes.meeting.list/get
```

and the module must enforce record access.

AI must not use:

```text
direct database access
arbitrary SQL
arbitrary HTTP
```

to bypass authorization.

---

# 40. Capability Security

Every executable capability should declare required permissions.

Example:

```json
{
  "id": "todo.task.create",
  "required_permissions": [
    "todo.task.create"
  ]
}
```

The Capability Executor performs the authorization check.

The model does not decide whether the operation is allowed.

---

# 41. Audit

Important operations must be auditable.

Examples:

```text
Record created
Record updated
Record submitted
Record approved
Record cancelled
Record deleted
Capability executed
Integration executed
AI action executed
```

Audit history should be append-only.

---

# 42. Module Events and AI

AI-triggered operations should produce the same business events and audit records as UI/API-triggered operations.

Example:

```text
AI
 ↓
orders.submit
 ↓
Order Service
 ↓
order.submitted
 ↓
Audit
```

Do not create a separate hidden path for AI operations.

---

# 43. UI Does Not Define Business Rules

UI definitions may control:

```text
What is displayed
What actions are visible
How data is arranged
```

They must not be the authoritative source for:

```text
Permission
Approval
Validation
Security
Business state transitions
```

Those belong on the backend.

---

# 44. AI Does Not Define Business Rules

AI can suggest or invoke operations.

It must not become the authoritative implementation of business rules.

Bad:

```text
AI decides invoice is approved
```

Good:

```text
AI requests:
invoice.approve

Invoice Service:
checks rules + permission

Backend:
approves or rejects
```

---

# 45. Module Development Rule

Before adding a new file, ask:

```text
Can DoersOS already provide this?
```

Preferred order:

```text
1. Platform convention
2. Module configuration
3. Module schema
4. Standard UI definition
5. Custom service
6. Workflow
7. AI skill
8. Integration
9. Custom infrastructure
```

Do not implement platform functionality inside individual modules.

---

# 46. Example: Creating a Vendors Module

Start with:

```text
vendors/
├── module.json
└── schema.json
```

Immediately obtain:

```text
Vendor database
CRUD API
Basic table
Basic form
Search
Filtering
Pagination
Audit
RBAC
AI capabilities
```

If custom UI is required:

```text
+ ui/
```

If approval is required:

```text
+ workflows/
```

If special business logic is required:

```text
+ services/
```

If AI needs domain-specific intelligence:

```text
+ ai/
```

If an external system is involved:

```text
+ integrations/
```

The module grows only as required.

---

# 47. Example: Minutes

Minutes is a complex module because it needs:

```text
Meeting domain
Structured topics
Decisions
Actions
Recordings
Transcripts
AI skills
Custom UI
Async processing
Integrations
```

Therefore:

```text
minutes/
├── module.json
├── schema.json
├── permissions.json
├── ui/
├── services/
├── workflows/
├── ai/
└── integrations/
```

This complexity is justified by the product, not imposed by the module framework.

---

# 48. Example: Minutes Audio Processing

```text
User uploads audio
        ↓
Minutes Recording
        ↓
Storage Provider
        ↓
Transcription Provider
        ↓
Transcript
        ↓
Minutes Agent
        ↓
Extract decisions/actions
        ↓
Draft Minute
        ↓
Human review
        ↓
Submit
        ↓
Approve
```

The transcription provider is an external capability.

Minutes owns the meeting business domain.

---

# 49. Module Interoperability

Modules must communicate through stable contracts.

Preferred:

```text
Minutes
 ↓
todo.task.create
```

Avoid:

```text
Minutes
 ↓
Todo database table
```

This allows:

```text
Modules to evolve independently
Modules to be installed/uninstalled independently
External systems to replace native implementations
AI to discover capabilities consistently
```

---

# 50. Module Source of Truth

Each module should have clear ownership.

Example:

```text
Todo
  owns tasks

CRM
  owns customers

Minutes
  owns meetings

Calendar
  owns calendar events
```

When another module needs the data:

```text
reference
```

or:

```text
integration
```

should be preferred over duplication.

---

# 51. Generated API

For standard entities, APIs should be generated from the schema.

Conceptually:

```text
GET    /data/<module>/<entity>
GET    /data/<module>/<entity>/:id
POST   /data/<module>/<entity>
PATCH  /data/<module>/<entity>/:id
DELETE /data/<module>/<entity>/:id
```

Exact routing follows the DoersOS API contract.

Custom operations use explicit capability/API definitions.

---

# 52. Generated UI

For a standard CRUD entity:

```text
schema
 ↓
generic table
generic form
generic filters
generic pagination
```

Custom view definitions override or extend defaults.

The platform should not require custom React components for normal business applications.

---

# 53. Generated AI

For a standard CRUD entity:

```text
schema
 ↓
semantic metadata
 ↓
generated capabilities
 ↓
Capability Registry
 ↓
AI Orchestrator
```

Therefore:

```text
schema-only module
```

is still AI-enabled.

---

# 54. Module Complexity Matrix

| Capability | Required? | Typical |
|---|---:|---|
| `module.json` | Yes | All |
| `schema.json` | Optional | Data modules |
| Standard CRUD | Automatic | Schema modules |
| Generated UI | Automatic | Schema modules |
| Generated AI capabilities | Automatic | Business entities |
| Custom UI | Optional | Customized modules |
| Services | Optional | Business applications |
| Workflows | Optional | Approval/stateful apps |
| `ai/soul.md` | Optional | Domain-heavy AI |
| AI skills | Optional | AI-heavy apps |
| Custom agent | Optional | Advanced AI apps |
| Connectors | Optional | Integrations |
| Events | Optional | Event-driven modules |
| Jobs | Optional | Async/long-running modules |

---

# 55. Anti-Patterns

Do not:

```text
Create an agent for every CRUD module.
```

Do not:

```text
Give AI direct SQL access.
```

Do not:

```text
Duplicate the same entity in multiple modules.
```

Do not:

```text
Implement generic CRUD manually.
```

Do not:

```text
Put business rules in React components.
```

Do not:

```text
Make optional integrations mandatory.
```

Do not:

```text
Hard-code AI providers/models in modules.
```

Do not:

```text
Create custom UI components when SDUI configuration is sufficient.
```

Do not:

```text
Create empty directories just to conform to a template.
```

---

# 56. Final Architecture

```text
                         DoersOS Core
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
 Module Registry       Capability Registry      AI Orchestrator
       │                      │                      │
       │                      │                      │
       └──────────────┬───────┴──────────────┬───────┘
                      │                      │
                 Module Runtime         Core Agents
                      │
          ┌───────────┼────────────────────────────┐
          │           │            │               │
        Schema       UI          Logic           AI
          │           │            │               │
       Data/API     SDUI       Services        Skills/Agent
                      │
                 Integrations
                      │
             External Providers
```

---

# 57. Golden Rule

The entire module architecture can be summarized as:

> **A module declares its data and capabilities; DoersOS provides the defaults; the module adds custom behavior only where the defaults are insufficient.**

Therefore:

```text
Simple problem
→ Simple module

Complex problem
→ Complex module

Same module system
→ No forced complexity
```

---

# 58. Definition of Done

- [ ] A module can contain only `module.json`.
- [ ] A schema-driven module can contain only `module.json` + `schema.json`.
- [ ] Standard CRUD is generated from schema.
- [ ] Standard UI is generated from schema.
- [ ] Standard AI capabilities are generated from schema.
- [ ] Business entities contain standard record metadata.
- [ ] `record_date` is used for business-date filtering.
- [ ] `record_status` follows the standard lifecycle.
- [ ] Custom UI is optional.
- [ ] Custom business logic is optional.
- [ ] Workflows are optional.
- [ ] `ai/soul.md` is optional.
- [ ] Custom AI skills are optional.
- [ ] Module-specific agents are optional.
- [ ] Core agents can operate across modules.
- [ ] Capability Registry is the discovery mechanism for AI.
- [ ] AI cannot access databases directly.
- [ ] AI cannot execute arbitrary SQL.
- [ ] AI cannot make arbitrary external HTTP calls.
- [ ] Every executable capability is authorization-aware.
- [ ] Connector/wrapper modules can operate without local business data.
- [ ] Integrations are optional unless explicitly required.
- [ ] Events are optional.
- [ ] Background jobs are optional.
- [ ] Module dependencies are explicit.
- [ ] Module installation validates package, schema, dependencies, permissions, and capabilities.
- [ ] Module upgrades are versioned and migration-safe.
- [ ] Module disable, uninstall, and data deletion are distinct operations.
- [ ] Important operations are auditable.
- [ ] AI-triggered operations use the same backend business rules as UI/API operations.
