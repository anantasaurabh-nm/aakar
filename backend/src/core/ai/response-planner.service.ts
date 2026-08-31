import { Injectable } from '@nestjs/common';
import { SDUI_SCHEMA_VERSION, type CapabilityResult, type ChatResponse } from '@erp/shared-contracts';
import { EntityRegistryService } from '../entity-engine/entity-registry.service';
import { columnsFromSchema, buildTableSectionFromSchema, buildDashboardConfigFromInsights, type EntityInsights } from '../entity-engine/table-section.builder';

const MUTATION_OPERATIONS = new Set(['update', 'transition']);

/**
 * Converts a structured capability result into the response the AI Chat
 * should render — text, data, an action confirmation, or SDUI (Architecture
 * Amendment 01 §26-27). Only ever uses approved SDUI capabilities; never
 * invents component names, HTML, or raw URLs.
 */
function formatBrandName(moduleName: string): string {
  if (moduleName.toLowerCase() === 'todo') return 'DOERS Copilot · Todos';
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
    const entity = this.entityRegistry.getEntityDefinition(result.module, result.entity);

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
          pageSize: 10,
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
              { label: 'This Week', value: 'this_week' },
              { label: 'This Month', value: 'this_month' },
              { label: 'All Time', value: 'all_time' },
            ],
            defaultValue: 'today',
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
