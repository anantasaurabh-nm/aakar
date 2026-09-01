import { z } from 'zod';
import { SchemaIdentifierSchema } from '../api/entity-schema';

export const ColumnTypeSchema = z.enum([
  'text',
  'badge',
  'number',
  'date',
  'datetime',
  'avatar',
  'tags',
  'boolean',
  'link',
]);
export type ColumnType = z.infer<typeof ColumnTypeSchema>;

export const TableColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: ColumnTypeSchema.default('text'),
  sortable: z.boolean().default(false),
  width: z.number().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
});
export type TableColumn = z.infer<typeof TableColumnSchema>;

export const TableConfigSchema = z.object({
  columns: z.array(TableColumnSchema).default([]),
  selectable: z.boolean().default(false),
  pageSize: z.number().default(50),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  rowActions: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        action: z.object({
          type: z.string(),
          target: z.string().optional(),
        }),
      }),
    )
    .optional(),
  /** Renders this table section as a card grid (currently: Home's Apps grid) instead of a `<table>`. */
  presentation: z.enum(['default', 'grid']).default('default'),
  /**
   * Set only by the schema-driven entity engine's generated table sections
   * (Module System PRD v2 §52). Opts a table into the record-lifecycle
   * experience: clickable rows open an in-place detail/edit view instead of
   * a rowActions column, plus sorting/column-filters/export/card-view/bulk
   * select. Bespoke Core admin tables (Users, AI Configuration, Module
   * Management) have no `record_status` lifecycle and keep `rowActions`
   * instead — never set this flag for them.
   */
  detailView: z.boolean().default(false),
});
export type TableConfig = z.infer<typeof TableConfigSchema>;

export const FilterOperatorSchema = z.enum([
  'contains',
  'not_contains',
  'eq',
  'neq',
  'starts_with',
  'ends_with',
  'gt',
  'lt',
  'gte',
  'lte',
]);
export type FilterOperator = z.infer<typeof FilterOperatorSchema>;

/** A single dynamic column filter row (finetune-1 §2.3) — column identifiers reuse the same regex guard as schema.json field keys before ever reaching raw SQL. */
export const ColumnFilterSchema = z.object({
  field: SchemaIdentifierSchema,
  operator: FilterOperatorSchema,
  value: z.union([z.string(), z.number(), z.boolean()]),
});
export type ColumnFilter = z.infer<typeof ColumnFilterSchema>;
