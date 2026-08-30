import type { EntityDefinition, EntityFieldType, FieldType, SDUIFormField, TableColumn } from '@erp/shared-contracts';

function toColumnType(type: EntityFieldType): TableColumn['type'] {
  switch (type) {
    case 'select':
      return 'badge';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime';
    case 'number':
    case 'decimal':
      return 'number';
    default:
      return 'text';
  }
}

const METADATA_COLUMNS: TableColumn[] = [
  { key: 'record_date', label: 'Date', type: 'date', sortable: true },
  { key: 'record_status', label: 'Status', type: 'badge', sortable: true },
];

/**
 * Column list derived purely from schema.json — the only schema-agnostic
 * source of truth, shared by both the generic REST page-definition endpoint
 * and the AI Response Planner's ad-hoc table rendering, so this logic is
 * never duplicated (Module System PRD v2 §52, Amendment 01 §27).
 */
export function columnsFromSchema(entity: EntityDefinition): TableColumn[] {
  const fieldColumns: TableColumn[] = Object.entries(entity.fields)
    .filter(([, f]) => !f.internal && f.listVisible !== false)
    .map(([key, f]) => ({
      key,
      label: f.label ?? key,
      type: toColumnType(f.type),
      sortable: f.sortable !== false,
    }));
  return [...fieldColumns, ...METADATA_COLUMNS];
}

/**
 * A full ad-hoc SDUI table section, used by the AI Response Planner when a
 * capability's result should be rendered inline in chat (rows are inlined,
 * not fetched separately — there is no page navigation in that context).
 */
function toFormFieldType(type: EntityFieldType): FieldType {
  switch (type) {
    case 'text':
      return 'textarea';
    case 'select':
    case 'reference':
      return 'select';
    case 'number':
    case 'decimal':
      return 'number';
    case 'boolean':
      return 'checkbox';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime';
    default:
      return 'text';
  }
}

/** Generated form fields for the "new/edit record" modal — never includes `internal` fields. */
export function formFieldsFromSchema(entity: EntityDefinition, existing?: Record<string, unknown>): SDUIFormField[] {
  const fields: SDUIFormField[] = Object.entries(entity.fields)
    .filter(([, f]) => !f.internal)
    .map(([key, f]) => ({
      name: key,
      label: f.label ?? key,
      type: toFormFieldType(f.type),
      required: f.required,
      defaultValue: existing?.[key] ?? f.default ?? '',
      options: f.options?.map((o) => ({ label: o, value: o })),
    }));
  return [
    { name: 'id', label: 'id', type: 'hidden', required: false, defaultValue: existing?.id },
    ...fields,
  ];
}

/** The first non-internal `select` field, used to generate a priority-style donut breakdown, if any. */
export function firstSelectField(entity: EntityDefinition): string | undefined {
  return Object.entries(entity.fields).find(([, f]) => f.type === 'select' && !f.internal)?.[0];
}

export interface EntityInsights {
  total: number;
  approved: number;
  pending: number;
  breakdown: { value: string; count: number }[];
  trend: { x: string; y: number }[];
}

/** Converts generic entity insights into the Dashboard component's {cards, charts} shape. */
export function buildDashboardConfigFromInsights(entity: EntityDefinition, insights: EntityInsights) {
  const label = entity.label ?? 'Records';
  const charts = [];
  if (insights.breakdown.length > 0) {
    charts.push({
      id: 'breakdown',
      title: `${label} Breakdown`,
      type: 'donut' as const,
      series: insights.breakdown.map((b) => ({ id: b.value, label: b.value, points: [{ x: b.value, y: b.count }] })),
    });
  }
  charts.push({
    id: 'trend',
    title: `${label} Created (Last 7 Days)`,
    type: 'area' as const,
    series: [{ id: 'created', label: 'Created', points: insights.trend }],
  });

  return {
    cards: [
      { id: 'total', label: `Total ${label}`, value: insights.total, accent: 'indigo' as const },
      { id: 'approved', label: 'Completed', value: insights.approved, accent: 'emerald' as const },
      { id: 'pending', label: 'Pending', value: insights.pending, accent: 'amber' as const },
    ],
    charts,
  };
}

export function buildTableSectionFromSchema(
  moduleId: string,
  entityKey: string,
  entity: EntityDefinition,
  rows: Record<string, unknown>[],
) {
  return {
    id: `ai-${moduleId}-${entityKey}-table`,
    label: entity.label ?? entityKey,
    type: 'table' as const,
    toolbar: [],
    state: { rows },
    config: {
      columns: columnsFromSchema(entity),
      selectable: false,
      pageSize: 10,
      density: 'comfortable' as const,
    },
  };
}
