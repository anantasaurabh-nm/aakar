# Hello Workflows — DoersOS Level 4 Workflow Module

`hello-workflows` demonstrates **Level 4 Workflows** in DoersOS (PRD-v2 §14 & §30). It showcases how a module defines declarative approval lifecycles, role-gated transitions, maker-checker governance, metadata tracking, and rich visual workflow progress steppers without writing boilerplate state machine code.

---

## 1. What is Level 4 — Workflows?

In DoersOS:
- **Level 0 (Data)**: Pure generic CRUD (`module.json`, `schema.json`).
- **Level 1 (Customized CRUD)**: Relational references & custom fields (`hello-notes`).
- **Level 2 (Presentation & Logic)**: Declarative SDUI layouts, master-detail tabs, `$currentuser` filtering, navigation dropdowns (`hello-views`).
- **Level 4 (Workflows & Governance)**: Stateful business processes with **server-enforced transitions**, **role requirements**, and **maker-checker controls** (`hello-workflows`).

---

## 2. Directory Structure

```text
modules/hello-workflows/
├── module.json
├── schema.json
├── workflows/
│   └── request.workflow.json    <-- Declarative Level 4 Workflow definition
├── ui/
│   └── views/
│       ├── home.json            <-- Dashboard, perspectives & pre-filtered sections
│       └── request-form.json    <-- Grouped form view with review notes
└── README.md
```

---

## 3. Declarative Workflow Specification (`workflows/*.workflow.json`)

The workflow engine discovers any `*.workflow.json` or `*.json` inside `modules/<module>/workflows/`.

```json
{
  "$schema": "https://doersos.dev/schemas/workflow.v1.json",
  "id": "request-approval",
  "entity": "request",
  "name": "Capital & Expenditure Approval Workflow",
  "description": "Two-tier approval workflow enforcing maker-checker separation",
  "initialStatus": "draft",
  "pipeline": ["draft", "submitted", "approved"],
  "states": {
    "draft": {
      "label": "Draft",
      "canEdit": true,
      "badgeTone": "neutral",
      "stepIndex": 0,
      "transitions": [
        {
          "to": "submitted",
          "label": "Submit for Review",
          "actionType": "forward",
          "requiredFields": ["title", "amount", "justification"],
          "sideEffects": { "setSubmittedMetadata": true }
        },
        {
          "to": "cancelled",
          "label": "Cancel Draft",
          "actionType": "side",
          "confirm": "Are you sure you want to cancel this draft?"
        }
      ]
    },
    "submitted": {
      "label": "Under Review",
      "canEdit": false,
      "badgeTone": "warning",
      "stepIndex": 1,
      "transitions": [
        {
          "to": "approved",
          "label": "Approve Request",
          "actionType": "forward",
          "makerChecker": true,
          "requiredRoles": ["ADMIN", "MANAGER", "SUPERADMIN"],
          "sideEffects": { "setApprovedMetadata": true }
        },
        {
          "to": "draft",
          "label": "Return to Draft (Needs Revision)",
          "actionType": "side",
          "requiredRoles": ["ADMIN", "MANAGER", "SUPERADMIN"],
          "confirm": "Return this request back to draft so the author can make revisions?"
        },
        {
          "to": "cancelled",
          "label": "Reject Request",
          "actionType": "side",
          "confirm": "Are you sure you want to reject and cancel this request?"
        }
      ]
    },
    "approved": {
      "label": "Approved",
      "canEdit": false,
      "badgeTone": "success",
      "stepIndex": 2,
      "transitions": [
        {
          "to": "cancelled",
          "label": "Revoke / Cancel",
          "actionType": "side",
          "requiredRoles": ["ADMIN", "SUPERADMIN"]
        }
      ]
    },
    "cancelled": {
      "label": "Cancelled",
      "canEdit": false,
      "badgeTone": "danger",
      "transitions": [
        {
          "to": "draft",
          "label": "Reopen as Draft",
          "actionType": "forward"
        },
        {
          "to": "deleted",
          "label": "Delete Permanently",
          "actionType": "side"
        }
      ]
    }
  }
}
```

---

## 4. Key Capabilities Demonstrated

### A. Maker-Checker Enforcement
Where `makerChecker: true` is configured on a transition:
- **Server Authority**: The backend rejects approval if `user.id === record.created_by || user.id === record.submitted_by` with `HTTP 403 Forbidden: Maker-checker rule violation: Submitter cannot approve their own record`.
- **UI Feedback**: The frontend Record View renders the Approve button as disabled with a warning: `⚠️ Maker-checker rule: You cannot approve your own submission`.

### B. Dynamic Metadata Stamping
When transitioning states, if the underlying schema contains metadata columns:
- Transitioning to `submitted` automatically sets `submitted_by` and `submitted_at = now()`.
- Transitioning to `approved` automatically sets `approved_by` and `approved_at = now()`.
- Transitioning to `cancelled` automatically sets `cancelled_by` and `cancelled_at = now()`.

### C. Visual Workflow Pipeline Stepper
The Record View automatically reads `computedWorkflow.stepper` from the backend and renders an interactive horizontal progress stepper showing each milestone:
```text
  ( ✓ ) Draft ────────→ ( 2 ) Under Review ────────→ ( 3 ) Approved
by admin on 9/4/2026   by admin on 9/4/2026
```

### D. Role-Gated Transitions
Transitions can restrict execution to specific roles:
```json
"requiredRoles": ["ADMIN", "MANAGER", "SUPERADMIN"]
```
Users without the required roles cannot trigger the transition and see descriptive feedback.

---

## 5. API & Action Targets

The standard entity engine handles all workflow actions via:
- `PATCH /api/actions/hello-workflows/request/:id/transition`:
  ```json
  {
    "to": "submitted"
  }
  ```
- All transitions produce append-only audit entries in `system.audit_logs`.
