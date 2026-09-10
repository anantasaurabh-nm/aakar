# Hello Views (`hello-views`)

**Canonical Reference Module — Level 2: Custom Server-Driven UI (SDUI) Presentation**

---

## 1. Architectural Purpose

`hello-views` demonstrates how a module can define a **custom Server-Driven UI presentation** without modifying any core platform code or writing custom React components.

By placing a declarative page layout in `ui/views/home.json`, the module overrides the platform's default auto-generated view while continuing to use standard, shared platform renderer components.

---

## 2. Key Architectural Lessons

1. **Heterogeneous Sections on One Surface**:
   The home view combines three fundamentally different section types on a single page:
   - **Section A (`dashboard`)**: Visual aggregated metrics with period filtering (`today`, `this_week`, `this_month`, `all_time`).
   - **Section B (`table`)**: Interactive data grid with search, record status filters, column visibility toggles, and detail view.
   - **Section C (`form`)**: Creation form with field validations and dynamic user selection.

2. **`SectionRotator` Integration**:
   - The platform's built-in `SectionRotator` automatically manages the 3 sections.
   - Clicking any section's accordion header rotates the active pane into focus with smooth, GPU-accelerated CSS translation.
   - The module does not implement custom scrolling or rotation logic — the platform renderer owns it entirely.

3. **Section-Specific Toolbars**:
   - Each section defines its own contextual toolbar actions:
     - Dashboard toolbar: Period filter dropdown (`recordDate`).
     - Table toolbar: New Note action, Search input, Status filter, Columns toggle, Refresh.
     - Form toolbar: Save (submit) and Cancel actions.

4. **App Shell Top Navigation (`navigation.items`)**:
   - Views can define a top-level `navigation.items` array rendered inside the application header next to the brand title.
   - Provides quick cross-app routing (`/app/<moduleId>`), hub navigation (`/`), admin tools (`/admin`), or in-page anchor links.
   - Supports icons resolved by `resolveIcon()`, active route highlighting, and optional confirmation dialogs.

5. **Contextual Identity Tokens (`$currentuser`)**:
   - Views and queries can reference the currently authenticated user dynamically without hardcoding IDs.
   - `$currentuser` (or `$currentuser.id`) resolves server-side to the authenticated `user.id`.
   - Sub-tokens: `$currentuser.username`, `$currentuser.email`, `$currentuser.role`.
   - Compatible with custom references (`assigned_to: "$currentuser"`) and system audit columns (`created_by: "$currentuser"`).

6. **Custom Detail Views & Declarative Layout Grids**:
   - Modules can customize their detail/edit view by placing a declarative view file at `ui/views/<entity>-form.json` (e.g. `ui/views/note-form.json`).
   - Uses **declarative layout groups** (`columns: 2`, `groups: [...]`) instead of dangerous raw HTML strings, preserving theme consistency, responsiveness, and XSS safety.

7. **Master-Detail Linked Records (`relatedSections`)**:
   - Detail views can display related records from other tables in interactive tabs at the bottom via `relatedSections`.
   - Supports dynamic parameter binding (e.g. `"category": "$record.category"` or `"assigned_to": "$currentuser"`).
   - Each related tab reuses the full `<DataTable />` with dedicated search, sorting, filtering, and export.
   - Respects user permissions automatically: if a user lacks access to a related source, that tab is hidden.

---

## 3. Top Navigation (`navigation.items`) Specification

Inside `ui/views/home.json`, the `navigation` object specifies header links:

```json
{
  "schema": "1.0",
  "brand": {
    "name": "Hello Views",
    "icon": "layout"
  },
  "navigation": {
    "items": [
      {
        "id": "nav-perspectives",
        "label": "Perspectives",
        "icon": "layout",
        "items": [
          {
            "id": "persp-all-notes",
            "label": "All Notes",
            "icon": "notes",
            "action": { "type": "navigate", "target": "#note-table" }
          },
          {
            "id": "persp-my-notes",
            "label": "Assigned to Me",
            "icon": "users",
            "badge": "Mine",
            "action": { "type": "navigate", "target": "#my-notes" }
          },
          {
            "id": "persp-insights",
            "label": "Analytics & Insights",
            "icon": "activity",
            "action": { "type": "navigate", "target": "#note-insights" }
          }
        ]
      },
      {
        "id": "nav-quick-actions",
        "label": "Quick Actions",
        "icon": "sparkles",
        "items": [
          {
            "id": "act-new-note",
            "label": "Create New Note",
            "icon": "notes",
            "action": { "type": "navigate", "target": "#note-form" }
          },
          {
            "id": "act-new-task",
            "label": "Create Todo Task",
            "icon": "todo",
            "action": { "type": "navigate", "target": "/app/todo" }
          }
        ]
      },
      {
        "id": "nav-bridges",
        "label": "Related Apps",
        "icon": "modules",
        "items": [
          {
            "id": "bridge-todos",
            "label": "My Todos",
            "icon": "todo",
            "action": { "type": "navigate", "target": "/app/todo" }
          },
          {
            "id": "bridge-datasources",
            "label": "Data Sources Demonstration",
            "icon": "database",
            "action": { "type": "navigate", "target": "/app/hello-datasources" }
          },
          {
            "id": "bridge-admin",
            "label": "Admin Tools",
            "icon": "settings",
            "action": { "type": "navigate", "target": "/admin" }
          },
          {
            "id": "bridge-apps-hub",
            "label": "Apps Hub",
            "icon": "home",
            "action": { "type": "navigate", "target": "/" }
          }
        ]
      }
    ]
  }
}
```

### Supported Item Properties

| Property | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier for the navigation item. |
| `label` | `string` | Display text shown on the menu button or dropdown option. |
| `icon` | `string` (optional) | Icon key resolved via `resolveIcon()` (`home`, `notes`, `todo`, `database`, `modules`, `layout`, `settings`, `sparkles`, `activity`, etc.). |
| `badge` | `string \| number` (optional) | Small pill badge attached to the item (e.g. `"Mine"`, `"3"`, `"New"`). |
| `items` | `SDUINavigationItem[]` (optional) | Sub-items array turning this navigation button into a **dropdown menu**. |
| `action.type` | `"navigate" \| "refresh"` | Action type executed upon clicking. |
| `action.target` | `string` | Navigation destination: `#<sectionId>` (In-page SectionRotator jump), `/app/<moduleId>` (Cross-module app), `/admin` (Admin Tools), `/` (Hub), or `https://...` (External). |
| `action.confirm` | `object` (optional) | Optional confirmation prompt before navigating: `{ "title": "Confirm", "message": "Proceed to external app?" }`. |

---

## 4. Package Structure

```text
hello-views/
├── README.md              <-- This guide
├── module.json            <-- Module manifest & dependencies
├── schema.json            <-- Entity schema ("note" entity)
└── ui/
    └── views/
        ├── home.json      <-- Custom SDUI layout with navigation, dashboard, tables & form
        └── note-form.json <-- Custom detail view with layout grid & related sub-table tabs
```

---

## 5. Custom Detail View Example (`ui/views/note-form.json`)

```json
{
  "id": "note-form",
  "label": "Note Details",
  "type": "form",
  "config": {
    "layout": {
      "groups": [
        {
          "id": "overview",
          "title": "Overview",
          "columns": 2,
          "fields": ["title", "category"]
        },
        {
          "id": "assignment",
          "title": "Assignment & Content",
          "columns": 2,
          "fields": ["assigned_to", "content"]
        }
      ]
    },
    "fields": [ ... ]
  },
  "relatedSections": [
    {
      "id": "my-notes-tab",
      "label": "My Notes",
      "type": "table",
      "data": {
        "source": "hello-views.note",
        "params": {
          "assigned_to": "$currentuser",
          "pageSize": 5
        }
      }
    },
    {
      "id": "category-notes",
      "label": "Related Category Notes",
      "type": "table",
      "data": {
        "source": "hello-views.note",
        "params": {
          "category": "$record.category"
        }
      }
    }
  ]
}
```

---

## 6. What NOT to Copy (Anti-Patterns)

- ❌ **Do not use raw HTML with string placeholders**: Never write raw HTML templates like `<div>{{title}}</div>` for custom views. Use declarative SDUI layout grids and field groups to maintain theme compatibility and prevent Stored XSS.
- ❌ **Do not couple database tables across modules**: In master-detail tabs, use public data sources (`data.source`) with `$record.<field>` parameter binding instead of joining foreign tables.
- ❌ **Do not hardcode user IDs**: Never hardcode user UUIDs in JSON views. Use `$currentuser` to dynamically bind to the logged-in user session.
- ❌ **Do not create custom React components**: Do not build custom tabs, accordions, or form widgets. Use standard SDUI section contracts (`dashboard`, `table`, `form`).
- ❌ **Do not hardcode tenant user lookups**: References (like `assigned_to -> core.user`) are resolved by the generic `ReferenceResolverService`.

