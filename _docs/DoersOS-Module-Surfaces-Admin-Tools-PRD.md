# DoersOS Module Surfaces & Admin Tools — PRD

**Status:** Draft  
**Version:** 1.0  
**Depends on:** `DoersOS-SDUI-PRD.md`, `DoersOS-stack.md`, `DoersOS-AI-Agent-SDUI-PRD.md`

---

## 1. Objective

Add a module-surface system that separates:

- User-facing **Apps**
- Admin-facing **Admin Tools**
- Future module surfaces such as Settings or Developer Tools

A module declares which surface(s) it belongs to.

The surface controls **discovery and navigation**.

RBAC and backend authorization remain the actual security controls.

---

# 2. Core Rule

> **Surface determines where a module appears. RBAC determines what a user can access or do.**

Never use:

```text
/admin
/data/admin-tools
surfaces: ["admin"]
```

as a security boundary.

All protected APIs must independently enforce authentication, tenant isolation, permissions, and authorization.

---

# 3. Module Surfaces

Initial supported surfaces:

```text
app
admin
```

Future surfaces may include:

```text
settings
developer
system
```

A module can belong to one or more surfaces.

### User App

```json
{
  "id": "todo",
  "surfaces": ["app"]
}
```

### Admin Tool

```json
{
  "id": "user-management",
  "surfaces": ["admin"]
}
```

### Both

```json
{
  "id": "crm",
  "surfaces": ["app", "admin"]
}
```

---

# 4. Module Manifest

`module.json` declares the module surfaces.

Example:

```json
{
  "id": "todo",
  "name": "Todo",
  "version": "1.0.0",

  "surfaces": [
    "app"
  ]
}
```

Admin module:

```json
{
  "id": "user-management",
  "name": "User Management",
  "version": "1.0.0",

  "surfaces": [
    "admin"
  ]
}
```

Do not infer the surface from the module name or URL.

---

# 5. Apps Discovery

The normal Apps launcher uses:

```http
GET /data/apps
```

It returns modules intended for the `app` surface.

Example:

```json
[
  {
    "id": "todo",
    "name": "Todo",
    "icon": "todo"
  },
  {
    "id": "crm",
    "name": "CRM",
    "icon": "crm"
  }
]
```

Admin-only modules must not appear in this response.

---

# 6. Admin Tools Discovery

Admin Tools uses:

```http
GET /data/admin-tools
```

It returns modules intended for the `admin` surface.

Example:

```json
[
  {
    "id": "user-management",
    "name": "User Management",
    "icon": "users"
  },
  {
    "id": "module-management",
    "name": "Module Management",
    "icon": "modules"
  }
]
```

The endpoint is a **discovery API**.

It is not the authorization mechanism.

---

# 7. Filtering Discovery Results

Discovery endpoints should return only modules that:

1. Are installed
2. Are enabled
3. Belong to the requested surface
4. Are visible to the current user according to the platform's discovery rules

However, even if a module is returned:

> Every subsequent protected API request must perform its own authorization check.

Do not assume:

```text
Returned by /data/admin-tools
```

means:

```text
User is authorized for every operation in the module.
```

---

# 8. UI Routing

Use separate UI namespaces for clarity.

### User apps

```text
/ui/pages/home
/ui/pages/app/todo
/ui/pages/app/crm
```

### Admin tools

```text
/ui/pages/admin/user-management
/ui/pages/admin/module-management
```

The namespace communicates the **product context**.

It does not provide security.

---

# 9. Admin Context

When the user opens an Admin Tool, the application shell changes context.

Example:

```text
DoersOS Home
    |
    +--> Admin Tools
            |
            +--> User Management
```

The selected module can provide:

```text
Brand
Icon
Navigation
Sections
```

Example:

```text
Brand: User Management
Navigation: User Management navigation
Sections:
  - User insights
  - Users table
  - User form
```

The existing SDUI architecture handles rendering.

---

# 10. Module Surface vs RBAC

These are separate concerns.

### Surface

Answers:

> Where should this module appear?

Example:

```json
{
  "surfaces": ["admin"]
}
```

### RBAC

Answers:

> What may this user do?

Example:

```text
user.read
user.create
user.update
user.delete
```

### Backend authorization

Answers:

> Should this particular operation succeed?

Example:

```text
POST /data/users
       ↓
Authentication
       ↓
Tenant check
       ↓
Permission check
       ↓
Operation
```

---

# 11. Example: Admin Tool With Restricted Actions

User may see:

```text
Admin Tools
  └── User Management
```

but may only have:

```text
user.read
user.update
```

The UI should therefore not expose Create/Delete actions when unavailable.

But the backend must still reject:

```http
DELETE /data/users/:id
```

if the user lacks:

```text
user.delete
```

---

# 12. Module Manifest Example

Complete example:

```json
{
  "id": "user-management",
  "name": "User Management",
  "version": "1.0.0",

  "surfaces": [
    "admin"
  ],

  "permissions": "permissions.json",

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

A normal app:

```json
{
  "id": "todo",
  "name": "Todo",
  "version": "1.0.0",

  "surfaces": [
    "app"
  ]
}
```

A hybrid module:

```json
{
  "id": "crm",
  "name": "CRM",
  "version": "1.0.0",

  "surfaces": [
    "app",
    "admin"
  ]
}
```

---

# 13. Surface Registry

DoersOS Core should maintain a controlled list of valid surfaces.

Initial registry:

```text
app
admin
```

The module installer must reject unknown surfaces.

Example:

```json
{
  "surfaces": [
    "super-secret"
  ]
}
```

must not silently create a new application surface.

New platform surfaces require a core/platform change.

---

# 14. Module Registry

Installed modules are registered centrally.

Conceptually:

```text
Module Registry
│
├── todo
│   └── app
│
├── crm
│   ├── app
│   └── admin
│
├── user-management
│   └── admin
│
└── module-management
    └── admin
```

Discovery APIs query the registry.

---

# 15. Navigation

Navigation belongs to the module/page context.

A module may provide no navigation:

```json
{
  "navigation": {
    "items": []
  }
}
```

or provide module-specific navigation:

```json
{
  "navigation": {
    "items": [
      {
        "id": "users",
        "label": "Users"
      },
      {
        "id": "roles",
        "label": "Roles"
      }
    ]
  }
}
```

Navigation visibility must not be treated as authorization.

---

# 16. AI Integration

The AI orchestrator should know module surfaces when deciding how to present a module.

For example:

```text
User:
"Show me user management."

Orchestrator:
  → identifies User Management module
  → determines it is admin surface
  → checks user authorization
  → continues only if authorized
```

The AI must not bypass Admin Tools discovery or RBAC.

An AI agent can be associated with an admin module, but its skills must use the same backend authorization rules as normal UI operations.

---

# 17. Admin-Only AI Operations

Example:

```text
User:
"Create a new user called John."
```

Possible flow:

```text
AI Orchestrator
      ↓
User Management Agent
      ↓
create-user skill
      ↓
RBAC: user.create
      ↓
Backend authorization
      ↓
Create user
```

The fact that the request came through AI does not weaken authorization.

---

# 18. Security Requirements

### Never use surface as security

Do not implement:

```ts
if (module.surface === 'admin') {
  allow();
}
```

### Never use URL as security

Do not implement:

```ts
if (url.startsWith('/admin')) {
  allow();
}
```

### Never use UI visibility as security

Do not implement:

```json
{
  "visible": false
}
```

as authorization.

### Always enforce on the backend

```text
Authentication
      ↓
Tenant isolation
      ↓
Permission
      ↓
Resource/record authorization
      ↓
Operation
```

---

# 19. Multi-Tenant Consideration

Admin access must still respect tenant scope unless an explicit platform-level permission allows cross-tenant administration.

Distinguish:

```text
Tenant Admin
```

from:

```text
Platform Admin
```

Do not assume every `admin` surface has global access.

Example:

```text
Tenant Admin
  → manage users in their tenant

Platform Admin
  → manage tenants/modules/platform configuration
```

The exact roles belong to the RBAC design, not the surface definition.

---

# 20. Future Extensibility

The surface model should allow future additions without changing the module architecture.

Potential examples:

```text
app
admin
settings
developer
system
```

A module may eventually declare:

```json
{
  "surfaces": [
    "app",
    "settings"
  ]
}
```

The core controls which surfaces are valid.

---

# 21. V1 Scope

Implement:

```text
Surface Registry
  ├── app
  └── admin

Discovery
  ├── GET /data/apps
  └── GET /data/admin-tools

UI namespaces
  ├── /ui/pages/app/...
  └── /ui/pages/admin/...

Module manifest
  └── surfaces[]

Module Registry integration
RBAC enforcement
```

Use existing SDUI, module, and AI architecture for everything else.

---

# 22. Definition of Done

- [ ] Modules can declare one or more surfaces.
- [ ] `app` and `admin` are supported.
- [ ] Unknown surfaces are rejected.
- [ ] `/data/apps` returns app-surface modules.
- [ ] `/data/admin-tools` returns admin-surface modules.
- [ ] Admin-only modules do not appear in Apps discovery.
- [ ] Modules can belong to both surfaces.
- [ ] App and Admin UI routes use separate namespaces.
- [ ] Module-provided navigation works in both contexts.
- [ ] Surface is never used as an authorization mechanism.
- [ ] Backend RBAC remains mandatory for every protected operation.
- [ ] Tenant isolation remains mandatory.
- [ ] Tenant Admin and Platform Admin can be distinguished by permissions.
- [ ] AI access to admin capabilities follows the same authorization rules.
- [ ] Discovery does not grant operational access.
