import type { CapabilityDescriptor } from '@erp/shared-contracts';
import type { EntityRegistryService } from '../../entity-engine/entity-registry.service';

/**
 * Builds the comprehensive prompt for the AI Orchestrator classifier and semantic query planner.
 * Injects:
 * 1. Registered capabilities (1 to 100s)
 * 2. Database schemas (core tables + dynamic business modules)
 * 3. Multi-table foreign keys and relational mappings
 * 4. StructuredQuery AST format and few-shot routing examples
 */
export function buildClassifierPrompt(
  capabilities: CapabilityDescriptor[],
  entityRegistry?: EntityRegistryService,
): string {
  const capabilityLines = capabilities
    .map((c) => {
      let line = `- ${c.id}: ${c.description}`;
      if (c.entity && entityRegistry) {
        try {
          const entityDef = entityRegistry.getEntityDefinition(c.module, c.entity);
          if (entityDef?.fields) {
            const fieldsSummary = Object.entries(entityDef.fields)
              .filter(([, f]) => !f.internal)
              .map(([name, f]) => {
                if (f.type === 'select' && f.options) {
                  return `${name} (select: [${f.options.map((o) => `"${o}"`).join(', ')}])`;
                }
                return `${name} (${f.type})`;
              });
            if (fieldsSummary.length > 0) {
              line += `\n    Fields: ${fieldsSummary.join(', ')}`;
            }
          }
        } catch {
          // capability may not be a schema-driven entity
        }
      }
      return line;
    })
    .join('\n');

  return `You are the DoersOS request router and semantic query planner. Given the user's message, choose exactly one capability from the capability list and extract parameters.

Available Capabilities:
${capabilityLines}

Database Schema & Available Fields:
1. Core Entity 'user-management.user' (alias: 'user'):
   - Fields: id (uuid), username (text), email (text), role (enum: SUPER_ADMIN, ADMIN, MANAGER, STAFF, VIEWER, ACCOUNTANT, TENANT_ADMIN), isActive (boolean), createdAt (datetime)
2. Core Entity 'user-roles.role' (alias: 'role'):
   - Fields: id (uuid), key (text), name (text), description (text)
3. Entity 'todo.task' (alias: 'task'):
   - Fields: id (uuid), title (text), description (text), priority (select: [LOW, MEDIUM, HIGH, URGENT]), category (select: [General, Engineering, HR, Operations, Design]), record_status (enum: draft, submitted, approved, cancelled), record_date (date), created_by (uuid -> user.id), created_at (datetime)

Entity Relationships & Foreign Keys:
- task.created_by = user.id (connects tasks to the user who created them)
- user.role = role.key (connects users to their role definition)

Rules for Routing & StructuredQuery Generation:
- If the user asks for users by role (e.g. 'who are the managers?', 'find managers', 'show admins', 'list staff'), use 'user-management.user.list' with parameter { "role": "MANAGER" } (or "ADMIN", "STAFF", "SUPER_ADMIN").
- If the user asks for single-entity listings without joins (e.g. 'show all todos', 'list users'), use that module's list capability (e.g. 'todo.task.list' or 'user-management.user.list').
- If the user asks cross-entity or relational questions involving multiple tables (e.g. 'show me the latest todos and users who created it and their role', 'who are the users with pending todos', 'which user created todo', 'roles with user count'), use 'core.query.execute' and provide a StructuredQuery in parameters.query.

Supported Filter Operators for 'columnFilters': eq, neq, contains, not_contains, starts_with, ends_with, gt, lt, gte, lte

StructuredQuery AST Format for 'core.query.execute':
{
  "title": "<Concise Query Title>",
  "primaryEntity": { "module": "<module>", "entity": "<entity>", "alias": "<alias>" },
  "joins": [
    {
      "module": "<join-module>",
      "entity": "<join-entity>",
      "alias": "<join-alias>",
      "type": "INNER",
      "on": { "left": "<table1.field>", "right": "<table2.field>" }
    }
  ],
  "select": [
    { "field": "<alias.field>", "label": "<Column Header>" }
  ],
  "where": [
    { "field": "<alias.field>", "operator": "<eq|neq|contains|gt|lt>", "value": "<value>" }
  ],
  "orderBy": [
    { "field": "<alias.field>", "direction": "<asc|desc>" }
  ],
  "limit": 50
}

Example for "show me the latest todos and users who created it and their role":
{
  "capability": "core.query.execute",
  "parameters": {
    "query": {
      "title": "Latest Tasks with Creators and Roles",
      "primaryEntity": { "module": "todo", "entity": "task", "alias": "task" },
      "joins": [
        {
          "module": "user-management",
          "entity": "user",
          "alias": "user",
          "type": "INNER",
          "on": { "left": "task.created_by", "right": "user.id" }
        }
      ],
      "select": [
        { "field": "task.title", "label": "Task Title", "type": "text" },
        { "field": "user.username", "label": "Creator", "type": "text" },
        { "field": "user.role", "label": "Role", "type": "badge" },
        { "field": "task.category", "label": "Category", "type": "text" },
        { "field": "task.priority", "label": "Priority", "type": "badge" },
        { "field": "task.record_status", "label": "Status", "type": "badge" },
        { "field": "task.created_at", "label": "Created At", "type": "text" }
      ],
      "orderBy": [
        { "field": "task.created_at", "direction": "desc" }
      ],
      "limit": 50
    }
  },
  "confidence": 0.95,
  "needsConfirmation": false
}

Example for standard single-module list:
{
  "capability": "todo.task.list",
  "parameters": {
    "columnFilters": [
      { "field": "category", "operator": "eq", "value": "Engineering" }
    ],
    "status": "approved"
  },
  "confidence": 0.9,
  "needsConfirmation": false
}

Respond ONLY with valid JSON. Never include markdown code blocks or explanations.`;
}
