# DoersOS SDUI — Product & Technical Requirements

**Status:** Draft  
**Version:** 1.0  
**Audience:** Frontend/Backend developers  
**Scope:** SDUI page composition and rendering contract

---

## 1. Objective

Build a Server-Driven UI (SDUI) system for DoersOS.

The server controls:

- Which app/page is active
- Brand and icon
- Optional app navigation
- Which sections appear
- Section type
- Section configuration
- Section toolbar capabilities
- Data source/configuration

The client controls:

- Rendering
- Design system
- Component implementation
- Client-side state
- API execution
- Authorization enforcement at the API layer

The server must **not** send arbitrary React/component trees, HTML, CSS, JavaScript, or executable code.

---

## 2. Core Architecture

```text
                    DoersOS Shell
                         |
                 GET /ui/pages/...
                         |
                    SDUI Page
                         |
                +--------+--------+
                |                 |
              Brand           Navigation

                         |
                    Sections[]
                         |
                  SectionRotator
                         |
          +--------------+--------------+
          |              |              |
      Dashboard        Table           Form
          |              |              |
      Dashboard       DataTable     DynamicForm
```

### Rendering rule

Every `section.type` maps to a predefined client component.

Example:

```text
dashboard -> Dashboard
table     -> DataTable
form      -> DynamicForm
```

Do not allow the server to specify arbitrary client component names.

---

## 3. API Separation

Keep UI definition, business data, and mutations separate.

```text
/ui/pages/...       SDUI composition
/data/...           Domain/application data
/actions/...        Mutations/actions where applicable
```

### Examples

```http
GET /ui/pages/home
GET /ui/pages/app/todo

GET /data/home/dashboard
GET /data/apps
GET /data/todo/insights
GET /data/todo/tasks
```

For the first implementation, `/data/...` endpoints may return static JSON fixtures.

---

## 4. Initial Application Flow

### DoersOS Home

Initial page:

```http
GET /ui/pages/home
```

Expected concept:

```text
Brand: DoersOS
Navigation: empty
Sections:
  - Insights
  - Apps
```

Data may come from:

```http
GET /data/home/dashboard
GET /data/apps
```

### Opening Todo

When the user selects Todo:

```http
GET /ui/pages/app/todo
```

The response can change:

```text
Brand: Todo
Icon: Todo icon
Navigation: Todo-specific navigation, if any
Sections:
  - Todo Insights
  - Todo Tasks
```

The client renders both sections through the same `SectionRotator`.

---

## 5. SDUI Page Contract

Top-level structure:

```json
{
  "schema": "1.0",
  "brand": {},
  "navigation": {},
  "page": {
    "id": "todo",
    "title": "Todo",
    "sections": []
  }
}
```

### `schema`

Contract version.

The client must reject or safely handle unsupported schema versions.

### `brand`

```json
{
  "name": "Todo",
  "icon": "todo"
}
```

The server may provide app branding. The client resolves the icon through a controlled icon registry.

Do not accept arbitrary remote executable content.

### `navigation`

Optional.

```json
{
  "items": [
    {
      "id": "all",
      "label": "All Tasks",
      "action": {
        "type": "navigate",
        "target": "all"
      }
    }
  ]
}
```

An app can return an empty navigation list.

### `page`

Contains the page identity and its sections.

---

## 6. Section Contract

Every section is self-contained and rendered by a predefined component.

Base structure:

```json
{
  "id": "todo-insights",
  "label": "Insights",
  "type": "dashboard",
  "toolbar": [],
  "config": {},
  "data": {}
}
```

### Required fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Stable unique section ID |
| `type` | string | Renderer type |
| `label` | string | Section heading |

### Optional fields

| Field | Type | Description |
|---|---|---|
| `badge` | string/number | Badge displayed in section heading |
| `badgeType` | string | Badge presentation type |
| `toolbar` | array | Toolbar items |
| `config` | object | Type-specific configuration |
| `data` | object | Data configuration or initial data |
| `state` | object | Optional server-provided initial state |

---

## 7. Section Types

Initial supported types:

```text
dashboard
table
form
```

Future types may include:

```text
detail
list
chart
calendar
kanban
timeline
report
```

Adding a new type requires:

1. Client renderer implementation
2. Contract definition
3. Schema validation
4. Security review
5. Fallback behavior for unsupported clients

---

## 8. SectionRotator

`SectionRotator` is a client-side presentation component.

It receives:

```ts
sections: SDUISection[]
```

and renders sections sequentially.

Responsibilities:

- Maintain section order
- Track active section
- Rotate between sections
- Reset section scroll position as currently implemented
- Notify the application when active section changes
- Render each section through the SDUI renderer registry

It must **not** contain business logic for Dashboard, Table, Form, etc.

Conceptually:

```tsx
<SectionRotator
  sections={page.sections}
  renderSection={renderSection}
/>
```

Renderer:

```ts
const renderers = {
  dashboard: Dashboard,
  table: DataTable,
  form: DynamicForm
};
```

---

## 9. Toolbar Contract

Toolbar is common to all section types.

```json
{
  "toolbar": [
    {
      "id": "new",
      "type": "action",
      "label": "New",
      "action": {
        "type": "create"
      }
    }
  ]
}
```

Toolbar items may initially support:

```text
action
filter
search
sort
columns
pagination
date-range
view
```

The actual capabilities depend on the section type.

### Dashboard toolbar

Example:

```json
[
  {
    "id": "period",
    "type": "filter",
    "field": "period",
    "options": [
      { "label": "Today", "value": "today" },
      { "label": "Tomorrow", "value": "tomorrow" },
      { "label": "This Week", "value": "this_week" }
    ]
  },
  {
    "id": "new",
    "type": "action",
    "label": "New",
    "action": {
      "type": "create"
    }
  }
]
```

### Table toolbar

Example:

```json
[
  {
    "id": "new",
    "type": "action",
    "label": "New",
    "action": {
      "type": "create"
    }
  },
  {
    "id": "search",
    "type": "search"
  },
  {
    "id": "filter",
    "type": "filter"
  },
  {
    "id": "columns",
    "type": "columns"
  }
]
```

### Form toolbar

Example:

```json
[
  {
    "id": "cancel",
    "type": "action",
    "label": "Cancel",
    "action": {
      "type": "cancel"
    }
  },
  {
    "id": "save",
    "type": "action",
    "label": "Save",
    "action": {
      "type": "submit"
    }
  }
]
```

---

## 10. Actions

Actions describe intent, not implementation.

Supported initial action types:

```text
navigate
create
edit
submit
delete
refresh
open
close
export
```

Example:

```json
{
  "type": "action",
  "id": "save",
  "label": "Save",
  "action": {
    "type": "submit"
  }
}
```

Do not send arbitrary URLs, JavaScript, function names, or executable expressions from the server.

The client maps action types to approved handlers.

---

## 11. Data Contract

Do not make SDUI a replacement for domain APIs.

A section can reference a known data source:

```json
{
  "data": {
    "source": "todo.tasks"
  }
}
```

The client maps known sources to approved APIs.

Example:

```text
todo.tasks -> GET /data/todo/tasks
todo.insights -> GET /data/todo/insights
```

Avoid:

```json
{
  "data": {
    "url": "https://some-server.com/run-anything"
  }
}
```

The client must use a controlled data-source registry.

---

## 12. Data Refresh

A page does not automatically need to be re-fetched when section data changes.

Separate:

```text
UI definition
      |
      +--> Section
             |
             +--> Data source
```

Example:

```text
GET /ui/pages/app/todo
        |
        +--> Dashboard section
        +--> Table section

GET /data/todo/insights?period=today
GET /data/todo/tasks?page=2
```

Changing a filter should normally refresh the relevant data, not reload the complete SDUI page.

A full SDUI reload is appropriate when page structure, permissions, navigation, or configuration may have changed.

---

## 13. Authorization and Security

### Critical rule

**SDUI visibility is not authorization.**

The backend must enforce authorization on every protected data/action endpoint.

Example:

```text
UI hides "Delete"
       |
       X  NOT a security boundary
       |
POST /actions/delete
       |
Backend authorization check
       |
Allow / Deny
```

Never rely on:

```json
"visible": false
```

to protect an operation.

### Server must control

- User permissions
- Available navigation
- Available sections
- Available actions
- Accessible data

### API must independently enforce

- Authentication
- Authorization
- Tenant/company isolation
- Record-level permissions
- Input validation

Never trust IDs, filters, page numbers, record IDs, or action parameters supplied by the client.

---

## 14. Multi-App / Modular Architecture

DoersOS consists of independent but interdependent apps.

Examples:

```text
Todo
CRM
Finance
HR
Inventory
Operations
...
```

Each app can provide:

```text
Brand
Navigation
Pages
Sections
Data sources
Actions
```

The client should not require a separate hardcoded page implementation for every app.

Instead:

```text
App
  |
  +--> SDUI page
         |
         +--> Section A -> Dashboard
         +--> Section B -> Table
         +--> Section C -> Form
```

This allows new app experiences to be introduced primarily through server configuration while still using approved client capabilities.

---

## 15. Dependency Between Apps

Apps may be independent or interdependent.

Example:

```text
CRM
  |
  +--> Customer data
          |
          +--> Finance
          +--> Todo
```

SDUI should reference domain concepts/data sources, not duplicate business logic.

Do not implement cross-app business rules inside the UI renderer.

---

## 16. Client Renderer Registry

The client should maintain a controlled registry.

```ts
const sectionRenderers = {
  dashboard: Dashboard,
  table: DataTable,
  form: DynamicForm,
};
```

Unknown type:

```text
unsupported section
```

must fail safely.

Do not dynamically import arbitrary modules based on a server-provided string.

---

## 17. Validation

Validate SDUI responses before rendering.

At minimum validate:

- Schema version
- Section IDs
- Section types
- Toolbar item types
- Action types
- Required fields
- Data-source names
- Navigation action types

Invalid sections should fail gracefully without taking down the entire page.

Example:

```text
Valid Section A
Valid Section B
Invalid Section C
Valid Section D
```

Expected behavior:

```text
A renders
B renders
C shows safe fallback/error state
D renders
```

---

## 18. Loading and Error States

Every data-driven renderer must support:

```text
loading
success
empty
error
```

For example:

```text
Dashboard
  ├── Loading
  ├── Data
  ├── Empty
  └── Error
```

Do not require the SDUI server to send a new page definition for every data-loading state.

---

## 19. Caching

The client may cache:

```text
/ui/pages/...
```

and data independently.

UI configuration and business data have different freshness requirements.

Do not assume that cached UI configuration means cached business data is safe to use.

---

## 20. Non-Goals

The first version will NOT support:

- Arbitrary component trees
- Arbitrary React components from the server
- Server-provided JavaScript
- Server-provided CSS
- Arbitrary URLs/actions
- Business logic embedded in SDUI
- Authorization implemented only through SDUI
- A universal page-builder schema

---

## 21. V1 Deliverables

### Backend

Implement static JSON endpoints:

```http
GET /ui/pages/home
GET /ui/pages/app/todo

GET /data/home/dashboard
GET /data/apps
GET /data/todo/insights
GET /data/todo/tasks
```

### Frontend

Implement:

```text
SDUIPageRenderer
SDUISectionRenderer
SectionRotator
Dashboard
DataTable
DynamicForm
Toolbar
Action renderer
Filter renderer
```

### Initial flow

```text
1. Load DoersOS home
2. Render DoersOS brand
3. Render empty navigation
4. Render home sections
5. Show apps
6. User selects Todo
7. Fetch /ui/pages/app/todo
8. Update brand to Todo
9. Update navigation
10. Pass sections to SectionRotator
11. Render Dashboard section
12. Render Table section
13. Dashboard toolbar provides relevant filters
14. Table toolbar provides table controls
15. New action appears where configured
16. Data is fetched independently from SDUI configuration
```

---

## 22. Definition of Done

The implementation is complete when:

- [ ] A page can be rendered entirely from an SDUI response.
- [ ] Sections can contain different renderer types.
- [ ] `SectionRotator` works without knowing section-specific business logic.
- [ ] Dashboard, Table, and Form are reusable predefined components.
- [ ] Each section can have its own toolbar.
- [ ] Toolbar capabilities are declarative.
- [ ] Data loading is independent from UI configuration.
- [ ] Unknown SDUI types fail safely.
- [ ] Backend authorization does not depend on SDUI visibility.
- [ ] No server-provided executable code is accepted.
- [ ] No arbitrary server URLs are executed by the client.
- [ ] Schema versioning is implemented.
- [ ] Invalid SDUI cannot crash the entire page.
