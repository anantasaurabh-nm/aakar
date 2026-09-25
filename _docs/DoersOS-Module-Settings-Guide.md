# DoersOS Module Settings & Dynamic Connector Binding Guide

**Status:** Active Standard  
**Version:** 1.0  
**Location:** `backend/src/core/module-settings/`, `modules/*/module.json`, `frontend/src/components/sdui/ModuleSettingsView.tsx`

---

## 1. Overview & Architectural Principles

In DoersOS, business modules (such as `todo`, `invoicing`, `employees`) frequently need to integrate with external connectors (e.g., **MCP Servers**, **Trello**, **GitHub**, **Stripe**) and runtime parameters without hardcoding connection IDs or credentials into module source code.

The **Module Settings System** enables any module to declare configurable settings directly in its `module.json` manifest.

### Core Capabilities
1. **100% Server-Driven UI (SDUI)**: Adding a field to `module.json` automatically generates the form layout, input controls, and validation rules. No frontend coding is required.
2. **Dynamic Connector Binding**: Setting fields with `"type": "connection"` automatically query active connections from the database and render clean dropdown options.
3. **Multi-Scope Resolution**: Supports both `"global"` (tenant-wide configuration managed by administrators) and `"user"` (personal preferences per user).
4. **Dedicated Full-Page View (No Popups)**: Navigating to `/app/:appId?view=settings` opens a dedicated full-page settings surface with a back button and card layout.
5. **Top-Left Brand Gear Icon**: A subtle gear icon (`⚙️`) appears directly beside the module brand in the top navigation bar whenever a module declares settings.
6. **AI Discoverability & Execution**: Users can ask DOERS Copilot natural language questions like *"open todo settings"* or *"show me settings of todo"*, and the AI immediately loads the interactive settings form directly on the main left pane (`mode: "ui"`).

---

## 2. Declaring Settings in `module.json`

Modules define their configurable settings in the `"settings"` block of `module.json`:

```json
{
  "id": "todo",
  "name": "Todo",
  "version": "1.1.0",
  "type": "custom",
  "settings": {
    "title": "Todo & Task Sync Settings",
    "description": "Configure external connectors, MCP servers, and automation parameters for Todo.",
    "fields": [
      {
        "key": "mcpTaskServer",
        "label": "Task Processing MCP Server",
        "type": "connection",
        "provider": "mcp",
        "required": false,
        "scope": "global",
        "access": "admin",
        "helpText": "Select an active MCP Server to enable autonomous task planning and tool execution."
      },
      {
        "key": "trelloSyncConnection",
        "label": "Trello Board Connection",
        "type": "connection",
        "provider": "trello",
        "required": false,
        "scope": "user",
        "access": "user",
        "helpText": "Select your personal Trello connection for syncing assigned cards to your todo list."
      },
      {
        "key": "autoSyncInterval",
        "label": "Auto-Sync Frequency (Minutes)",
        "type": "number",
        "defaultValue": 15,
        "scope": "global",
        "access": "admin",
        "helpText": "How often background sync jobs query external connectors."
      },
      {
        "key": "enableAiAutoPrioritization",
        "label": "Enable AI Auto-Prioritization",
        "type": "switch",
        "defaultValue": true,
        "scope": "global",
        "access": "admin",
        "helpText": "Automatically analyze task descriptions and suggest priority flags."
      }
    ]
  }
}
```

---

## 3. Supported Field Types

| Type | Description | SDUI Renderer |
| :--- | :--- | :--- |
| `connection` | Binds to an active connector in the database (filtered by `provider`, e.g., `"mcp"`, `"trello"`, or `"any"`). | Dynamic `<select>` dropdown populated with active tenant connections |
| `switch` | Boolean toggle flag | Toggle switch (`<input type="checkbox" />`) |
| `number` | Numeric values (e.g. interval, threshold, limit) | Number input (`<input type="number" />`) |
| `text` | Single line string | Text input (`<input type="text" />`) |
| `textarea` | Multiline text (e.g. system prompts, JSON templates) | Textarea (`<textarea />`) |
| `select` | Static enum options from `options: [{ label, value }]` | Dropdown (`<select />`) |
| `password` | Secret string (masked in display) | Password input (`<input type="password" />`) |

---

## 4. Scoping & Access Control

Each field specifies its resolution scope and access level:

### Scope (`scope`)
- `"global"`: One value shared across the entire tenant. Saved in `module_settings` with `userId = null`.
- `"user"`: Per-user setting override (e.g. personal Trello connection or default view style). Saved in `module_settings` with `userId = currentUserId`.

### Resolution Hierarchy
When a module requests a setting value via `ModuleSettingsService.get(tenantId, moduleId, key, userId)`:
1. Checks for a **user-specific value** in `module_settings` (`userId = currentUserId`).
2. If absent, falls back to the **global tenant value** in `module_settings` (`userId = null`).
3. If absent, returns the **`defaultValue`** declared in `module.json`.

### Access (`access`)
- `"admin"`: Can only be viewed and modified by users with `ADMIN`, `SYSTEM_ADMIN`, or `SUPER_ADMIN` roles. Non-admins see the field disabled.
- `"user"`: Any authenticated user can modify this setting for their own account.

---

## 5. Using Settings in Backend Code

The `ModuleSettingsService` provides a clean API for capabilities, workflows, and cron jobs:

```typescript
import { Injectable } from '@nestjs/common';
import { ModuleSettingsService } from '../module-settings/module-settings.service';

@Injectable()
export class TodoSyncService {
  constructor(private readonly settingsService: ModuleSettingsService) {}

  async syncTasks(tenantId: string, userId: string) {
    // 1. Get a pre-authenticated HTTP client for the bound MCP Server or Trello connection
    const mcpClient = await this.settingsService.getConnectionClient(tenantId, 'todo', 'mcpTaskServer');
    if (mcpClient) {
      const toolResult = await mcpClient.post('/tools/call', { name: 'plan_tasks', arguments: {} });
    }

    // 2. Get scalar setting values (merges user overrides over global defaults)
    const interval = await this.settingsService.get(tenantId, 'todo', 'autoSyncInterval', userId);
    const aiEnabled = await this.settingsService.get(tenantId, 'todo', 'enableAiAutoPrioritization', userId);
  }
}
```

---

## 6. User Interface & AI Copilot Integration

### 1. Top-Left Navigation Gear Icon
When a module declares settings in its `module.json`, the SDUI brand schema includes `hasSettings: true` and `moduleId: "<id>"`.  
The `Header` component displays a subtle gear icon button `⚙️` beside the module name. Clicking it navigates to:
```text
/app/:appId?view=settings
```

### 2. Full-Page Settings View (`ModuleSettingsView`)
The settings interface is rendered as a clean full-page view (never an intrusive modal or popup):
- Back button to return to the module table/insights.
- Header showing module settings title and description.
- Live `DynamicForm` rendering with connection options and saved values.
- Automatic toast notifications upon saving.

### 3. AI Copilot Discoverability
Users can ask DOERS Copilot in natural language:
- *"Show me the settings of todo"*
- *"Open todo settings"*
- *"Configure todo"*
- *"Change the settings for todo"*

The AI Orchestrator matches the settings intent and returns an SDUI `mode: "ui"` response containing the live settings form, instantly loading the configuration interface right on the main left pane!

---

## 7. Database Persistence

Settings are stored in the PostgreSQL `module_settings` table:

```sql
CREATE TABLE IF NOT EXISTS "module_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "user_id" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "module_settings_tenant_module_user_key_idx"
ON "module_settings" ("tenant_id", "module_id", "user_id", "key");
```
