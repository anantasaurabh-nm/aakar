import { Injectable } from '@nestjs/common';
import { SDUI_SCHEMA_VERSION, type CapabilityResult, type ChatResponse, type TableColumn, type DashboardConfig } from '@erp/shared-contracts';
import { EntityRegistryService } from '../entity-engine/entity-registry.service';
import { columnsFromSchema, buildTableSectionFromSchema, buildDashboardConfigFromInsights, type EntityInsights } from '../entity-engine/table-section.builder';

const MUTATION_OPERATIONS = new Set(['update', 'transition']);

function formatBrandName(moduleName: string): string {
  if (moduleName.toLowerCase() === 'todo') return 'DOERS Copilot · Todos';
  if (moduleName.toLowerCase() === 'user-management') return 'DOERS Copilot · Users';
  if (moduleName.toLowerCase() === 'user-roles') return 'DOERS Copilot · Roles & Permissions';
  if (moduleName.toLowerCase() === 'module-management') return 'DOERS Copilot · Modules';
  if (moduleName.toLowerCase() === 'core') return 'DOERS Copilot · Analytics';
  const capitalized = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
  return `DOERS Copilot · ${capitalized}`;
}

@Injectable()
export class ResponsePlannerService {
  constructor(private readonly entityRegistry: EntityRegistryService) {}

  plan(result: CapabilityResult): ChatResponse {
    if (MUTATION_OPERATIONS.has(result.operation)) {
      return {
        mode: 'action',
        text: result.message ?? 'Done.',
        invalidate: result.invalidates ?? [],
      };
    }

    if (!result.entity) {
      return { mode: result.message ? 'text' : 'data', text: result.message, data: result.rows?.[0] };
    }

    // --- Safe Semantic Cross-Entity Query Results ---
    if (result.operation === 'query' && result.rows) {
      const title = result.querySpec?.title || 'Query Analysis';
      const rows = result.rows;
      const total = result.total ?? rows.length;

      // Inferred columns
      let columns: TableColumn[] = [];
      if (result.querySpec?.select && result.querySpec.select.length > 0) {
        columns = result.querySpec.select.map((s) => {
          const colKey = s.label.replace(/[^a-zA-Z0-9_]/g, '_');
          let colType: TableColumn['type'] = 'text';
          if (s.aggregate || colKey.toLowerCase().includes('count') || colKey.toLowerCase().includes('tasks')) {
            colType = 'badge';
          } else if (colKey.toLowerCase().includes('role') || colKey.toLowerCase().includes('status')) {
            colType = 'badge';
          } else if (colKey.toLowerCase().includes('date') || colKey.toLowerCase().includes('at')) {
            colType = 'datetime';
          } else if (s.type && (s.type === 'badge' || s.type === 'number' || s.type === 'datetime' || s.type === 'boolean' || s.type === 'date' || s.type === 'link')) {
            colType = s.type;
          }
          return {
            key: colKey,
            label: s.label,
            type: colType,
            sortable: true,
          };
        });
      } else if (rows[0]) {
        columns = Object.keys(rows[0]).map((k) => ({
          key: k,
          label: k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          type: (typeof rows[0][k] === 'number' ? 'number' : typeof rows[0][k] === 'boolean' ? 'boolean' : 'text') as TableColumn['type'],
          sortable: true,
        }));
      }

      const tableSection = {
        id: 'query-results-table',
        label: 'Results Table',
        type: 'table' as const,
        toolbar: [
          { id: 'search', type: 'search' as const },
          { id: 'columns', type: 'columns' as const },
          { id: 'refresh', type: 'action' as const, label: 'Refresh', action: { type: 'refresh' as const } },
        ],
        data: { source: 'query.results' },
        state: { rows, total },
        config: {
          columns,
          selectable: true,
          pageSize: 10,
          density: 'comfortable' as const,
          detailView: false,
        },
      };

      // Inferred Insights cards and chart
      const firstAggCol = columns.find((c) => c.type === 'number' && (c.label.toLowerCase().includes('count') || c.label.toLowerCase().includes('sum')));
      const firstTextCol = columns.find((c) => c.type === 'text');

      const cards: any[] = [
        {
          id: 'total-records',
          label: 'Matching Records',
          value: total,
          accent: 'indigo',
        },
      ];

      if (firstAggCol) {
        const sumTotal = rows.reduce((acc, r) => acc + (Number(r[firstAggCol.key.toLowerCase()] ?? r[firstAggCol.key]) || 0), 0);
        cards.push({
          id: 'aggregate-sum',
          label: `Total ${firstAggCol.label}`,
          value: sumTotal,
          accent: 'emerald',
        });
      } else {
        const uniqueUsers = new Set(rows.map((r) => r.username || r.Username).filter(Boolean)).size;
        if (uniqueUsers > 0) {
          cards.push({
            id: 'unique-users',
            label: 'Unique Users',
            value: uniqueUsers,
            accent: 'violet',
          });
        }
      }

      let charts: any[] = [];
      if (firstAggCol) {
        charts = [
          {
            id: 'distribution-chart',
            title: `${firstAggCol.label} Distribution`,
            type: 'bar',
            series: rows.slice(0, 10).map((r) => {
              const textVal = String(r[firstTextCol?.key.toLowerCase() ?? ''] || r[firstTextCol?.key ?? ''] || 'Item');
              const aggVal = Number(r[firstAggCol.key.toLowerCase()] ?? r[firstAggCol.key] ?? 0);
              return {
                id: textVal,
                label: textVal,
                points: [{ x: textVal, y: aggVal }],
              };
            }),
          },
        ];
      } else if (columns.some((c) => ['status', 'role', 'username', 'category'].includes(c.key.toLowerCase()))) {
        const groupCol = columns.find((c) => ['status', 'role', 'username', 'category'].includes(c.key.toLowerCase()))!;
        const groupKey = groupCol.key.toLowerCase();
        const counts: Record<string, number> = {};
        for (const r of rows) {
          const val = String(r[groupKey] || r[groupCol.key] || 'Other');
          counts[val] = (counts[val] || 0) + 1;
        }
        charts = [
          {
            id: 'category-distribution',
            title: `Distribution by ${groupCol.label}`,
            type: 'donut',
            series: Object.entries(counts).map(([k, v]) => ({
              id: k,
              label: k,
              points: [{ x: k, y: v }],
            })),
          },
        ];
      }

      const dashboardConfig: DashboardConfig = { cards, charts };

      const insightsSection = {
        id: 'query-results-insights',
        label: 'Insights & Metrics',
        type: 'dashboard' as const,
        toolbar: [],
        state: dashboardConfig,
        config: dashboardConfig,
      };

      return {
        mode: 'ui',
        text: result.message ?? `Found ${total} matching records for "${title}".`,
        ui: {
          schema: SDUI_SCHEMA_VERSION,
          brand: { name: 'DOERS Copilot · Analytics', icon: 'sparkles' },
          navigation: { items: [] },
          page: {
            id: 'query-results',
            title,
            sections: [tableSection, insightsSection],
          },
        },
      };
    }

    // --- Empty Create: Open target form ---
    if (result.operation === 'create' && (!result.rows || result.rows.length === 0)) {
      const entityName = result.entity.charAt(0).toUpperCase() + result.entity.slice(1);
      return {
        mode: 'ui',
        text: result.message ?? `Opening new ${entityName} form. Fill in the details to create the record.`,
        ui: {
          schema: SDUI_SCHEMA_VERSION,
          brand: { name: formatBrandName(result.module), icon: 'sparkles' },
          navigation: { items: [] },
          page: {
            id: `${result.module}-${result.entity}-create`,
            title: `New ${entityName}`,
            sections: [
              {
                id: `${result.entity}-form`,
                label: `New ${entityName}`,
                type: 'form' as const,
                data: { target: `${result.module}.${result.entity}.form` },
                config: { fields: [] },
              },
            ],
          },
        },
      };
    }

    // --- Core User Management ---
    if (result.module === 'user-management' && result.entity === 'user') {
      if (result.operation === 'create' && result.rows?.[0]) {
        const createdRow = result.rows[0];
        return {
          mode: 'ui',
          text: result.message ?? `Created user "${createdRow.username}".`,
          invalidate: result.invalidates ?? ['user-management.user'],
          ui: {
            schema: SDUI_SCHEMA_VERSION,
            brand: { name: 'DOERS Copilot · Users', icon: 'sparkles' },
            navigation: { items: [] },
            page: {
              id: 'users-management',
              title: 'Users Directory',
              sections: [
                {
                  id: 'users-table',
                  label: 'Users Directory',
                  type: 'table' as const,
                  toolbar: [
                    { id: 'new', type: 'action' as const, label: 'New User', action: { type: 'create' as const, target: 'user-management.user.form' } },
                    { id: 'search', type: 'search' as const },
                    { id: 'refresh', type: 'action' as const, label: 'Refresh', action: { type: 'refresh' as const } },
                  ],
                  data: { source: 'user-management.user' },
                  state: { initialRecordId: createdRow.id },
                  config: {
                    columns: [
                      { key: 'username', label: 'Username', type: 'text' as const, sortable: true },
                      { key: 'email', label: 'Email', type: 'text' as const, sortable: true },
                      { key: 'role', label: 'Role', type: 'badge' as const, sortable: true },
                      { key: 'isActive', label: 'Active', type: 'boolean' as const, sortable: true },
                      { key: 'lastLoginAt', label: 'Last Login', type: 'datetime' as const, sortable: true },
                    ],
                    selectable: true,
                    pageSize: 50,
                    density: 'comfortable' as const,
                    detailView: true,
                  },
                },
              ],
            },
          },
        };
      }

      if (result.operation === 'insights' && result.rows?.[0]) {
        const config = result.rows[0] as unknown as { cards: unknown[]; charts: unknown[] };
        return {
          mode: 'ui',
          text: result.message ?? 'Here are the latest insights for Users.',
          ui: {
            schema: SDUI_SCHEMA_VERSION,
            brand: { name: 'DOERS Copilot · Users', icon: 'sparkles' },
            navigation: { items: [] },
            page: {
              id: 'users-insights',
              title: 'User Insights',
              sections: [{ id: 'ai-users-insights', label: 'User Insights', type: 'dashboard', toolbar: [], state: config, config: config as never }],
            },
          },
        };
      }

      if (result.operation === 'list' && result.rows) {
        const total = result.total ?? result.rows.length;
        const countLabel = total === 0 ? 'No user records found.' : `Found ${total} User record${total === 1 ? '' : 's'}.`;
        const section = {
          id: 'users-table',
          label: 'Users Directory',
          type: 'table' as const,
          toolbar: [
            { id: 'new', type: 'action' as const, label: 'New User', action: { type: 'create' as const, target: 'user-management.user.form' } },
            { id: 'search', type: 'search' as const },
            { id: 'columns', type: 'columns' as const },
            { id: 'refresh', type: 'action' as const, label: 'Refresh', action: { type: 'refresh' as const } },
          ],
          data: { source: 'user-management.user' },
          state: { rows: result.rows, total },
          config: {
            columns: [
              { key: 'username', label: 'Username', type: 'text' as const, sortable: true },
              { key: 'email', label: 'Email', type: 'text' as const, sortable: true },
              { key: 'role', label: 'Role', type: 'badge' as const, sortable: true },
              { key: 'isActive', label: 'Active', type: 'boolean' as const, sortable: true },
              { key: 'lastLoginAt', label: 'Last Login', type: 'datetime' as const, sortable: true },
            ],
            selectable: true,
            pageSize: 50,
            density: 'comfortable' as const,
            detailView: true,
          },
        };
        return {
          mode: 'ui',
          text: result.message ?? countLabel,
          ui: {
            schema: SDUI_SCHEMA_VERSION,
            brand: { name: 'DOERS Copilot · Users', icon: 'sparkles' },
            navigation: { items: [] },
            page: { id: 'users', title: 'Users Directory', sections: [section] },
          },
        };
      }
    }

    // --- Core User Roles & Permissions ---
    if (result.module === 'user-roles' && result.entity === 'role') {
      if (result.operation === 'create' && result.rows?.[0]) {
        const createdRow = result.rows[0];
        return {
          mode: 'ui',
          text: result.message ?? `Created role "${createdRow.name}".`,
          invalidate: result.invalidates ?? ['user-roles.role'],
          ui: {
            schema: SDUI_SCHEMA_VERSION,
            brand: { name: 'DOERS Copilot · Roles', icon: 'sparkles' },
            navigation: { items: [] },
            page: {
              id: 'roles-management',
              title: 'Roles Directory',
              sections: [
                {
                  id: 'roles-table',
                  label: 'Roles Directory',
                  type: 'table' as const,
                  toolbar: [
                    { id: 'new', type: 'action' as const, label: 'New Role', action: { type: 'create' as const, target: 'user-roles.role.form' } },
                    { id: 'search', type: 'search' as const },
                    { id: 'refresh', type: 'action' as const, label: 'Refresh', action: { type: 'refresh' as const } },
                  ],
                  data: { source: 'user-roles.role' },
                  state: { initialRecordId: createdRow.id },
                  config: {
                    columns: [
                      { key: 'name', label: 'Role Name', type: 'text' as const, sortable: true },
                      { key: 'key', label: 'Role Code', type: 'badge' as const, sortable: true },
                      { key: 'isSystem', label: 'Type', type: 'badge' as const, sortable: true },
                      { key: 'permissionsCount', label: 'Active Permissions', type: 'badge' as const, sortable: true },
                      { key: 'usersCount', label: 'Assigned Users', type: 'badge' as const, sortable: true },
                    ],
                    selectable: true,
                    pageSize: 50,
                    density: 'comfortable' as const,
                    detailView: true,
                  },
                },
              ],
            },
          },
        };
      }

      if (result.operation === 'insights' && result.rows?.[0]) {
        const config = result.rows[0] as unknown as { cards: unknown[]; charts: unknown[] };
        return {
          mode: 'ui',
          text: result.message ?? 'Here are the latest insights for Roles & Permissions.',
          ui: {
            schema: SDUI_SCHEMA_VERSION,
            brand: { name: 'DOERS Copilot · Roles', icon: 'sparkles' },
            navigation: { items: [] },
            page: {
              id: 'roles-insights',
              title: 'Role Insights',
              sections: [{ id: 'ai-roles-insights', label: 'Role Insights', type: 'dashboard', toolbar: [], state: config, config: config as never }],
            },
          },
        };
      }

      if (result.operation === 'list' && result.rows) {
        const total = result.total ?? result.rows.length;
        const countLabel = total === 0 ? 'No role records found.' : `Found ${total} Role record${total === 1 ? '' : 's'}.`;
        const section = {
          id: 'roles-table',
          label: 'Roles Directory',
          type: 'table' as const,
          toolbar: [
            { id: 'new', type: 'action' as const, label: 'New Role', action: { type: 'create' as const, target: 'user-roles.role.form' } },
            { id: 'search', type: 'search' as const },
            { id: 'columns', type: 'columns' as const },
            { id: 'refresh', type: 'action' as const, label: 'Refresh', action: { type: 'refresh' as const } },
          ],
          data: { source: 'user-roles.role' },
          state: { rows: result.rows, total },
          config: {
            columns: [
              { key: 'name', label: 'Role Name', type: 'text' as const, sortable: true },
              { key: 'key', label: 'Role Code', type: 'badge' as const, sortable: true },
              { key: 'isSystem', label: 'Type', type: 'badge' as const, sortable: true },
              { key: 'permissionsCount', label: 'Active Permissions', type: 'badge' as const, sortable: true },
              { key: 'usersCount', label: 'Assigned Users', type: 'badge' as const, sortable: true },
            ],
            selectable: true,
            pageSize: 50,
            density: 'comfortable' as const,
            detailView: true,
          },
        };
        return {
          mode: 'ui',
          text: result.message ?? countLabel,
          ui: {
            schema: SDUI_SCHEMA_VERSION,
            brand: { name: 'DOERS Copilot · Roles', icon: 'sparkles' },
            navigation: { items: [] },
            page: { id: 'roles', title: 'Roles Directory', sections: [section] },
          },
        };
      }
    }

    // --- Core Module Management ---
    if (result.module === 'module-management' && result.entity === 'module') {
      if (result.operation === 'list' && result.rows) {
        const total = result.total ?? result.rows.length;
        const countLabel = total === 0 ? 'No modules found.' : `Found ${total} installed module${total === 1 ? '' : 's'}.`;
        const section = {
          id: 'modules-table',
          label: 'Module Registry',
          type: 'table' as const,
          toolbar: [
            { id: 'search', type: 'search' as const },
            { id: 'refresh', type: 'action' as const, label: 'Refresh', action: { type: 'refresh' as const } },
          ],
          data: { source: 'modules' },
          state: { rows: result.rows, total },
          config: {
            columns: [
              { key: 'name', label: 'Module Name', type: 'text' as const, sortable: true },
              { key: 'id', label: 'Identifier', type: 'badge' as const, sortable: true },
              { key: 'version', label: 'Version', type: 'badge' as const, sortable: true },
              { key: 'status', label: 'Status', type: 'badge' as const, sortable: true },
              { key: 'type', label: 'Type', type: 'badge' as const, sortable: true },
            ],
            selectable: false,
            pageSize: 50,
            density: 'comfortable' as const,
            detailView: false,
          },
        };
        return {
          mode: 'ui',
          text: result.message ?? countLabel,
          ui: {
            schema: SDUI_SCHEMA_VERSION,
            brand: { name: 'DOERS Copilot · Modules', icon: 'sparkles' },
            navigation: { items: [] },
            page: { id: 'modules', title: 'Module Registry', sections: [section] },
          },
        };
      }
    }

    // --- Schema-driven Entities ---
    let entity;
    try {
      entity = this.entityRegistry.getEntityDefinition(result.module, result.entity);
    } catch {
      return { mode: result.message ? 'text' : 'data', text: result.message, data: result.rows?.[0] };
    }

    if (result.operation === 'create' && result.rows?.[0]) {
      const createdRow = result.rows[0];
      const tableSection = {
        id: `${result.entity}-table`,
        label: entity.label ?? result.entity,
        type: 'table' as const,
        toolbar: [
          { id: 'new', type: 'action' as const, label: 'New', action: { type: 'create' as const, target: `${result.module}.${result.entity}.form` } },
          { id: 'search', type: 'search' as const },
          {
            id: 'status',
            type: 'filter' as const,
            field: 'status',
            options: [
              { label: 'Draft', value: 'draft' },
              { label: 'Submitted', value: 'submitted' },
              { label: 'Approved', value: 'approved' },
              { label: 'Cancelled', value: 'cancelled' },
            ],
          },
          { id: 'columns', type: 'columns' as const },
          { id: 'refresh', type: 'action' as const, label: 'Refresh', action: { type: 'refresh' as const } },
        ],
        data: { source: `${result.module}.${result.entity}` },
        state: { initialRecordId: createdRow.id },
        config: {
          columns: columnsFromSchema(entity),
          selectable: true,
          pageSize: 50,
          density: 'comfortable' as const,
          detailView: true,
        },
      };

      const insightsSection = {
        id: `${result.entity}-insights`,
        label: 'Insights',
        type: 'dashboard' as const,
        toolbar: [
          {
            id: 'period',
            type: 'filter' as const,
            field: 'recordDate',
            options: [
              { label: 'Today', value: 'today' },
              { label: 'Yesterday', value: 'yesterday' },
              { label: 'Last 7 Days', value: 'last_7_days' },
              { label: 'Last 30 Days', value: 'last_30_days' },
              { label: 'This Week', value: 'this_week' },
              { label: 'This Month', value: 'this_month' },
              { label: 'All Time', value: 'all_time' },
            ],
            defaultValue: 'last_30_days',
          },
        ],
        data: { source: `${result.module}.${result.entity}.insights` },
        config: { cards: [], charts: [] },
      };

      return {
        mode: 'ui',
        text: `Created new ${entity.label ?? result.entity}. You can edit and save the details in the form.`,
        invalidate: result.invalidates ?? [],
        ui: {
          schema: SDUI_SCHEMA_VERSION,
          brand: { name: formatBrandName(result.module), icon: 'sparkles' },
          navigation: { items: [] },
          page: {
            id: result.module,
            title: entity.label ?? result.entity,
            sections: [tableSection, insightsSection],
          },
        },
      };
    }

    if (result.operation === 'insights') {
      const insights = result.rows?.[0] as unknown as EntityInsights | undefined;
      if (!insights) return { mode: 'text', text: "I couldn't find that." };
      const config = buildDashboardConfigFromInsights(entity, insights);
      return {
        mode: 'ui',
        text: result.message ?? `Here are the latest insights for ${entity.label ?? result.entity}.`,
        ui: {
          schema: SDUI_SCHEMA_VERSION,
          brand: { name: formatBrandName(result.module), icon: 'sparkles' },
          navigation: { items: [] },
          page: {
            id: result.entity,
            title: entity.label ?? result.entity,
            sections: [{ id: `ai-${result.module}-${result.entity}-insights`, label: 'Insights', type: 'dashboard', toolbar: [], state: config, config }],
          },
        },
      };
    }

    if (result.operation === 'list' && result.rows) {
      const total = result.total ?? result.rows.length;
      const section = buildTableSectionFromSchema(result.module, result.entity, entity, result.rows, total, result.params);
      const countLabel = total === 0 ? `No ${entity.label ?? result.entity} records found.` : `Found ${total} ${entity.label ?? result.entity} record${total === 1 ? '' : 's'}.`;
      return {
        mode: 'ui',
        text: result.message ?? countLabel,
        ui: {
          schema: SDUI_SCHEMA_VERSION,
          brand: { name: formatBrandName(result.module), icon: 'sparkles' },
          navigation: { items: [] },
          page: { id: result.entity, title: entity.label ?? result.entity, sections: [section] },
        },
      };
    }

    return { mode: result.message ? 'text' : 'data', text: result.message, data: result.rows?.[0] };
  }
}
