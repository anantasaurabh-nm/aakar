# DoersOS Technology Stack

**Status:** Approved baseline  
**Audience:** Developers  
**Purpose:** Standard technology choices for the DoersOS SDUI and modular ERP platform.

---

## 1. Stack Summary

| Area | Technology | Rule |
|---|---|---|
| Web | Next.js | Use for the DoersOS web application |
| UI | React | Build reusable, predefined components |
| Language | TypeScript | Strict mode; avoid `any` |
| Backend | NestJS | Modular backend architecture |
| API style | REST + OpenAPI | Keep domain APIs explicit |
| Runtime validation | Zod | Validate external/server input at runtime |
| Server state | TanStack Query | API fetching, caching, refetching |
| Forms | React Hook Form + Zod | Dynamic and validated forms |
| Tables | TanStack Table | Table behavior; DoersOS owns presentation |
| Global client state | Zustand / React state | Use only when needed |
| Testing | Vitest + Playwright | Unit/integration + E2E |
| Shared contracts | TypeScript package | Single source of truth for SDUI contracts |

Do not introduce another framework/library for these responsibilities without architectural approval.

---

# 2. Architecture

```text
                         DoersOS
                            |
             +--------------+--------------+
             |                             |
          Frontend                       Backend
             |                             |
        Next.js + React                NestJS
        TypeScript                     TypeScript
             |                             |
        +----+----+                  +-----+-----+
        |         |                  |           |
      SDUI      Data              Domain       Auth
        |         |                  |           |
        +----+----+                  +-----+-----+
             |
       Shared Contracts
             |
       @erp/shared-contracts
```

---

# 3. Frontend

## 3.1 Next.js

Use Next.js as the web application framework.

Responsibilities:

- Routing
- Application shell
- Server/client rendering where appropriate
- Authentication integration
- API integration
- Static assets

Do not put business logic into Next.js route components when it belongs in domain services.

---

## 3.2 React

React is the UI rendering layer.

DoersOS should use **predefined, reusable components** rather than arbitrary server-generated component trees.

Core SDUI renderers:

```text
SDUIPageRenderer
SDUISectionRenderer
SectionRotator
Dashboard
DataTable
DynamicForm
Toolbar
Filter
Action
```

Example:

```ts
const sectionRenderers = {
  dashboard: Dashboard,
  table: DataTable,
  form: DynamicForm,
};
```

The server provides `type: "table"`.

The client decides that `table` means `DataTable`.

Never allow the server to provide an arbitrary React component name.

---

# 4. TypeScript

TypeScript is mandatory.

Use strict TypeScript configuration.

Prefer:

```ts
type SDUISection = {
  id: string;
  type: SDUISectionType;
};
```

Avoid:

```ts
const section: any = response.section;
```

When data comes from an external source, TypeScript types alone are not enough. Use runtime validation.

---

# 5. Runtime Validation — Zod

Use Zod to validate:

- API responses
- SDUI responses
- User input
- Action parameters
- External configuration

Example:

```ts
const SDUISectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['dashboard', 'table', 'form']),
});
```

Never assume that because TypeScript says data is valid, the runtime data is valid.

TypeScript disappears at runtime.

---

# 6. Shared Contracts

Existing direction:

```ts
import { SDUISection } from '@erp/shared-contracts';
```

Keep all shared API/SDUI contracts in a shared package.

Recommended:

```text
packages/
└── shared-contracts/
    ├── sdui/
    │   ├── page.ts
    │   ├── section.ts
    │   ├── toolbar.ts
    │   ├── action.ts
    │   ├── dashboard.ts
    │   ├── table.ts
    │   └── form.ts
    │
    └── api/
```

The frontend and backend must not maintain separate copies of the same contract.

---

# 7. TanStack Query

Use TanStack Query for server state.

Use it for:

- Fetching data
- Caching
- Refetching
- Loading state
- Error state
- Mutation state
- Query invalidation

Example:

```ts
const { data, isLoading, error } = useQuery({
  queryKey: ['todo', 'tasks'],
  queryFn: fetchTodoTasks,
});
```

Do not copy API data into global Zustand state just because it is convenient.

Server data belongs in TanStack Query.

---

# 8. State Management

Prefer this order:

```text
Local component state
        ↓
React context when appropriate
        ↓
TanStack Query for server state
        ↓
Zustand for genuinely global client state
```

Do not create a global store for every piece of state.

Examples of appropriate global state:

```text
Current authenticated user
Current app context
Global UI preferences
Certain persistent client-side settings
```

Examples that normally should NOT be global state:

```text
Table rows
Dashboard API response
Form field values
Loading states for one component
```

---

# 9. Forms

Use:

```text
React Hook Form
        +
Zod
```

The SDUI `form` configuration defines fields and behavior.

The actual form renderer is a predefined DoersOS component.

Example:

```text
SDUI
 ↓
DynamicForm
 ↓
React Hook Form
 ↓
Zod validation
 ↓
API action
```

Never trust client-side validation as a security boundary.

The backend must validate the submitted data again.

---

# 10. Tables

Use TanStack Table for table behavior.

DoersOS owns the actual UI.

```text
SDUI
 ↓
DataTable
 ↓
TanStack Table
 ↓
DoersOS Design System
```

The SDUI contract can configure:

```text
columns
sorting
filtering
pagination
selection
actions
density
```

The server must not provide arbitrary JavaScript/table callbacks.

---

# 11. Backend — NestJS

Use NestJS for backend services.

DoersOS is modular, so organize backend code by domain/app.

Example:

```text
apps/
├── todo/
├── crm/
├── finance/
├── hr/
├── inventory/
└── operations/

core/
├── auth/
├── permissions/
├── tenancy/
└── sdui/
```

Each app should own its domain behavior.

Avoid creating one giant `AppService` or giant controller.

---

# 12. REST APIs

Use REST for the initial implementation.

Separate API responsibilities:

```text
/ui/pages/...
        ↓
SDUI configuration

/data/...
        ↓
Domain/application data

/actions/...
        ↓
Mutations/actions
```

Examples:

```http
GET /ui/pages/home
GET /ui/pages/app/todo

GET /data/apps
GET /data/todo/insights
GET /data/todo/tasks
```

For V1, data endpoints may return static JSON fixtures.

---

# 13. OpenAPI

Use OpenAPI as the API contract for REST endpoints.

Document:

- Request parameters
- Request body
- Response structure
- Error responses
- Authentication requirements
- Authorization requirements

Do not rely only on informal documentation.

---

# 14. SDUI Architecture

SDUI is **not** a generic remote React renderer.

Use this model:

```text
Server
  |
  | SDUI JSON
  ↓
SDUI Validator
  |
  ↓
SDUIPageRenderer
  |
  ↓
SectionRotator
  |
  +--> Dashboard
  +--> DataTable
  +--> DynamicForm
  +--> Future renderer types
```

The server describes the experience.

The client owns the actual implementation.

---

# 15. SectionRotator

`SectionRotator` is a client-side component.

It accepts heterogeneous sections:

```text
Section A → Dashboard
Section B → DataTable
Section C → Form
Section D → Detail
```

It must not contain business logic for individual section types.

Its responsibility is:

- Section ordering
- Active section
- Rotation
- Section transition
- Scroll handling
- Active section callback

Rendering is delegated to the SDUI renderer.

---

# 16. Security Rules

These rules are mandatory.

## 16.1 SDUI is not authorization

Never assume:

```json
{
  "visible": false
}
```

protects anything.

The backend must independently authorize every protected operation.

---

## 16.2 Never execute server-provided code

Never accept:

```text
JavaScript
eval()
Function()
arbitrary callbacks
HTML containing scripts
```

from SDUI.

---

## 16.3 Never execute arbitrary URLs

Do not implement:

```json
{
  "action": {
    "url": "https://example.com/anything"
  }
}
```

as a generic action mechanism.

Use controlled action types:

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

---

## 16.4 Controlled registries

Data sources, actions, icons, and section types should use known registries.

Example:

```ts
const dataSources = {
  'todo.tasks': fetchTodoTasks,
  'todo.insights': fetchTodoInsights,
};
```

Unknown source:

```text
reject / safe error
```

Do not dynamically construct arbitrary API URLs from server input.

---

## 16.5 Backend authorization

Every backend endpoint must validate:

```text
Authentication
      ↓
Tenant/company access
      ↓
Application permission
      ↓
Record-level permission where required
      ↓
Operation
```

Never rely on frontend checks.

---

# 17. Authentication and Tenant Isolation

Every authenticated request must have a trusted server-side identity.

Never trust client-provided:

```text
userId
tenantId
companyId
role
permissions
```

unless the backend independently verifies them.

For multi-tenant data:

```text
Authenticated User
       ↓
Resolved Tenant
       ↓
Permission Check
       ↓
Query restricted to tenant
```

A user must never be able to change a request parameter to access another company's records.

---

# 18. Error Handling

Every data-driven component must handle:

```text
Loading
Success
Empty
Error
```

Example:

```text
DataTable
 ├── Loading
 ├── Rows
 ├── Empty state
 └── Error state
```

A bad section must not crash the entire page.

Example:

```text
Section A → renders
Section B → renders
Section C → invalid → safe fallback
Section D → renders
```

---

# 19. Testing

## Unit / Integration

Use Vitest.

Test:

- SDUI validation
- Renderer mapping
- Toolbar behavior
- Action mapping
- Data-source mapping
- Permission helpers
- Domain services

## End-to-End

Use Playwright.

Test critical flows:

```text
Login
 ↓
DoersOS Home
 ↓
Open Todo
 ↓
SDUI loads
 ↓
Dashboard renders
 ↓
Table renders
 ↓
Filter works
 ↓
New action
 ↓
Form
 ↓
Submit
```

---

# 20. What Not To Add

Do not introduce these for V1 without architectural approval:

```text
GraphQL
Generic component-tree SDUI
Micro-frontends
Arbitrary plugin-loaded React components
Server-side JavaScript execution
Generic remote URLs
Large global state architecture
Multiple competing UI frameworks
```

The initial architecture should remain simple.

---

# 21. Development Rules

### Rule 1 — Server describes; client renders

```text
Server → configuration
Client → implementation
```

### Rule 2 — Domain data is not SDUI

```text
/ui → UI definition
/data → domain data
```

### Rule 3 — UI permissions are not security

Backend authorization is mandatory.

### Rule 4 — Prefer reusable components

Build one good:

```text
DataTable
Dashboard
DynamicForm
Toolbar
```

rather than separate versions for every app.

### Rule 5 — Keep contracts typed

Use:

```text
TypeScript + Zod + OpenAPI
```

### Rule 6 — Fail safely

Unknown or invalid server configuration must not crash the application.

### Rule 7 — Do not over-engineer V1

Build the known DoersOS primitives first.

---

# 22. V1 Component Map

```text
                    SDUI
                      |
               SDUIPageRenderer
                      |
               SectionRotator
                      |
             SDUISectionRenderer
                      |
       +--------------+--------------+
       |              |              |
   Dashboard       DataTable     DynamicForm
       |              |              |
    Toolbar        Toolbar        Toolbar
       |              |              |
    Filters       Filters         Actions
       |              |              |
       +--------------+--------------+
                      |
              DoersOS Design System
```

---

# 23. V1 Technology Decision

Use:

```text
Frontend
  Next.js
  React
  TypeScript
  Zod
  TanStack Query
  React Hook Form
  TanStack Table
  Zustand (only where needed)
  Vitest
  Playwright

Backend
  NestJS
  TypeScript
  REST
  OpenAPI
  Zod/runtime validation where appropriate

Shared
  @erp/shared-contracts
```

The stack is intentionally conventional. The differentiation of DoersOS should come from its **domain model, modular apps, SDUI contract, reusable business components, and product experience**, not from using unusual frameworks.
