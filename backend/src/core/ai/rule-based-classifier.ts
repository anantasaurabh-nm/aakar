import type { CapabilityDescriptor, ColumnFilter, OrchestratorDecision, StructuredQuery } from '@erp/shared-contracts';

const DATE_KEYWORDS: Record<string, string> = {
  today: 'today',
  tomorrow: 'tomorrow',
  yesterday: 'yesterday',
  'this week': 'this_week',
  'last week': 'last_week',
  'this month': 'this_month',
  'last month': 'last_month',
};

function extractRecordDate(text: string): string | undefined {
  for (const [phrase, preset] of Object.entries(DATE_KEYWORDS)) {
    if (text.includes(phrase)) return preset;
  }
  return undefined;
}

export function extractRole(text: string): string | undefined {
  if (/\b(super_admin|superadmin|super-admin|super\s+admin)\b/i.test(text)) return 'SUPER_ADMIN';
  if (/\b(managers?|mgmt)\b/i.test(text)) return 'MANAGER';
  if (/\b(admins?|administrator|administrators)\b/i.test(text)) return 'ADMIN';
  if (/\b(staffs?|employees?|members?)\b/i.test(text)) return 'STAFF';
  return undefined;
}

/**
 * Resolves the most relevant entity capability matching the message for a given operation.
 * Dynamically compares user text tokens against all capability module names, entity names,
 * plurals, and description terms across any number of registered modules (1 to 100s).
 */
export function findBestCapability(
  capabilities: CapabilityDescriptor[],
  operation: string,
  text: string,
): CapabilityDescriptor | undefined {
  const candidates = capabilities.filter((c) => c.id.endsWith(`.${operation}`));
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  let bestScore = -1;
  let bestCandidate: CapabilityDescriptor = candidates[0];

  for (const c of candidates) {
    let score = 0;
    const entity = (c.entity ?? '').toLowerCase();
    const moduleName = c.module.toLowerCase();
    const desc = c.description.toLowerCase();

    // 1. Direct entity or plural match (e.g., "user"/"users", "role"/"roles", "task"/"tasks", "item"/"items", "invoice"/"invoices")
    if (entity) {
      const entityRegex = new RegExp(`\\b${entity}(s|es)?\\b`, 'i');
      if (entityRegex.test(text)) score += 20;
    }

    // 2. Direct or spaced module match (e.g. "user-management" -> "user management")
    const cleanModule = moduleName.replace(/-/g, ' ');
    if (text.includes(moduleName) || text.includes(cleanModule)) {
      score += 10;
    }

    // 3. Keyword match in capability description
    const descWords = desc.split(/\s+/).filter((w) => w.length > 3);
    for (const word of descWords) {
      if (text.includes(word)) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = c;
    }
  }

  return bestCandidate;
}

function extractPriority(text: string): string | undefined {
  if (/\b(urgent|critical)\b/i.test(text)) return 'URGENT';
  if (/\b(high|high-priority|high priority)\b/i.test(text)) return 'HIGH';
  if (/\b(medium|medium-priority|medium priority)\b/i.test(text)) return 'MEDIUM';
  if (/\b(low|low-priority|low priority)\b/i.test(text)) return 'LOW';
  return undefined;
}

function extractStatus(text: string): string | undefined {
  if (/\b(approved|completed)\b/i.test(text)) return 'approved';
  if (/\b(draft|open)\b/i.test(text)) return 'draft';
  if (/\b(submitted|pending)\b/i.test(text)) return 'submitted';
  if (/\b(cancelled|canceled)\b/i.test(text)) return 'cancelled';
  return undefined;
}

function extractCategory(text: string): string | undefined {
  const match = text.match(/\b(?:category|cat)\s*(?:=|:|\s+is|\s+from)?\s*([a-z0-9_-]+)/i);
  if (match && match[1]) {
    const val = match[1].toLowerCase();
    if (val === 'enginnering' || val === 'engineering' || val === 'engineer') return 'Engineering';
    if (val === 'general' || val === 'genral' || val === 'gen') return 'General';
    return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  }
  if (/\b(?:engineering|enginnering)\b/i.test(text)) return 'Engineering';
  if (/\b(?:general|genral)\b/i.test(text)) return 'General';
  return undefined;
}

/**
 * Detects cross-entity relational queries that require multi-table joins.
 */
function matchCrossEntityQuery(text: string, capabilities: CapabilityDescriptor[]): OrchestratorDecision | null {
  const hasQueryCap = capabilities.some((c) => c.id === 'core.query.execute');
  if (!hasQueryCap) return null;

  // 1. "Users with pending todos / tasks"
  if (
    /\b(user|users|people|members|uer|uers)\b/i.test(text) &&
    /\b(pending|open|active|incomplete|unfinished)\b/i.test(text) &&
    /\b(todo|todos|task|tasks)\b/i.test(text)
  ) {
    const query: StructuredQuery = {
      title: 'Users with Pending Tasks',
      primaryEntity: { module: 'user-management', entity: 'user', alias: 'user' },
      joins: [
        {
          module: 'todo',
          entity: 'task',
          alias: 'task',
          type: 'INNER',
          on: { left: 'user.id', right: 'task.created_by' },
          where: [{ field: 'task.record_status', operator: 'neq', value: 'approved' }],
        },
      ],
      select: [
        { field: 'user.username', label: 'Username', type: 'text' },
        { field: 'user.email', label: 'Email', type: 'text' },
        { field: 'user.role', label: 'Role', type: 'badge' },
        { field: 'task.id', label: 'Pending Tasks', aggregate: 'COUNT', type: 'badge' },
      ],
      where: [],
      groupBy: ['user.id', 'user.username', 'user.email', 'user.role'],
      orderBy: [{ field: 'Pending_Tasks', direction: 'desc' }],
      limit: 50,
    };
    return {
      capability: 'core.query.execute',
      parameters: { query },
      confidence: 0.9,
      needsConfirmation: false,
    };
  }

  // 2. "Users with completed / approved todos / tasks"
  if (
    /\b(user|users|people|members|uer|uers)\b/i.test(text) &&
    /\b(completed|approved|done|finished)\b/i.test(text) &&
    /\b(todo|todos|task|tasks)\b/i.test(text)
  ) {
    const query: StructuredQuery = {
      title: 'Users with Completed Tasks',
      primaryEntity: { module: 'user-management', entity: 'user', alias: 'user' },
      joins: [
        {
          module: 'todo',
          entity: 'task',
          alias: 'task',
          type: 'INNER',
          on: { left: 'user.id', right: 'task.created_by' },
          where: [{ field: 'task.record_status', operator: 'eq', value: 'approved' }],
        },
      ],
      select: [
        { field: 'user.username', label: 'Username', type: 'text' },
        { field: 'user.email', label: 'Email', type: 'text' },
        { field: 'user.role', label: 'Role', type: 'badge' },
        { field: 'task.id', label: 'Completed Tasks', aggregate: 'COUNT', type: 'badge' },
      ],
      where: [],
      groupBy: ['user.id', 'user.username', 'user.email', 'user.role'],
      orderBy: [{ field: 'Completed_Tasks', direction: 'desc' }],
      limit: 50,
    };
    return {
      capability: 'core.query.execute',
      parameters: { query },
      confidence: 0.9,
      needsConfirmation: false,
    };
  }

  // 3. "Users / Managers / Superadmins who created todos / tasks" (e.g. "which uer has created todo", "find managers who has created todo", "find superadmin who has created todo")
  if (
    /\b(user|users|people|members|manager|managers|admin|admins|superadmin|superadmins|super-admin|super_admin|uer|uers|who|which)\b/i.test(text) &&
    /\b(created|made|has|have|with|owns?)\b/i.test(text) &&
    /\b(todo|todos|task|tasks)\b/i.test(text)
  ) {
    const roleFilter = extractRole(text);
    const whereFilters: ColumnFilter[] = roleFilter ? [{ field: 'user.role', operator: 'eq' as const, value: roleFilter }] : [];
    const query: StructuredQuery = {
      title: roleFilter ? `${roleFilter}s with Created Tasks` : 'Users with Created Tasks',
      primaryEntity: { module: 'user-management', entity: 'user', alias: 'user' },
      joins: [
        {
          module: 'todo',
          entity: 'task',
          alias: 'task',
          type: 'INNER',
          on: { left: 'user.id', right: 'task.created_by' },
        },
      ],
      select: [
        { field: 'user.username', label: 'Username', type: 'text' },
        { field: 'user.email', label: 'Email', type: 'text' },
        { field: 'user.role', label: 'Role', type: 'badge' },
        { field: 'task.id', label: 'Total Tasks', aggregate: 'COUNT', type: 'badge' },
      ],
      where: whereFilters,
      groupBy: ['user.id', 'user.username', 'user.email', 'user.role'],
      orderBy: [{ field: 'Total_Tasks', direction: 'desc' }],
      limit: 50,
    };
    return {
      capability: 'core.query.execute',
      parameters: { query },
      confidence: 0.9,
      needsConfirmation: false,
    };
  }

  // 4. "Roles with user count"
  if (
    /\b(roles|role)\b/i.test(text) &&
    /\b(with users|user count|assigned users|members count)\b/i.test(text)
  ) {
    const query: StructuredQuery = {
      title: 'Roles and Assigned Users',
      primaryEntity: { module: 'user-roles', entity: 'role', alias: 'role' },
      joins: [
        {
          module: 'user-management',
          entity: 'user',
          alias: 'user',
          type: 'LEFT',
          on: { left: 'role.key', right: 'user.role' },
        },
      ],
      select: [
        { field: 'role.name', label: 'Role Name', type: 'text' },
        { field: 'role.key', label: 'Role Code', type: 'badge' },
        { field: 'user.id', label: 'Assigned Users', aggregate: 'COUNT', type: 'badge' },
      ],
      where: [],
      groupBy: ['role.id', 'role.name', 'role.key'],
      orderBy: [{ field: 'Assigned_Users', direction: 'desc' }],
      limit: 50,
    };
    return {
      capability: 'core.query.execute',
      parameters: { query },
      confidence: 0.85,
      needsConfirmation: false,
    };
  }

  return null;
}

/**
 * Fully dynamic, auto-aware classifier for any number of schema-driven or core modules.
 * Discovers entities, operations, and attributes dynamically from the Capability Registry.
 */
export function classifyWithRules(message: string, capabilities: CapabilityDescriptor[]): OrchestratorDecision | null {
  if (!capabilities || capabilities.length === 0) return null;
  const text = message.toLowerCase().trim();
  const recordDate = extractRecordDate(text);
  const priority = extractPriority(text);
  const status = extractStatus(text);
  const role = extractRole(text);
  const isAll = /\b(all\s+records|all\s+todos|all\s+users|all\s+roles|show\s+all|everything)\b/i.test(text);
  const category = isAll ? undefined : extractCategory(text);

  // 1. Cross-Entity Relational Multi-Table Query Intent
  const crossQueryDecision = matchCrossEntityQuery(text, capabilities);
  if (crossQueryDecision) return crossQueryDecision;

  // 2. Complete / approve intent
  if (/\b(complete|finish|done|mark.*(complete|done)|approve)\b/.test(text)) {
    const capability = findBestCapability(capabilities, 'complete', text) ?? findBestCapability(capabilities, 'approve', text);
    if (capability) return { capability: capability.id, parameters: { query: message }, confidence: 0.6, needsConfirmation: false };
  }

  // 3. Create / add intent across any entity (e.g. "create a new user", "add role...", "create task...")
  if (/\b(create|add|new|register|provision|make|open\s+form)\b/.test(text)) {
    const capability = findBestCapability(capabilities, 'create', text);
    if (capability) {
      const extractedTitle = message
        .replace(/.*\b(create|add|new|register|provision|make)\b\s*(a|an|the)?\s*([a-z0-9_-]+)?\s*(to|for|called|named|:)?\s*/i, '')
        .trim();
      return {
        capability: capability.id,
        parameters: {
          ...(extractedTitle ? { title: extractedTitle, name: extractedTitle } : {}),
          ...(priority ? { priority } : {}),
          ...(role ? { role } : {}),
        },
        confidence: 0.6,
        needsConfirmation: false,
      };
    }
  }

  // 4. Delete / remove intent
  if (/\b(delete|remove|deactivate|purge|destroy)\b/.test(text)) {
    const capability = findBestCapability(capabilities, 'delete', text);
    if (capability) return { capability: capability.id, parameters: { query: message }, confidence: 0.5, needsConfirmation: true };
  }

  // 5. Insights / counts / metrics intent
  if (/\b(insight|insights|summary|how\s+many|count|overview|stats?|metrics|distribution|analytics)\b/.test(text)) {
    const listCap = findBestCapability(capabilities, 'list', text);
    if (listCap) {
      const targetEntity = listCap.entity ?? listCap.module;
      const expectedInsightId = `${listCap.module}.${targetEntity}.insights`;
      const explicitInsightCap = capabilities.find((c) => c.id === expectedInsightId);
      return {
        capability: explicitInsightCap ? explicitInsightCap.id : expectedInsightId,
        parameters: { recordDate },
        confidence: 0.6,
        needsConfirmation: false,
      };
    }
  }

  // 6. Default / List / Search query intent
  const listCapability = findBestCapability(capabilities, 'list', text);
  if (listCapability) {
    const isUserList = listCapability.module.includes('user') || listCapability.entity?.includes('user');
    const parameters: Record<string, unknown> = isAll
      ? {}
      : {
          ...(recordDate ? { recordDate } : {}),
          ...(priority ? { priority } : {}),
          ...(status ? { status } : {}),
          ...(category ? { category } : {}),
          ...(role && isUserList ? { role } : {}),
        };
    return { capability: listCapability.id, parameters, confidence: 0.7, needsConfirmation: false };
  }

  return null;
}
