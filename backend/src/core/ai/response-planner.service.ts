import { Injectable } from '@nestjs/common';
import { SDUI_SCHEMA_VERSION, type CapabilityResult, type ChatResponse } from '@erp/shared-contracts';
import { EntityRegistryService } from '../entity-engine/entity-registry.service';
import { buildTableSectionFromSchema, buildDashboardConfigFromInsights, type EntityInsights } from '../entity-engine/table-section.builder';

const MUTATION_OPERATIONS = new Set(['create', 'update', 'transition']);

/**
 * Converts a structured capability result into the response the AI Chat
 * should render — text, data, an action confirmation, or SDUI (Architecture
 * Amendment 01 §26-27). Only ever uses approved SDUI capabilities; never
 * invents component names, HTML, or raw URLs.
 */
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

    if (result.operation === 'insights') {
      const insights = result.rows?.[0] as unknown as EntityInsights | undefined;
      if (!insights) return { mode: 'text', text: "I couldn't find that." };
      const config = buildDashboardConfigFromInsights(entity, insights);
      return {
        mode: 'ui',
        ui: {
          schema: SDUI_SCHEMA_VERSION,
          brand: { name: entity.label ?? result.entity, icon: result.module },
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
      const section = buildTableSectionFromSchema(result.module, result.entity, entity, result.rows);
      return {
        mode: 'ui',
        text: result.message,
        ui: {
          schema: SDUI_SCHEMA_VERSION,
          brand: { name: entity.label ?? result.entity, icon: result.module },
          navigation: { items: [] },
          page: { id: result.entity, title: entity.label ?? result.entity, sections: [section] },
        },
      };
    }

    return { mode: result.message ? 'text' : 'data', text: result.message, data: result.rows?.[0] };
  }
}
