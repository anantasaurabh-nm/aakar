import { Injectable, Logger } from '@nestjs/common';
import type { EntityDefinition, EntityField, EntityFieldType } from '@erp/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { isValidIdentifier, tableName } from './sql-ident.util';

/**
 * Deliberately not a Postgres ENUM/FK for `select`/`reference` fields —
 * enum values would need `ALTER TYPE` on every schema.json edit, which
 * fights the idempotent-DDL model below, and option/reference validity is
 * already enforced by the generated zod request schema before the DB is
 * touched (Module System PRD v2 §7).
 */
function columnType(type: EntityFieldType): string {
  switch (type) {
    case 'string':
    case 'text':
    case 'select':
    case 'reference':
      return 'text';
    case 'number':
      return 'double precision';
    case 'decimal':
      return 'numeric(18,4)';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    case 'datetime':
      return 'timestamptz';
  }
}

/** Standard single-quote SQL string literal escaping — the only quoting mechanism available in plain DDL text (see note below on why this isn't a tagged template). */
function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function defaultClause(type: EntityFieldType, value: EntityField['default']): string {
  if (value === undefined) return '';
  switch (type) {
    case 'boolean':
      return ` DEFAULT ${Boolean(value)}`;
    case 'number':
    case 'decimal':
      return ` DEFAULT ${Number(value)}`;
    default:
      return ` DEFAULT ${sqlLiteral(String(value))}`;
  }
}

function quotedIdent(name: string): string {
  if (!isValidIdentifier(name)) throw new Error(`Invalid identifier "${name}"`);
  return `"${name}"`;
}

@Injectable()
export class EntityTableService {
  private readonly logger = new Logger('EntityTable');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS per
   * field, safe to run unconditionally on every boot. Uses
   * `$executeRawUnsafe` (plain string, not a Prisma tagged template)
   * because Prisma's tagged-template `$executeRaw` outright refuses to run
   * `ALTER` statements at all — every identifier here was already
   * regex-validated by `ident()`/`isValidIdentifier()` when its owning
   * module/entity/field was registered from schema.json (developer-authored
   * config, never end-user runtime input), so building plain DDL text is
   * the correct tool, not a security shortcut.
   *
   * Accepted V1 limitation: no DROP COLUMN or column type-change
   * reconciliation — a field removed from schema.json just becomes unused,
   * and changing a field's type after data exists is out of scope.
   */
  async ensureTable(moduleId: string, entityKey: string, entity: EntityDefinition): Promise<void> {
    const table = quotedIdent(tableName(moduleId, entityKey));

    await this.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${table} (
      id text PRIMARY KEY,
      tenant_id text NOT NULL,
      record_date date NOT NULL DEFAULT CURRENT_DATE,
      record_status text NOT NULL DEFAULT 'draft',
      created_at timestamptz NOT NULL DEFAULT now(),
      created_by text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by text
    )`);

    for (const [fieldKey, field] of Object.entries(entity.fields)) {
      const col = quotedIdent(fieldKey);
      const type = columnType(field.type);
      const def = defaultClause(field.type, field.default);
      await this.prisma.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}${def}`);
    }

    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS ${quotedIdent(`idx_${moduleId}_${entityKey}_tenant_date`)} ON ${table} (tenant_id, record_date)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS ${quotedIdent(`idx_${moduleId}_${entityKey}_tenant_status`)} ON ${table} (tenant_id, record_status)`,
    );

    this.logger.log(`Ensured table "${moduleId}_${entityKey}"`);
  }
}
