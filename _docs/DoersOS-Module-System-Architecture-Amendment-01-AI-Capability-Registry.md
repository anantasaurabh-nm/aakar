# DoersOS Module System — Architectural Amendment 01
## AI Capability Registry & Progressive Module Intelligence

**Status:** Architecture Amendment  
**Version:** 1.0  
**Audience:** Developers  
**Applies to:** `DoersOS-Module-System-PRD.md`

---

# 1. Objective

Every installed business module must be **AI-addressable**, but every module must **not** be required to implement its own AI agent.

The platform must automatically expose standard module capabilities from the module schema and APIs.

Modules may optionally add:

- Domain knowledge
- Custom AI skills
- Custom agents
- Complex workflows

This keeps simple modules simple while allowing advanced modules such as Minutes to have sophisticated AI behavior.

---

# 2. Core Principle

> **Every module is AI-addressable. Not every module needs an AI agent.**

A simple module can contain only:

```text
module.json
schema.json
```

and still be usable by AI.

Example:

```text
departments/
├── module.json
└── schema.json
```

DoersOS automatically derives capabilities such as:

```text
departments.list
departments.get
departments.search
departments.create
departments.update
```

No `ai/` directory is required.

---

# 3. Why This Architecture Exists

Do not allow the AI orchestrator to directly:

```text
query SQL
access database tables
construct arbitrary database queries
bypass module services
bypass RBAC
```

Instead:

```text
User
  ↓
AI Orchestrator
  ↓
Capability Registry
  ↓
Module Capability
  ↓
Authorization
  ↓
Module Runtime
  ↓
Data / Service
```

The module remains the authority over its own data and operations.

---

# 4. Capability vs Skill vs Agent

These three concepts must remain separate.

## Capability

A concrete operation exposed by a module or platform.

Examples:

```text
todo.task.list
todo.task.get
todo.task.create
crm.customer.search
minutes.meeting.get
```

Capabilities may be automatically generated from schemas or explicitly registered.

---

## Skill

A higher-level domain operation requiring custom logic or intelligence.

Examples:

```text
minutes.summarize_meeting
minutes.extract_actions
crm.identify_risky_customers
finance.reconcile_transactions
```

Skills are implemented by modules when generic CRUD capabilities are insufficient.

---

## Agent

A reusable AI reasoning/orchestration component responsible for coordinating capabilities and/or skills.

Examples:

```text
AI Orchestrator
Minutes Agent
Reporting Agent
Search Agent
```

An agent must use approved capabilities and skills rather than directly accessing module databases.

---

# 5. Capability Registry

DoersOS Core must provide a central:

```text
Capability Registry
```

It contains capabilities exposed by installed modules and platform services.

Conceptually:

```text
Capability Registry
│
├── todo.task.list
├── todo.task.get
├── todo.task.create
├── crm.customer.search
├── minutes.meeting.list
├── minutes.summarize_meeting
└── ...
```

The registry is used by the AI Orchestrator to discover what the system can do.

---

# 6. Module Installation

When a module is installed:

```text
Install Module
      ↓
Read module.json
      ↓
Read schema.json
      ↓
Register module
      ↓
Register entities
      ↓
Register permissions
      ↓
Generate standard capabilities
      ↓
Register explicit capabilities/skills
      ↓
Capability Registry
```

The module becomes AI-addressable immediately after successful registration.

---

# 7. Generated CRUD Capabilities

For a standard business entity, DoersOS should automatically expose appropriate capabilities.

Example entity:

```text
todo.task
```

Possible generated capabilities:

```text
todo.task.list
todo.task.get
todo.task.search
todo.task.create
todo.task.update
todo.task.delete
```

Not every operation must automatically be exposed.

Generation must respect:

- Entity configuration
- Module configuration
- Security policy
- Permission definitions

---

# 8. Example — Simple Module

Package:

```text
departments/
├── module.json
└── schema.json
```

Schema:

```text
department
├── name
├── description
├── record_date
└── record_status
```

The platform can automatically provide:

```text
departments.department.list
departments.department.get
departments.department.search
departments.department.create
departments.department.update
```

The module does not require:

```text
ai/soul.md
ai/skills/
agent.ts
```

---

# 9. Example User Request

User:

```text
Show me my today's todo.
```

Incorrect architecture:

```text
AI
 ↓
SQL
 ↓
todo_task table
```

Correct architecture:

```text
User
 ↓
AI Orchestrator
 ↓
Discover Todo capability
 ↓
todo.task.list
 ↓
Apply:
record_date = today
 ↓
Authorization
 ↓
Todo module
 ↓
Results
```

The orchestrator never needs to know how Todo stores its data.

---

# 10. Natural Language to Capability

The orchestrator is responsible for translating user intent into an appropriate capability.

Example:

```text
"Show me my today's todo."
```

becomes conceptually:

```json
{
  "capability": "todo.task.list",
  "filters": {
    "record_date": "today",
    "assignee": "current_user"
  }
}
```

The exact internal request contract is defined by the capability system.

---

# 11. Capability Discovery

The orchestrator should be able to search the registry using semantic information.

Example:

```text
User:
"Find my contacts at Acme."
```

The registry can expose:

```text
crm.customer.search
contacts.contact.search
```

The orchestrator selects the appropriate capability based on:

- Capability name
- Description
- Entity metadata
- Relationships
- Available filters
- Permissions
- Context

The orchestrator must not guess database implementation details.

---

# 12. Schema Semantic Metadata

Schema definitions should provide enough semantic information for AI capability discovery.

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

References should also be explicit:

```json
{
  "customer_id": {
    "type": "reference",
    "entity": "crm.customer"
  }
}
```

This allows the platform to understand:

```text
Field meaning
Entity relationships
Filterable fields
Searchable fields
Reference targets
```

without requiring custom AI code.

---

# 13. Capability Metadata

A registered capability should contain machine-readable metadata.

Conceptually:

```json
{
  "id": "todo.task.list",
  "module": "todo",
  "entity": "todo.task",
  "operation": "list",
  "description": "List tasks accessible to the current user",
  "input_schema": {},
  "output_schema": {},
  "required_permissions": [
    "todo.task.read"
  ]
}
```

The exact schema may evolve, but capability metadata must be machine-readable.

---

# 14. Permissions

Every executable capability must be authorization-aware.

Example:

```text
Capability:
todo.task.create

Required permission:
todo.task.create
```

Execution flow:

```text
AI
 ↓
Capability
 ↓
Authentication
 ↓
Tenant
 ↓
RBAC
 ↓
Record authorization
 ↓
Execute
```

The AI model must never decide whether the user is allowed to perform an operation.

---

# 15. Record-Level Authorization

A user may have permission to use a capability but still not have access to every record.

Example:

```text
crm.customer.get
```

does not automatically mean:

```text
User can read every customer.
```

The module/service must apply record-level authorization.

The same rules must apply whether the request originates from:

```text
Normal UI
API
AI
Background job
```

---

# 16. `record_date` and AI

For business-date queries, AI should use the standard:

```text
record_date
```

unless the user explicitly refers to a technical timestamp.

Example:

```text
"Show today's invoices."
```

means:

```text
invoice.record_date = today
```

Whereas:

```text
"What invoices were entered today?"
```

may mean:

```text
created_at = today
```

The distinction must be preserved.

---

# 17. Custom Module Skills

A module may add skills when generated CRUD capabilities are insufficient.

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

The module's custom skills are registered into the Capability Registry.

---

# 18. Example — Minutes

Minutes can expose generated capabilities:

```text
minutes.meeting.list
minutes.meeting.get
minutes.meeting.create
minutes.action.list
minutes.decision.list
```

and custom skills:

```text
minutes.summarize_meeting
minutes.extract_actions
minutes.extract_decisions
```

The result is:

```text
Generated capabilities
+
Custom domain intelligence
```

---

# 19. `soul.md`

`soul.md` is optional.

It is used when schema and capability metadata are insufficient to explain domain behavior.

It should describe:

```text
Domain concepts
Business terminology
Relationships
Important rules
Interpretation guidance
AI behavior guidelines
```

For Minutes:

```text
Meeting
Topic
Decision
Action
Transcript
Participant
```

`soul.md` must not contain:

```text
API keys
secrets
database credentials
security bypasses
```

---

# 20. Shared Core Agents

DoersOS Core may provide reusable agents.

Examples:

```text
AI Orchestrator
Search Agent
Reporting Agent
Data Assistant
```

Core agents can work across multiple modules through the Capability Registry.

They do not need to be duplicated inside every module.

---

# 21. Module-Specific Agents

A module may provide a specialized agent when its domain requires substantial reasoning.

Example:

```text
Minutes Agent
```

The Minutes Agent may coordinate:

```text
minutes.meeting.get
minutes.extract_actions
minutes.extract_decisions
todo.task.create
```

It remains subject to platform authorization.

---

# 22. Agent Sharing Rule

Use this rule:

> **Shared domain behavior belongs in Core; specialized domain behavior belongs in the module.**

Examples:

```text
Generic search
    → Core

Generic reporting
    → Core

Meeting summarization
    → Minutes

Invoice reconciliation
    → Finance

CRM risk analysis
    → CRM
```

Do not duplicate generic capabilities in every module.

---

# 23. Capability Execution

Capabilities must execute through trusted server-side code.

Conceptually:

```text
AI Orchestrator
      ↓
Capability Registry
      ↓
Capability Executor
      ↓
Authorization
      ↓
Module Service
      ↓
Database / External Provider
```

The model should produce structured capability requests, not arbitrary executable code.

---

# 24. No Arbitrary SQL

The AI layer must never receive a generic capability such as:

```text
execute_sql
```

for normal business operations.

Avoid:

```text
AI → SQL
```

Use:

```text
AI → Capability → Module
```

This protects:

- Data boundaries
- RBAC
- Tenant isolation
- Business rules
- Auditability

---

# 25. No Arbitrary HTTP

Similarly, AI must not be allowed to call arbitrary URLs as part of normal module operation.

External systems are accessed through:

```text
Registered Provider
Registered Connector
Registered Capability
```

Example:

```text
Minutes
 ↓
Todo Provider
 ↓
Todo capability
```

not:

```text
AI
 ↓
POST https://unknown.example.com
```

---

# 26. Capability Output

Capabilities should return structured data.

Example:

```json
{
  "items": [
    {
      "id": "T-1001",
      "title": "Prepare investor update",
      "record_date": "2026-08-30",
      "record_status": "draft"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 1
  }
}
```

The AI response planner can then decide whether to produce:

```text
Text
SDUI
Action confirmation
```

---

# 27. AI and SDUI

The capability layer should remain independent from SDUI.

Flow:

```text
User
 ↓
AI Orchestrator
 ↓
Capability
 ↓
Structured Data
 ↓
Response Planner
 ↓
SDUI Contract
```

The AI does not need to know how a React component renders a table.

The response planner maps structured results to the approved SDUI contract.

---

# 28. Capability Registry Is Not a Database Query Registry

The registry describes **what the system can do**, not how it stores data.

Bad:

```text
todo_task_table.select
```

Good:

```text
todo.task.list
```

The internal implementation may change without changing the capability contract.

---

# 29. Capability Versioning

Capabilities should be versionable.

Example:

```text
todo.task.list@1
todo.task.list@2
```

or an equivalent version field.

Changing an internal database table must not silently break existing AI behavior.

Breaking capability contract changes require versioning.

---

# 30. Module Evolution

A module can progressively become more intelligent.

### Stage 1

```text
module.json
schema.json
```

Automatically gets:

```text
CRUD
API
UI
AI capabilities
```

### Stage 2

Add:

```text
ui/
```

for custom presentation.

### Stage 3

Add:

```text
services/
```

for custom business logic.

### Stage 4

Add:

```text
workflows/
```

for custom lifecycle behavior.

### Stage 5

Add:

```text
ai/
```

for domain intelligence.

### Stage 6

Add:

```text
integrations/
```

for external systems.

A module does not need to implement later stages unless required.

---

# 31. Minimal Module Example

```text
countries/
├── module.json
└── schema.json
```

The platform provides:

```text
Database
CRUD API
Validation
Basic table
Basic form
Filtering
Pagination
Search
Permissions
Audit
AI capabilities
```

No custom code is required.

---

# 32. Complex Module Example

```text
minutes/
├── module.json
├── schema.json
├── permissions.json
├── domain/
├── ui/
├── workflows/
├── ai/
└── integrations/
```

Minutes can then provide:

```text
Custom business logic
Custom UI
Custom workflows
Custom AI skills
Transcription provider
Calendar integration
Todo integration
CRM integration
```

---

# 33. Wrapper / Connector Module

A module that wraps an external system may have little or no local database schema.

Example:

```text
odoo-crm/
├── module.json
├── connector.json
└── mappings/
```

It can expose capabilities such as:

```text
odoo.crm.customer.list
odoo.crm.customer.get
odoo.crm.customer.search
```

The AI still uses:

```text
Capability Registry
```

and does not access Odoo directly.

---

# 34. Capability Naming

Use stable, hierarchical identifiers.

Recommended:

```text
<module>.<entity>.<operation>
```

Examples:

```text
todo.task.list
todo.task.get
crm.customer.search
minutes.meeting.get
```

Custom skills may use:

```text
<module>.<skill>
```

Examples:

```text
minutes.extract_actions
minutes.summarize_meeting
```

The naming convention should remain predictable.

---

# 35. Generated Capability Rules

Generated capabilities should only expose operations supported by the entity/module.

For example, if an entity is configured as read-only:

```text
country.list
country.get
country.search
```

may be generated.

Do not generate:

```text
country.create
country.update
country.delete
```

unless explicitly allowed.

---

# 36. Capability Discovery Security

The registry itself must not become a data-leak mechanism.

A user should not receive sensitive information merely because a capability exists.

Capability discovery should expose only metadata that the caller is allowed to know.

At minimum, distinguish:

```text
Capability exists
```

from:

```text
Capability is executable by this user
```

---

# 37. Audit

Capability execution must be auditable for important operations.

Example:

```text
User
  ↓
AI
  ↓
todo.task.create
```

Audit should record:

```text
capability
module
operation
user
tenant
timestamp
result
```

Sensitive prompt/content logging must follow platform privacy rules.

---

# 38. AI Must Not Bypass Business Services

If a module has custom business logic:

```text
Order Service
 ↓
validate
 ↓
calculate
 ↓
reserve
```

AI must call:

```text
orders.submit
```

rather than attempting to reproduce the workflow through:

```text
orders.update
```

The module decides which operations are safe to expose.

---

# 39. Capability Composition

Capabilities may be composed.

Example:

```text
"Create a task from the action in yesterday's meeting."
```

Possible flow:

```text
minutes.meeting.list
       ↓
minutes.action.list
       ↓
todo.task.create
```

The orchestrator may coordinate multiple capabilities.

Every individual operation still passes authorization.

---

# 40. Long-Term Architecture

```text
                         AI Orchestrator
                                │
                                ▼
                       Capability Registry
                                │
             ┌──────────────────┴──────────────────┐
             │                                     │
    Generated Capabilities                   Custom Skills
       from schema/API                       from modules
             │                                     │
             └──────────────────┬──────────────────┘
                                ▼
                         Capability Executor
                                │
                         Authorization
                                │
                                ▼
                         Module Runtime
                                │
                 ┌──────────────┴──────────────┐
                 │                             │
              Local Data                  External Provider
```

---

# 41. Developer Rules

Junior developers should follow these rules:

1. **Never give AI direct database access.**
2. **Never put provider/API secrets in modules.**
3. **Do not create an AI agent just for standard CRUD.**
4. **Use schema metadata to enable automatic capabilities.**
5. **Create custom skills only for behavior that generic CRUD cannot provide.**
6. **Use Core agents for genuinely cross-module behavior.**
7. **Keep module-specific domain intelligence inside the module.**
8. **Every capability must be authorization-aware.**
9. **Use `record_date` for business-date queries.**
10. **Do not expose arbitrary SQL or HTTP capabilities to AI.**
11. **Keep capability contracts stable and versionable.**
12. **Do not duplicate external system data when a connector/reference is sufficient.**

---

# 42. Definition of Done

- [ ] DoersOS Core has a Capability Registry.
- [ ] Module installation registers module capabilities.
- [ ] Standard CRUD capabilities can be generated from schema.
- [ ] Capability metadata is machine-readable.
- [ ] Capability execution is server-side.
- [ ] Every executable capability is authorization-aware.
- [ ] Tenant isolation is enforced.
- [ ] Record-level authorization is enforced where required.
- [ ] AI cannot directly access module databases.
- [ ] AI cannot execute arbitrary SQL.
- [ ] AI cannot call arbitrary external URLs.
- [ ] Simple CRUD modules do not require `ai/`.
- [ ] Modules can optionally provide `soul.md`.
- [ ] Modules can optionally provide custom AI skills.
- [ ] Core agents can use capabilities across modules.
- [ ] Module-specific agents can be registered when required.
- [ ] Generated capabilities and custom skills use stable identifiers.
- [ ] Capability contracts can be versioned.
- [ ] Important capability executions are auditable.
- [ ] AI-generated SDUI remains downstream of structured capability results.
- [ ] Capability discovery does not bypass authorization.
