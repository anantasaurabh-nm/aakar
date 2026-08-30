import type { EntityDefinition } from '@erp/shared-contracts';

export interface RequestOrigin {
  module?: string;
  entityType?: string;
  recordId?: string;
}

/**
 * Public-input trust boundary: fields not marked `internal` are taken from
 * client-supplied params exactly as submitted. Internal fields fall back to
 * their schema-declared default UNLESS the caller passed a reserved
 * `params._origin: {module, entityType?, recordId?}` — that key can only
 * ever be populated by an in-process capability call, never by an HTTP
 * body, since the generic controller builds `params` from a zod schema that
 * never declares `_origin` in its shape and zod silently drops undeclared
 * keys (Module System PRD v2 §49-50).
 */
export function resolveCreateValues(entity: EntityDefinition, params: Record<string, unknown>): Record<string, unknown> {
  const origin = params._origin as RequestOrigin | undefined;
  const values: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(entity.fields)) {
    if (field.internal) {
      if (key === 'origin_module' && origin?.module) values[key] = origin.module;
      else if (key === 'origin_entity_type' && origin?.entityType) values[key] = origin.entityType;
      else if (key === 'origin_record_id' && origin?.recordId) values[key] = origin.recordId;
      else if (field.default !== undefined) values[key] = field.default;
      continue;
    }
    if (params[key] !== undefined) values[key] = params[key];
    else if (field.default !== undefined) values[key] = field.default;
  }
  return values;
}

/** Same trust boundary as `resolveCreateValues`, for partial updates — internal fields are never writable. */
export function resolveWritableValues(entity: EntityDefinition, params: Record<string, unknown>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(entity.fields)) {
    if (field.internal) continue;
    if (params[key] !== undefined) values[key] = params[key];
  }
  return values;
}
