# Hello Notes — DoersOS Reference Module

**Module ID:** `hello-notes`  
**Level:** Level 1 (Schema-Driven CRUD)  
**Status:** Canonical Reference Standard  

---

## 1. Purpose

`hello-notes` is the canonical minimal business module in DoersOS. It demonstrates how a developer can achieve full business functionality (CRUD, database tables, validation, search, filtering, sorting, pagination, SDUI views, RBAC permissions, audit logging, and AI capabilities) by defining **only** a `module.json` manifest and a `schema.json` data model.

---

## 2. What This Example Demonstrates

- **Level 1 Schema-Driven CRUD**: Zero custom backend services or API controllers required.
- **Entity Relationships**: Business reference from `note.assigned_to` to `core.user` without duplicating user entities.
- **Explicit Dependencies**: Declaring dependency on `"core": ">=1.0.0"`.
- **Standard Record Metadata**: Automatic management of `id`, `record_date`, `record_status`, `created_at`, `created_by`, `updated_at`, `updated_by`, and `tenant_id`.
- **Auto-Generated SDUI**: Generic Dashboard (insights), DataTable, and Form rendered seamlessly via server-driven UI.
- **Auto-Generated RBAC**: Automatic permission provisioning across platform roles (`hello-notes.note.read`, `hello-notes.note.create`, `hello-notes.note.update`, `hello-notes.note.delete`, `hello-notes.note.approve`).
- **Generated AI Capabilities**: Auto-registration of `hello-notes.note.list`, `hello-notes.note.get`, `hello-notes.note.create`, `hello-notes.note.update`, etc., into the central Capability Registry.

---

## 3. Package Structure

```text
hello-notes/
├── README.md
├── module.json
└── schema.json
```

No `services/`, no `controllers/`, no `ai/` folder, and no custom React components exist.

---

## 4. Architectural Decisions

1. **Schema is the Single Source of Truth**: The database schema, validation rules, API contracts, SDUI layout, and AI capability descriptors are all derived directly from `schema.json`.
2. **Relationships via References**: The `assigned_to` field references `core.user` instead of creating a redundant user table.
3. **AI Never Accesses SQL Directly**: AI interactions with notes occur strictly through the platform's registered capabilities (`hello-notes.note.*`) where authentication, tenant isolation, and RBAC are guaranteed.
4. **Business Date Filtering**: The standard `record_date` field is used for business queries (e.g. "show today's notes").

---

## 5. How to Install & Activate

1. Place the `hello-notes` folder inside `public_html/modules/`.
2. In the Admin surface (Module Management), click **Discover** (or boot the server).
3. Click **Install** and **Enable**.

---

## 6. How to Test

### API & Data Verification
- **List Notes:** `GET /data/hello-notes/note`
- **Insights:** `GET /data/hello-notes/note/insights`
- **Create Note:** `POST /actions/hello-notes/note` with `{ "title": "My Note", "content": "Details...", "assigned_to": "<user_id>" }`
- **Page SDUI:** `GET /ui/pages/app/hello-notes`
- **Form SDUI:** `GET /ui/views/hello-notes/note/form`

### AI Discovery & Natural Language
- *"Show me my notes."* → invokes `hello-notes.note.list`
- *"Create a note titled Team Sync."* → invokes `hello-notes.note.create`
- *"Show notes created today."* → filters `hello-notes.note.list` by `record_date = today`

---

## 7. What NOT to Copy

- **Do NOT create custom backend controllers or services** when generic CRUD meets the business requirements.
- **Do NOT create an `ai/` directory or custom AI agent** for simple schema-driven CRUD entities.
- **Do NOT duplicate user tables** or access another module's database directly.
