import { z } from 'zod';

/** Identifiers used to derive table/column names — validated so raw-SQL interpolation stays safe. */
export const SchemaIdentifierSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, 'Must be lowercase, start with a letter, and contain only letters/digits/underscore');

export const EntityFieldTypeSchema = z.enum([
  'string',
  'text',
  'number',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'select',
  'reference',
]);
export type EntityFieldType = z.infer<typeof EntityFieldTypeSchema>;

/**
 * A single field in a module's `schema.json` (Module System PRD v2 §7, §20).
 * `internal: true` marks a field the generic REST/UI layer never accepts
 * from a client or shows on the generated form — only a direct in-process
 * capability call can set it (used for cross-module origin tracking).
 */
export const EntityFieldSchema = z.object({
  type: EntityFieldTypeSchema,
  label: z.string().optional(),
  required: z.boolean().default(false),
  internal: z.boolean().default(false),
  listVisible: z.boolean().default(true),
  sortable: z.boolean().default(false),
  searchable: z.boolean().default(false),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  options: z.array(z.string()).optional(), // for type: 'select'
  entity: z.string().optional(), // for type: 'reference' — the referenced "<module>.<entity>"
  description: z.string().optional(), // semantic metadata for AI discovery (Amendment 01 §12)
});
export type EntityField = z.infer<typeof EntityFieldSchema>;

export const EntityDefinitionSchema = z.object({
  label: z.string().optional(),
  fields: z.record(SchemaIdentifierSchema, EntityFieldSchema),
  readOnly: z.boolean().default(false),
});
export type EntityDefinition = z.infer<typeof EntityDefinitionSchema>;

/** The full `schema.json` contract (Module System PRD v2 §5-7). */
export const ModuleEntitySchemaSchema = z.object({
  entities: z.record(SchemaIdentifierSchema, EntityDefinitionSchema),
});
export type ModuleEntitySchema = z.infer<typeof ModuleEntitySchemaSchema>;
