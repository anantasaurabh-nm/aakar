import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { EntityDefinition } from '@erp/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { loadModuleOnDisk } from './module-schema-loader';
import { ident, isValidIdentifier, tableName } from './sql-ident.util';

export interface TargetEntityMeta {
  isCoreUser: boolean;
  tableName: string;
  idCol: string;
  displayCol: string;
  label: string;
  hasTenant: boolean;
}

export function findDefaultDisplayField(entity?: EntityDefinition): string {
  if (!entity || !entity.fields) return 'id';
  if (entity.displayField && entity.fields[entity.displayField]) {
    return entity.displayField;
  }
  const candidateKeys = ['name', 'title', 'label', 'employee_name', 'username', 'code', 'subject'];
  for (const key of candidateKeys) {
    if (entity.fields[key]) return key;
  }
  for (const [key, field] of Object.entries(entity.fields)) {
    if (!field.internal && (field.type === 'string' || field.type === 'text')) {
      return key;
    }
  }
  return 'id';
}

@Injectable()
export class ReferenceResolverService {
  private readonly logger = new Logger('ReferenceResolver');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves target entity metadata without any hardcoded module logic.
   */
  resolveTargetMeta(targetRef: string, callerDisplayField?: string): TargetEntityMeta | null {
    if (!targetRef || typeof targetRef !== 'string' || !targetRef.includes('.')) {
      return null;
    }

    const [targetModule, targetEntityKey] = targetRef.split('.');

    // Platform built-in user entity
    if ((targetModule === 'core' || targetModule === 'user-management') && targetEntityKey === 'user') {
      return {
        isCoreUser: true,
        tableName: 'users',
        idCol: 'id',
        displayCol: callerDisplayField || 'username',
        label: 'Users',
        hasTenant: true,
      };
    }

    // Platform built-in role entity
    if (targetModule === 'user-roles' && targetEntityKey === 'role') {
      return {
        isCoreUser: false,
        tableName: 'role_definitions',
        idCol: 'id',
        displayCol: callerDisplayField || 'name',
        label: 'Roles',
        hasTenant: false,
      };
    }

    // Generic schema-driven module entity (e.g. employees.employee, departments.department, etc.)
    const loaded = loadModuleOnDisk(targetModule);
    const targetEntityDef = loaded?.schema?.entities?.[targetEntityKey];
    const cleanTable = tableName(targetModule, targetEntityKey);

    if (!isValidIdentifier(cleanTable)) {
      this.logger.warn(`Invalid table name derived from reference "${targetRef}"`);
      return null;
    }

    const displayCol =
      callerDisplayField && isValidIdentifier(callerDisplayField)
        ? callerDisplayField
        : findDefaultDisplayField(targetEntityDef);

    return {
      isCoreUser: false,
      tableName: cleanTable,
      idCol: 'id',
      displayCol: isValidIdentifier(displayCol) ? displayCol : 'id',
      label: targetEntityDef?.label || targetEntityKey,
      hasTenant: true,
    };
  }

  /**
   * Returns dropdown options for forms: [{ label, value }]
   */
  async getOptions(targetRef: string, tenantId: string, callerDisplayField?: string): Promise<{ label: string; value: string }[]> {
    const meta = this.resolveTargetMeta(targetRef, callerDisplayField);
    if (!meta) return [];

    try {
      if (meta.isCoreUser) {
        const users = await this.prisma.user.findMany({
          where: { tenantId, isActive: true },
          select: { id: true, username: true, email: true },
          orderBy: { username: 'asc' },
        });
        return users.map((u) => ({
          label: `${u.username} (${u.email})`,
          value: u.id,
        }));
      }

      if (meta.hasTenant) {
        const rows = await this.prisma.$queryRaw<Array<{ id: string; label: unknown }>>(
          Prisma.sql`SELECT id, ${ident(meta.displayCol)} AS label 
                     FROM ${ident(meta.tableName)} 
                     WHERE tenant_id = ${tenantId} AND record_status != 'deleted' 
                     ORDER BY ${ident(meta.displayCol)} ASC`,
        );
        return rows.map((r) => ({
          label: String(r.label ?? r.id),
          value: r.id,
        }));
      }

      const rows = await this.prisma.$queryRaw<Array<{ id: string; label: unknown }>>(
        Prisma.sql`SELECT id, ${ident(meta.displayCol)} AS label 
                   FROM ${ident(meta.tableName)} 
                   ORDER BY ${ident(meta.displayCol)} ASC`,
      );
      return rows.map((r) => ({
        label: String(r.label ?? r.id),
        value: r.id,
      }));
    } catch (err) {
      this.logger.warn(`Could not load options for reference "${targetRef}": ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /**
   * Batch resolves IDs to display labels for a page of rows.
   */
  async resolveBatchLabels(
    targetRef: string,
    ids: string[],
    tenantId: string,
    callerDisplayField?: string,
  ): Promise<Map<string, string>> {
    const labelMap = new Map<string, string>();
    const uniqueIds = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 0)));
    if (uniqueIds.length === 0) return labelMap;

    const meta = this.resolveTargetMeta(targetRef, callerDisplayField);
    if (!meta) return labelMap;

    try {
      if (meta.isCoreUser) {
        const users = await this.prisma.user.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true, username: true, email: true },
        });
        for (const u of users) {
          labelMap.set(u.id, u.username);
        }
        return labelMap;
      }

      const rows = await this.prisma.$queryRaw<Array<{ id: string; label: unknown }>>(
        Prisma.sql`SELECT id, ${ident(meta.displayCol)} AS label 
                   FROM ${ident(meta.tableName)} 
                   WHERE id IN (${Prisma.join(uniqueIds)})`,
      );
      for (const r of rows) {
        labelMap.set(r.id, String(r.label ?? r.id));
      }
      return labelMap;
    } catch (err) {
      this.logger.warn(`Could not batch resolve labels for reference "${targetRef}": ${err instanceof Error ? err.message : String(err)}`);
      return labelMap;
    }
  }

  /**
   * Search an entity for AI intent resolution.
   */
  async searchReference(
    targetRef: string,
    tenantId: string,
    searchTerm: string,
    callerDisplayField?: string,
  ): Promise<{ matchedId?: string; matchedLabel?: string; availableLabels: string[]; entityLabel: string }> {
    const meta = this.resolveTargetMeta(targetRef, callerDisplayField);
    if (!meta) {
      return { availableLabels: [], entityLabel: targetRef };
    }

    const normSearch = searchTerm.trim().toLowerCase();

    if (meta.isCoreUser) {
      const users = await this.prisma.user.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, username: true, email: true },
      });

      const matched = users.find((u) => {
        const uNorm = u.username.toLowerCase();
        const eNorm = u.email.toLowerCase();
        const parts = uNorm.split('.');
        return (
          uNorm === normSearch ||
          parts.includes(normSearch) ||
          eNorm.startsWith(normSearch) ||
          uNorm.replace(/\./g, ' ') === normSearch ||
          parts.some((p) => p.startsWith(normSearch))
        );
      });

      const formatName = (un: string) =>
        un
          .split('.')
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(' ');

      const available = users
        .filter((u) => u.username !== 'super.admin')
        .map((u) => formatName(u.username));

      return {
        matchedId: matched?.id,
        matchedLabel: matched ? formatName(matched.username) : undefined,
        availableLabels: available,
        entityLabel: 'Users',
      };
    }

    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: string; label: unknown }>>(
        Prisma.sql`SELECT id, ${ident(meta.displayCol)} AS label 
                   FROM ${ident(meta.tableName)} 
                   WHERE tenant_id = ${tenantId} AND record_status != 'deleted' 
                   ORDER BY ${ident(meta.displayCol)} ASC`,
      );

      const matched = rows.find((r) => {
        const l = String(r.label ?? '').toLowerCase();
        return l === normSearch || l.includes(normSearch);
      });

      const available = rows.map((r) => String(r.label ?? r.id));

      return {
        matchedId: matched?.id,
        matchedLabel: matched ? String(matched.label ?? matched.id) : undefined,
        availableLabels: available,
        entityLabel: meta.label,
      };
    } catch {
      return { availableLabels: [], entityLabel: meta.label };
    }
  }
}
