import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type RecordStatus } from '@prisma/client';
import type { ColumnFilter, EntityDefinition } from '@erp/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ident, isValidIdentifier, tableName } from './sql-ident.util';
import { getWorkflowForEntity } from './module-schema-loader';

/** Every value is still bound as a normal Prisma.sql placeholder — only the column identifier ever reaches Prisma.raw, and only after ident()'s regex check, same pattern as the rest of this file. */
export function operatorToSql(column: Prisma.Sql, operator: ColumnFilter['operator'], value: ColumnFilter['value']): Prisma.Sql {
  switch (operator) {
    case 'contains':
      return Prisma.sql`${column}::text ILIKE ${'%' + String(value) + '%'}`;
    case 'not_contains':
      return Prisma.sql`${column}::text NOT ILIKE ${'%' + String(value) + '%'}`;
    case 'starts_with':
      return Prisma.sql`${column}::text ILIKE ${String(value) + '%'}`;
    case 'ends_with':
      return Prisma.sql`${column}::text ILIKE ${'%' + String(value)}`;
    case 'neq':
      return typeof value === 'string'
        ? Prisma.sql`${column}::text NOT ILIKE ${String(value)}`
        : Prisma.sql`${column} != ${value}`;
    case 'gt':
      return Prisma.sql`${column} > ${value}`;
    case 'lt':
      return Prisma.sql`${column} < ${value}`;
    case 'gte':
      return Prisma.sql`${column} >= ${value}`;
    case 'lte':
      return Prisma.sql`${column} <= ${value}`;
    case 'eq':
    default:
      return typeof value === 'string'
        ? Prisma.sql`${column}::text ILIKE ${String(value)}`
        : Prisma.sql`${column} = ${value}`;
  }
}

/** Entity-agnostic — operates purely on the five fixed RecordStatus values (Module System PRD v2 §9). */
const ALLOWED_TRANSITIONS: Record<RecordStatus, RecordStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['approved', 'cancelled'],
  approved: ['cancelled'],
  cancelled: ['draft', 'deleted'],
  deleted: [],
};

export interface ListFilters {
  search?: string;
  status?: string;
  originModule?: string;
  originRecordId?: string;
  recordDateStart?: Date;
  recordDateEnd?: Date;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  columnFilters?: ColumnFilter[];
}

type Row = Record<string, unknown>;

/**
 * Postgres `date` columns come back from `$queryRaw` as JS `Date` objects at
 * UTC midnight; `timestamptz` columns have a real time-of-day component.
 * Formatting the former as `YYYY-MM-DD` (matching the Amendment's
 * record_date convention) without touching the latter needs no per-entity
 * knowledge of which fields are dates — the midnight-UTC heuristic is
 * enough, and covers both `record_date` and any custom `date`-type field.
 */
function formatRow(row: Row): Row {
  const formatted: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (
      value instanceof Date &&
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0
    ) {
      formatted[key] = value.toISOString().slice(0, 10);
    } else {
      formatted[key] = value;
    }
  }
  return formatted;
}

@Injectable()
export class EntityRepositoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private searchableFields(entity: EntityDefinition): string[] {
    return Object.entries(entity.fields)
      .filter(([, f]) => f.searchable && (f.type === 'string' || f.type === 'text'))
      .map(([key]) => key);
  }

  async list(moduleId: string, entityKey: string, entity: EntityDefinition, tenantId: string, filters: ListFilters) {
    const table = ident(tableName(moduleId, entityKey));
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const pageSize = Math.min(filters.pageSize && filters.pageSize > 0 ? filters.pageSize : 50, 200);

    const conditions: Prisma.Sql[] = [Prisma.sql`tenant_id = ${tenantId}`];
    conditions.push(
      filters.status ? Prisma.sql`record_status = ${filters.status}` : Prisma.sql`record_status != 'deleted'`,
    );
    if (filters.originModule) conditions.push(Prisma.sql`origin_module = ${filters.originModule}`);
    if (filters.originRecordId) conditions.push(Prisma.sql`origin_record_id = ${filters.originRecordId}`);
    if (filters.recordDateStart && filters.recordDateEnd) {
      conditions.push(Prisma.sql`record_date >= ${filters.recordDateStart} AND record_date < ${filters.recordDateEnd}`);
    }
    const searchable = this.searchableFields(entity);
    if (filters.search && searchable.length > 0) {
      // Match on individual significant words (OR'd) rather than the whole
      // phrase — lets a natural-language AI query like "mark smoke test v2
      // as done" still find a record titled "Smoke test v2".
      const words = filters.search
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .slice(0, 8);
      const terms = words.length > 0 ? words : [filters.search];
      const ors = searchable.flatMap((f) => terms.map((t) => Prisma.sql`${ident(f)} ILIKE ${'%' + t + '%'}`));
      conditions.push(Prisma.sql`(${Prisma.join(ors, ' OR ')})`);
    }
    for (const cf of filters.columnFilters ?? []) {
      if (!isValidIdentifier(cf.field)) continue; // malformed client input — silently ignored, never a 500
      conditions.push(operatorToSql(ident(cf.field), cf.operator, cf.value));
    }

    const where = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
    const orderColumn = filters.sortBy && isValidIdentifier(filters.sortBy) ? ident(filters.sortBy) : ident('record_date');
    const orderDir = Prisma.raw(filters.sortDir === 'asc' ? 'ASC' : 'DESC');

    const rows = await this.prisma.$queryRaw<Row[]>(
      Prisma.sql`SELECT * FROM ${table} ${where} ORDER BY ${orderColumn} ${orderDir} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    );
    const countRows = await this.prisma.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT COUNT(*)::bigint AS count FROM ${table} ${where}`,
    );
    return { items: rows.map(formatRow), page, pageSize, total: Number(countRows[0]?.count ?? 0) };
  }

  async getById(moduleId: string, entityKey: string, tenantId: string, id: string): Promise<Row> {
    const table = ident(tableName(moduleId, entityKey));
    const rows = await this.prisma.$queryRaw<Row[]>(
      Prisma.sql`SELECT * FROM ${table} WHERE id = ${id} AND tenant_id = ${tenantId}`,
    );
    if (!rows[0]) throw new NotFoundException(`${entityKey} not found`);
    return formatRow(rows[0]);
  }

  /** `values` already includes any resolved internal fields (e.g. origin_module) — the capability layer decides those, not this method. */
  async create(moduleId: string, entityKey: string, tenantId: string, userId: string, values: Row): Promise<Row> {
    const table = ident(tableName(moduleId, entityKey));
    const id = randomUUID();
    const fieldNames = Object.keys(values);
    const columns = Prisma.join(
      ['id', 'tenant_id', 'created_by', 'updated_by', ...fieldNames].map(ident),
      ', ',
    );
    const placeholders = Prisma.join(
      [Prisma.sql`${id}`, Prisma.sql`${tenantId}`, Prisma.sql`${userId}`, Prisma.sql`${userId}`, ...fieldNames.map((f) => Prisma.sql`${values[f]}`)],
      ', ',
    );

    await this.prisma.$executeRaw(Prisma.sql`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`);
    const created = await this.getById(moduleId, entityKey, tenantId, id);
    await this.audit.record({
      tenantId,
      entity: `${moduleId}.${entityKey}`,
      recordId: id,
      action: 'created',
      toStatus: 'draft',
      performedBy: userId,
    });
    return created;
  }

  async update(moduleId: string, entityKey: string, tenantId: string, userId: string, id: string, values: Row): Promise<Row> {
    const existing = await this.getById(moduleId, entityKey, tenantId, id);
    if (existing.record_status === 'deleted') {
      throw new BadRequestException('Cannot update a deleted record');
    }
    const table = ident(tableName(moduleId, entityKey));
    const fieldNames = Object.keys(values);
    if (fieldNames.length > 0) {
      const assignments = Prisma.join(
        fieldNames.map((f) => Prisma.sql`${ident(f)} = ${values[f]}`),
        ', ',
      );
      await this.prisma.$executeRaw(
        Prisma.sql`UPDATE ${table} SET ${assignments}, updated_by = ${userId}, updated_at = now() WHERE id = ${id} AND tenant_id = ${tenantId}`,
      );
    }
    await this.audit.record({
      tenantId,
      entity: `${moduleId}.${entityKey}`,
      recordId: id,
      action: 'updated',
      performedBy: userId,
    });
    return this.getById(moduleId, entityKey, tenantId, id);
  }

  async transition(
    moduleId: string,
    entityKey: string,
    tenantId: string,
    userId: string,
    id: string,
    to: RecordStatus,
    context?: { userRole?: string; reason?: string },
  ): Promise<Row> {
    const existing = await this.getById(moduleId, entityKey, tenantId, id);
    const from = existing.record_status as RecordStatus;

    // Check for custom Level 4 Workflow definition
    const workflow = getWorkflowForEntity(moduleId, entityKey);
    if (workflow) {
      const stateConfig = workflow.states[from];
      if (!stateConfig) {
        throw new BadRequestException(`Unknown state "${from}" for workflow "${workflow.id}"`);
      }
      const transitionDef = stateConfig.transitions?.find((t) => t.to === to);
      if (!transitionDef) {
        throw new BadRequestException(
          `Cannot transition from "${from}" to "${to}" for ${workflow.name || entityKey}`,
        );
      }

      // Maker-checker enforcement: Submitter / creator cannot approve their own record
      if (transitionDef.makerChecker) {
        const creator = existing.created_by;
        const submitter = existing.submitted_by;
        if (userId === creator || (submitter && userId === submitter)) {
          throw new ForbiddenException(
            'Maker-checker rule violation: Submitter cannot approve their own record',
          );
        }
      }

      // Role check: Only authorized roles can execute this transition
      if (transitionDef.requiredRoles && transitionDef.requiredRoles.length > 0 && context?.userRole) {
        const allowedRoles = transitionDef.requiredRoles.map((r) => r.toUpperCase());
        if (!allowedRoles.includes(context.userRole.toUpperCase())) {
          throw new ForbiddenException(
            `Role "${context.userRole}" is not authorized for this transition. Required: ${transitionDef.requiredRoles.join(', ')}`,
          );
        }
      }

      // Required fields validation
      if (transitionDef.requiredFields && transitionDef.requiredFields.length > 0) {
        for (const field of transitionDef.requiredFields) {
          if (existing[field] === undefined || existing[field] === null || existing[field] === '') {
            throw new BadRequestException(
              `Field "${field}" must be filled before transitioning to "${to}"`,
            );
          }
        }
      }
    } else {
      // Default 5-state lifecycle
      const allowed = ALLOWED_TRANSITIONS[from] ?? [];
      if (!allowed.includes(to)) {
        throw new BadRequestException(`Cannot transition from "${from}" to "${to}"`);
      }
    }

    const table = ident(tableName(moduleId, entityKey));
    const updates = [
      Prisma.sql`record_status = ${to}`,
      Prisma.sql`updated_by = ${userId}`,
      Prisma.sql`updated_at = now()`,
    ];

    // Automatically stamp workflow approval metadata if columns exist on the table
    if (to === 'submitted') {
      if ('submitted_by' in existing) updates.push(Prisma.sql`submitted_by = ${userId}`);
      if ('submitted_at' in existing) updates.push(Prisma.sql`submitted_at = now()`);
    } else if (to === 'approved') {
      if ('approved_by' in existing) updates.push(Prisma.sql`approved_by = ${userId}`);
      if ('approved_at' in existing) updates.push(Prisma.sql`approved_at = now()`);
    } else if (to === 'cancelled') {
      if ('cancelled_by' in existing) updates.push(Prisma.sql`cancelled_by = ${userId}`);
      if ('cancelled_at' in existing) updates.push(Prisma.sql`cancelled_at = now()`);
    }

    await this.prisma.$executeRaw`UPDATE ${table} SET ${Prisma.join(updates, ', ')} WHERE id = ${id} AND tenant_id = ${tenantId}`;

    await this.audit.record({
      tenantId,
      entity: `${moduleId}.${entityKey}`,
      recordId: id,
      action: 'status_changed',
      fromStatus: from,
      toStatus: to,
      performedBy: userId,
      reason: context?.reason,
    });

    return this.getById(moduleId, entityKey, tenantId, id);
  }

  async insights(
    moduleId: string,
    entityKey: string,
    tenantId: string,
    filters: { recordDateStart?: Date; recordDateEnd?: Date; breakdownField?: string },
  ) {
    const table = ident(tableName(moduleId, entityKey));
    const base = [Prisma.sql`tenant_id = ${tenantId}`, Prisma.sql`record_status != 'deleted'`];
    if (filters.recordDateStart && filters.recordDateEnd) {
      base.push(Prisma.sql`record_date >= ${filters.recordDateStart} AND record_date < ${filters.recordDateEnd}`);
    }
    const where = Prisma.sql`WHERE ${Prisma.join(base, ' AND ')}`;

    const [totalRows, approvedRows, pendingRows] = await Promise.all([
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM ${table} ${where}`),
      this.prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::bigint AS count FROM ${table} ${where} AND record_status = 'approved'`,
      ),
      this.prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::bigint AS count FROM ${table} ${where} AND record_status IN ('draft','submitted')`,
      ),
    ]);

    let breakdown: { value: string; count: number }[] = [];
    if (filters.breakdownField) {
      const col = ident(filters.breakdownField);
      const rows = await this.prisma.$queryRaw<{ value: string; count: bigint }[]>(
        Prisma.sql`SELECT ${col} AS value, COUNT(*)::bigint AS count FROM ${table} ${where} GROUP BY ${col}`,
      );
      breakdown = rows.map((r) => ({ value: r.value, count: Number(r.count) }));
    }

    const trend: { x: string; y: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const start = new Date(day.toDateString());
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const rows = await this.prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::bigint AS count FROM ${table} WHERE tenant_id = ${tenantId} AND record_date >= ${start} AND record_date < ${end}`,
      );
      trend.push({ x: start.toISOString().slice(5, 10), y: Number(rows[0]?.count ?? 0) });
    }

    return {
      total: Number(totalRows[0]?.count ?? 0),
      approved: Number(approvedRows[0]?.count ?? 0),
      pending: Number(pendingRows[0]?.count ?? 0),
      breakdown,
      trend,
    };
  }
}
