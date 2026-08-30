import { z, type ZodTypeAny } from 'zod';
import type { EntityDefinition, EntityField } from '@erp/shared-contracts';

/**
 * Builds a zod schema from only the entity's non-internal fields. This is
 * itself the trust boundary: the resulting schema's shape never declares
 * `internal` fields or a `_origin` key, so zod silently drops them from any
 * client-supplied body before a capability ever sees `params` (Module
 * System PRD v2 §49-50 — see EntityRegistryService.resolveCreateValues).
 */
function fieldSchema(field: EntityField): ZodTypeAny {
  let base: ZodTypeAny;
  switch (field.type) {
    case 'number':
    case 'decimal':
      base = z.coerce.number();
      break;
    case 'boolean':
      base = z.boolean();
      break;
    case 'select':
      base = field.options && field.options.length > 0 ? z.enum(field.options as [string, ...string[]]) : z.string();
      break;
    default:
      base = z.string();
  }
  // A field with a schema-declared default is always satisfiable even if
  // the client omits it — `required` in that case just means "never
  // null/empty once resolved," not "the request body must include it."
  const mustBeInRequest = field.required && field.default === undefined;
  return mustBeInRequest ? base : base.optional();
}

export function buildEntityRequestSchema(entity: EntityDefinition, options: { partial?: boolean } = {}) {
  const shape: Record<string, ZodTypeAny> = {};
  for (const [key, field] of Object.entries(entity.fields)) {
    if (field.internal) continue;
    shape[key] = options.partial ? fieldSchema(field).optional() : fieldSchema(field);
  }
  return z.object(shape);
}
