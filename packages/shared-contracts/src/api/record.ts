import { z } from 'zod';

/**
 * Standard business-record lifecycle states (Module System Amendment §6).
 */
export const RecordStatusSchema = z.enum([
  'draft',
  'submitted',
  'approved',
  'cancelled',
  'deleted',
]);
export type RecordStatus = z.infer<typeof RecordStatusSchema>;

/** Platform conceptual lifecycle graph (§7). Modules may restrict further. */
export const RECORD_LIFECYCLE: Record<RecordStatus, RecordStatus[]> = {
  draft: ['submitted', 'cancelled', 'deleted'],
  submitted: ['approved', 'cancelled', 'deleted'],
  approved: ['cancelled', 'deleted'],
  cancelled: ['deleted'],
  deleted: [],
};

export function isValidTransition(from: RecordStatus, to: RecordStatus): boolean {
  return RECORD_LIFECYCLE[from]?.includes(to) ?? false;
}

/**
 * Mandatory metadata for every persistent business entity (Module System
 * Amendment §2). Module-specific fields are added on top of this shape.
 */
export const BaseBusinessRecordSchema = z.object({
  id: z.string(),
  record_date: z.string(), // YYYY-MM-DD business date, distinct from created/updated timestamps
  record_status: RecordStatusSchema,
  created_at: z.string(),
  created_by: z.string().nullable(),
  updated_at: z.string(),
  updated_by: z.string().nullable(),
});
export type BaseBusinessRecord = z.infer<typeof BaseBusinessRecordSchema>;

/** Standard business-date filter shorthands (Amendment §4). */
export const RECORD_DATE_PRESETS = [
  'today',
  'tomorrow',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'all_time',
] as const;
export type RecordDatePreset = (typeof RECORD_DATE_PRESETS)[number];

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

/** Append-only audit event (Amendment §11-12). */
export const AuditEventSchema = z.object({
  event_id: z.string(),
  entity: z.string(),
  record_id: z.string(),
  action: z.string(),
  from_status: RecordStatusSchema.optional(),
  to_status: RecordStatusSchema.optional(),
  performed_by: z.string().nullable(),
  performed_at: z.string(),
  reason: z.string().optional(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;
