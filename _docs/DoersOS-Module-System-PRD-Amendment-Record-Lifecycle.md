# DoersOS Module System — Amendment: Standard Record Metadata & Lifecycle

**Status:** Amendment  
**Version:** 1.0  
**Applies to:** `DoersOS-Module-System-PRD.md`  
**Purpose:** Establish mandatory business-record metadata and lifecycle conventions across DoersOS modules.

---

## 1. Objective

All persistent **business entities** in DoersOS must follow a common record metadata convention.

This provides a consistent foundation for:

- Business-date filtering
- Record lifecycle management
- Maker-checker workflows
- Audit history
- AI queries
- Reporting
- Cross-module consistency

This amendment does not apply automatically to technical/infrastructure tables.

---

# 2. Standard Record Metadata

Every persistent business entity must contain:

```text
id
record_date
record_status
created_at
created_by
updated_at
updated_by
```

Example:

```json
{
  "id": "T-1001",
  "record_date": "2026-08-30",
  "record_status": "submitted",

  "created_at": "2026-08-30T09:30:00Z",
  "created_by": "user-123",

  "updated_at": "2026-08-30T10:15:00Z",
  "updated_by": "user-456"
}
```

Module-specific fields are added in addition to these standard fields.

---

# 3. `record_date`

`record_date` represents the **business date to which the record belongs**.

It is not the record creation date and not the last modification date.

Examples:

```text
Invoice
  record_date = invoice date

Expense
  record_date = expense date

Journal Entry
  record_date = accounting/business date

Todo
  record_date = task/business date

CRM Activity
  record_date = activity date
```

The exact business meaning is defined by the module.

---

# 4. Date Filtering

Standard business date filters must use:

```text
record_date
```

not:

```text
created_at
updated_at
```

Examples:

```text
Today
Tomorrow
Yesterday
This Week
Last Week
This Month
Last Month
Custom Date Range
```

should normally translate to filters on:

```text
record_date
```

Example:

```text
"Show me today's todos."

→ todo.task.record_date = today
```

This convention must be used consistently by:

- SDUI filters
- Data APIs
- Reports
- Dashboards
- AI queries
- Module views

---

# 5. Technical Timestamps

`created_at` and `updated_at` remain mandatory for business records.

Their meanings are technical:

```text
created_at
  = when the record was created in the system

updated_at
  = when the record was last changed
```

They must not be used as a substitute for `record_date`.

Example:

```text
Invoice:
  record_date = 2026-08-01
  created_at  = 2026-08-30T10:00:00Z
```

The invoice belongs to August 1 even though it was entered into DoersOS on August 30.

---

# 6. Standard `record_status`

DoersOS defines the following standard lifecycle states:

```text
draft
submitted
approved
cancelled
deleted
```

The value must come from the platform-defined status set.

Modules may define which statuses are valid for a particular entity and which transitions are allowed.

---

# 7. Lifecycle

The conceptual lifecycle is:

```text
                 ┌─────────────┐
                 │    draft    │
                 └──────┬──────┘
                        │ submit
                        ▼
                 ┌─────────────┐
                 │  submitted  │
                 └──────┬──────┘
                        │ approve
                        ▼
                 ┌─────────────┐
                 │   approved  │
                 └─────────────┘

draft / submitted / approved
          │
          ├── cancel → cancelled
          │
          └── delete → deleted
```

This is the platform's conceptual lifecycle.

It is not required that every entity support every transition.

---

# 8. Module-Specific Transitions

A module must declare or implement the valid lifecycle transitions for entities where lifecycle control matters.

Example:

```text
Todo Task

draft
  ↓ submit
submitted
  ↓ approve
approved
```

Another entity might use:

```text
Expense

draft
  ↓ submit
submitted
  ↓ approve
approved
  ↓ cancel
cancelled
```

Invalid transitions must be rejected by the backend.

The frontend must not be the authority for lifecycle transitions.

---

# 9. Maker-Checker

The lifecycle provides the foundation for maker-checker workflows.

Typical flow:

```text
Maker
  ↓
Create
  ↓
draft
  ↓
Submit
  ↓
submitted
  ↓
Checker
  ↓
Approve
  ↓
approved
```

Where maker-checker separation is required:

> The user who creates/submits the record must not also approve it.

This rule must be enforced server-side.

The UI may hide unavailable actions, but hiding an action is not sufficient security.

---

# 10. Approval Metadata

Where approval is applicable, the platform should maintain approval metadata separately from the current status.

Recommended metadata:

```text
submitted_at
submitted_by

approved_at
approved_by

cancelled_at
cancelled_by
```

These fields are optional at the generic schema level and should be added where the entity requires them.

Do not attempt to reconstruct approval history from:

```text
updated_at
updated_by
```

---

# 11. Audit Log

Current record metadata represents the current state.

The audit log represents the history.

Example:

```text
Record created
    ↓
Record submitted
    ↓
Record approved
    ↓
Record updated
    ↓
Record cancelled
```

The audit log should be append-only.

A conceptual audit event:

```json
{
  "event_id": "AUD-1001",
  "entity": "finance.invoice",
  "record_id": "INV-1001",
  "action": "status_changed",

  "from_status": "submitted",
  "to_status": "approved",

  "performed_by": "user-456",
  "performed_at": "2026-08-30T11:30:00Z",

  "reason": "Approved after review"
}
```

---

# 12. Audit Requirements

For business records, audit events should capture at minimum:

```text
entity
record_id
action
performed_by
performed_at
```

For lifecycle changes:

```text
from_status
to_status
```

should also be recorded.

Where relevant, capture:

```text
reason
changed fields
previous values
new values
request ID
source
```

Do not expose internal audit metadata unnecessarily to normal users.

---

# 13. Deleted Records

`deleted` is a logical lifecycle state.

Do not assume that:

```text
record_status = deleted
```

means the physical database row should immediately be removed.

By default:

```text
deleted
    =
soft-deleted / logically unavailable
```

Physical deletion should be governed by platform data-retention rules.

Deleted records should normally be excluded from normal queries.

Example:

```text
GET /data/todo/tasks
```

should not return:

```text
record_status = deleted
```

unless explicitly requested and authorized.

---

# 14. Status and Permissions

Status does not grant permission.

For example:

```text
record_status = submitted
```

does not mean every user can approve the record.

Approval still requires the appropriate permission.

Example:

```text
todo.approve
finance.invoice.approve
```

The backend must check:

```text
Authentication
      ↓
Tenant
      ↓
Permission
      ↓
Valid transition
      ↓
Maker-checker rules
      ↓
Operation
```

---

# 15. Technical Tables

Not every database table is a business entity.

The standard metadata requirement does not automatically apply to infrastructure tables such as:

```text
sessions
job_queue
cache
module_registry
system_settings
migration_history
```

These may use their own technical metadata.

The module/schema definition should clearly distinguish business entities from technical entities.

---

# 16. Schema Convention

Native business entities should define the standard fields explicitly or inherit them from a platform base record definition.

Conceptually:

```text
BaseBusinessRecord
├── id
├── record_date
├── record_status
├── created_at
├── created_by
├── updated_at
└── updated_by
```

Then:

```text
todo.task
    extends BaseBusinessRecord

crm.customer
    extends BaseBusinessRecord

finance.invoice
    extends BaseBusinessRecord
```

The implementation mechanism is framework-specific, but the resulting database/API contract must remain consistent.

---

# 17. API Convention

Business record responses should expose:

```json
{
  "id": "...",
  "record_date": "2026-08-30",
  "record_status": "approved",
  "created_at": "...",
  "created_by": "...",
  "updated_at": "...",
  "updated_by": "..."
}
```

Date-based API filters should use:

```text
record_date
```

Example:

```http
GET /data/todo/tasks?record_date=today
```

or an equivalent structured filter.

The exact endpoint syntax is defined by the API/SDUI contracts.

---

# 18. SDUI Convention

SDUI date filters should map to `record_date` by default for business records.

Example:

```text
Dashboard toolbar
    ↓
Date filter
    ↓
record_date
```

For a table:

```text
DataTable
    ↓
Filter: Today
    ↓
record_date = today
```

A module may provide a different business-date field only when explicitly required by the domain.

---

# 19. AI Convention

AI queries involving business dates should use `record_date` unless the user explicitly asks about system timestamps.

Example:

```text
"Show me today's invoices."
```

means:

```text
finance.invoice.record_date = today
```

not:

```text
created_at = today
```

If the user says:

```text
"What invoices were entered today?"
```

then the AI may interpret this as:

```text
created_at = today
```

The distinction should be preserved.

---

# 20. Connector Modules

For connector modules, the external system may use different field names.

The connector must map the external business date into the DoersOS canonical representation where applicable.

Example:

```text
Odoo invoice_date
       ↓
Connector Mapper
       ↓
record_date
```

Likewise, external lifecycle states should be mapped to the DoersOS standard status where the concept is equivalent.

Do not force a superficial mapping when the external system's lifecycle has materially different semantics.

---

# 21. Time and Timezone

`record_date` is a business date, not necessarily a UTC timestamp.

It should be represented as a date:

```text
YYYY-MM-DD
```

Where the business date depends on timezone, the module must define the relevant business timezone.

Technical timestamps such as:

```text
created_at
updated_at
```

should use timezone-aware timestamps, normally stored in UTC.

---

# 22. Non-Destructive History

Changing a record's status or business fields must not destroy its audit history.

Example:

```text
draft
 ↓
submitted
 ↓
approved
```

must remain traceable.

The current record stores:

```text
record_status = approved
```

The audit log stores the transitions.

---

# 23. Implementation Rule

Junior developers should follow this rule:

> **If it is a persistent business record, start with the standard business-record metadata before adding module-specific fields.**

Minimum:

```text
id
record_date
record_status
created_at
created_by
updated_at
updated_by
```

Then add:

```text
module-specific fields
```

---

# 24. Definition of Done

- [ ] Native business entities contain standard record metadata.
- [ ] `record_date` is distinct from `created_at` and `updated_at`.
- [ ] Business-date filters use `record_date` by default.
- [ ] Standard statuses are defined as `draft`, `submitted`, `approved`, `cancelled`, `deleted`.
- [ ] Modules can restrict valid status transitions.
- [ ] Invalid status transitions are rejected server-side.
- [ ] Maker-checker separation is enforced server-side where required.
- [ ] Approval metadata is maintained where applicable.
- [ ] Business lifecycle changes are auditable.
- [ ] Audit history is append-only.
- [ ] `deleted` is treated as logical deletion by default.
- [ ] Technical/infrastructure tables are exempt unless explicitly required.
- [ ] Connector modules map external business dates to `record_date` where applicable.
- [ ] AI business-date queries use `record_date` by default.
- [ ] SDUI business-date filters use `record_date` by default.
- [ ] Technical timestamps remain available for system/audit purposes.
