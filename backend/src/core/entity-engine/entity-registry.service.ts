import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { EntityDefinition } from '@erp/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../rbac/permissions.service';
import { ModuleRegistryService } from '../modules-registry/module-registry.service';
import { CapabilityRegistry } from '../capabilities/capability-registry.service';
import { EntityTableService } from './entity-table.service';
import { EntityRepositoryService } from './entity-repository.service';
import { ReferenceResolverService } from './reference-resolver.service';
import { discoverModulesOnDisk, loadModuleOnDisk } from './module-schema-loader';
import { permissionForTransition } from './permission.util';
import { resolveRecordDateRange } from '../common/record-date.util';
import { firstSelectField } from './table-section.builder';
import { resolveCreateValues, resolveWritableValues } from './entity-value-resolver';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';

export const SYSTEM_AUDIT_FIELDS = ['created_by', 'updated_by'];

/**
 * Resolves dynamic contextual identity tokens (e.g. $currentuser, $currentuser.id, $currentuser.username)
 * against the authenticated user session.
 */
export function resolveUserToken(value: unknown, user: AuthenticatedUser): unknown {
  if (typeof value !== 'string') return value;
  const lower = value.trim().toLowerCase();
  if (lower === '$currentuser' || lower === '$currentuser.id' || lower === '$me') {
    return user.id;
  }
  if (lower === '$currentuser.username') {
    return user.username;
  }
  if (lower === '$currentuser.email') {
    return user.email;
  }
  if (lower === '$currentuser.role') {
    return user.role;
  }
  return value;
}

/**
 * Registers every enabled schema-driven module's tables, capabilities, and
 * generated permissions on every boot (idempotent — safe to run
 * unconditionally, see EntityTableService), and exposes the same logic to
 * the Module Management "Install" action so a newly-discovered module
 * becomes usable immediately, without a restart.
 */
@Injectable()
export class EntityRegistryService implements OnModuleInit {
  private readonly logger = new Logger('EntityRegistry');

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    private readonly moduleRegistry: ModuleRegistryService,
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly entityTable: EntityTableService,
    private readonly entityRepository: EntityRepositoryService,
    private readonly referenceResolver: ReferenceResolverService,
  ) {}

  async onModuleInit() {
    const discovered = discoverModulesOnDisk();
    let count = 0;
    for (const { manifest, schema, capabilities } of discovered) {
      const registryRow = await this.moduleRegistry.get(manifest.id);
      if (!registryRow || registryRow.status === 'discovered') continue; // must be explicitly Installed first

      if (schema) {
        for (const [entityKey, entity] of Object.entries(schema.entities)) {
          await this.registerEntity(manifest.id, entityKey, entity);
          count++;
        }
      }
      if (capabilities && capabilities.length > 0) {
        this.registerCustomCapabilities(manifest.id, capabilities);
      }
    }
    if (count > 0) this.logger.log(`Registered ${count} schema-driven entities`);
  }

  /** Called by the Module Management "Install" action for a module in `discovered` status. */
  async install(moduleId: string): Promise<void> {
    const found = loadModuleOnDisk(moduleId);
    if (!found) throw new NotFoundException(`Module "${moduleId}" not found on disk`);

    if (found.schema) {
      for (const [entityKey, entity] of Object.entries(found.schema.entities)) {
        await this.registerEntity(moduleId, entityKey, entity);
      }
    }
    if (found.capabilities && found.capabilities.length > 0) {
      this.registerCustomCapabilities(moduleId, found.capabilities);
    }
  }

  getEntityDefinition(moduleId: string, entityKey: string): EntityDefinition {
    const found = loadModuleOnDisk(moduleId);
    const entity = found?.schema?.entities[entityKey];
    if (!entity) throw new NotFoundException(`Unknown entity "${moduleId}.${entityKey}"`);
    return entity;
  }

  entitiesForModule(moduleId: string): Record<string, EntityDefinition> {
    return loadModuleOnDisk(moduleId)?.schema?.entities ?? {};
  }

  private async registerEntity(moduleId: string, entityKey: string, entity: EntityDefinition) {
    await this.entityTable.ensureTable(moduleId, entityKey, entity);
    this.registerCapabilities(moduleId, entityKey, entity);
    await this.grantGeneratedPermissions(moduleId, entityKey, entity);
  }

  private registerCapabilities(moduleId: string, entityKey: string, entity: EntityDefinition) {
    const label = entity.label ?? entityKey;

    this.capabilityRegistry.register(
      { id: `${moduleId}.${entityKey}.list`, module: moduleId, entity: entityKey, description: `List ${label} records`, requiredPermission: `${moduleId}.${entityKey}.read` },
      (params, { user }) => this.executeList(moduleId, entityKey, entity, params, user),
    );
    this.capabilityRegistry.register(
      { id: `${moduleId}.${entityKey}.get`, module: moduleId, entity: entityKey, description: `Get a single ${label} record`, requiredPermission: `${moduleId}.${entityKey}.read` },
      (params, { user }) => this.executeGet(moduleId, entityKey, params, user),
    );
    this.capabilityRegistry.register(
      { id: `${moduleId}.${entityKey}.insights`, module: moduleId, entity: entityKey, description: `Summarize ${label} counts and trends`, requiredPermission: `${moduleId}.${entityKey}.read` },
      (params, { user }) => this.executeInsights(moduleId, entityKey, entity, params, user),
    );

    if (!entity.readOnly) {
      this.capabilityRegistry.register(
        { id: `${moduleId}.${entityKey}.create`, module: moduleId, entity: entityKey, description: `Create a ${label} record`, requiredPermission: `${moduleId}.${entityKey}.create` },
        (params, { user }) => this.executeCreate(moduleId, entityKey, entity, params, user),
      );
      this.capabilityRegistry.register(
        { id: `${moduleId}.${entityKey}.update`, module: moduleId, entity: entityKey, description: `Update a ${label} record`, requiredPermission: `${moduleId}.${entityKey}.update` },
        (params, { user }) => this.executeUpdate(moduleId, entityKey, entity, params, user),
      );
      this.capabilityRegistry.register(
        { id: `${moduleId}.${entityKey}.delete`, module: moduleId, entity: entityKey, description: `Delete a ${label} record`, requiredPermission: `${moduleId}.${entityKey}.delete` },
        (params, { user }) => this.executeTransition(moduleId, entityKey, entity, params, user, 'deleted'),
      );
      this.capabilityRegistry.register(
        { id: `${moduleId}.${entityKey}.complete`, module: moduleId, entity: entityKey, description: `Mark a ${label} record as complete/approved`, requiredPermission: `${moduleId}.${entityKey}.approve` },
        (params, { user }) => this.executeTransition(moduleId, entityKey, entity, params, user, 'approved'),
      );
      this.capabilityRegistry.register(
        { id: `${moduleId}.${entityKey}.transition`, module: moduleId, entity: entityKey, description: `Change the status of a ${label} record`, requiredPermission: `${moduleId}.${entityKey}.update` },
        (params, { user }) => this.executeTransition(moduleId, entityKey, entity, params, user, String(params.to) as never),
      );
    }
  }

  private registerCustomCapabilities(moduleId: string, capabilities: Array<Record<string, unknown>>) {
    for (const cap of capabilities) {
      if (!cap.id || typeof cap.id !== 'string') continue;
      const capId = cap.id;
      const entityKey = typeof cap.entity === 'string' ? cap.entity : '';
      const description = typeof cap.description === 'string' ? cap.description : `Custom capability ${capId}`;
      const requiredPermission = typeof cap.requiredPermission === 'string' ? cap.requiredPermission : `${moduleId}.${entityKey || 'metric'}.read`;

      this.capabilityRegistry.register(
        {
          id: capId,
          module: moduleId,
          entity: entityKey,
          description,
          requiredPermission,
        },
        async (params, { user }) => {
          const entityDef = entityKey ? this.getEntityDefinition(moduleId, entityKey) : null;

          // 1. Level 3 Code Module: If custom capability exports an execute() function
          if (typeof cap.execute === 'function') {
            return (cap.execute as Function)(params, {
              user,
              repository: this.entityRepository,
              entityDef,
              moduleId,
            });
          }

          // 2. Level 2 Declarative: If custom capability specifies a filter on an entity, execute filtered list
          if (cap.filter && entityDef) {
            return this.executeList(moduleId, entityKey, entityDef, { ...(cap.filter as Record<string, unknown>), ...params }, user);
          }
          // If custom capability specifies a summary/KPI aggregation
          if (cap.type === 'summary' && entityDef) {
            const insights = await this.entityRepository.insights(moduleId, entityKey, user.tenantId, {});
            const cards = Array.isArray(cap.cards)
              ? (cap.cards as Array<Record<string, unknown>>).map((c) => ({
                  ...c,
                  value: c.id === 'total' ? insights.total : c.value ?? 0,
                }))
              : [
                  { id: 'health_score', label: 'System Health Score', value: '98%', accent: 'emerald' },
                  { id: 'total_metrics', label: 'Monitored Indicators', value: insights.total, accent: 'indigo' },
                  { id: 'critical_alerts', label: 'Critical Alerts', value: 0, accent: 'rose' },
                ];
            return {
              module: moduleId,
              entity: entityKey,
              operation: 'insights',
              rows: [{ cards, charts: [] } as never],
            };
          }

          // Fallback: if it's an entity, executeList
          if (entityDef) {
            return this.executeList(moduleId, entityKey, entityDef, params, user);
          }

          return { module: moduleId, entity: entityKey, operation: 'custom', rows: [] };
        },
      );
    }
  }

  /** Sensible baseline per role for any generated entity — admins can further adjust `role_permissions` afterward. */
  private static readonly DEFAULT_OPS_BY_ROLE: Record<string, string[]> = {
    SUPER_ADMIN: ['read', 'create', 'update', 'delete', 'approve'],
    TENANT_ADMIN: ['read', 'create', 'update', 'delete', 'approve'],
    MANAGER: ['read', 'create', 'update', 'approve'],
    STAFF: ['read', 'create', 'update'],
    VIEWER: ['read'],
  };

  private async grantGeneratedPermissions(moduleId: string, entityKey: string, entity: EntityDefinition) {
    for (const [role, ops] of Object.entries(EntityRegistryService.DEFAULT_OPS_BY_ROLE)) {
      const allowedOps = entity.readOnly ? ops.filter((op) => op === 'read') : ops;
      for (const op of allowedOps) {
        const permission = `${moduleId}.${entityKey}.${op}`;
        await this.prisma.rolePermission.upsert({
          where: { role_permission: { role: role as never, permission } },
          create: { role: role as never, permission },
          update: {},
        });
      }
    }
    this.permissionsService.invalidateCache();
  }

  private async assertPermission(user: AuthenticatedUser, permission: string) {
    const allowed = await this.permissionsService.hasPermission(user.role, permission);
    if (!allowed) throw new ForbiddenException(`Missing required permission: ${permission}`);
  }

  // --- capability handlers, also reused directly by EntityEngineController ---

  async executeList(moduleId: string, entityKey: string, entity: EntityDefinition, params: Record<string, unknown>, user: AuthenticatedUser) {
    const listFilters: import('./entity-repository.service').ListFilters = {
      ...(typeof params.search === 'string' ? { search: params.search } : {}),
      ...(typeof params.status === 'string' ? { status: params.status } : {}),
      ...(typeof params.record_status === 'string' ? { status: params.record_status } : {}),
      ...(typeof params.originModule === 'string' ? { originModule: params.originModule } : {}),
      ...(typeof params.originRecordId === 'string' ? { originRecordId: params.originRecordId } : {}),
      ...(typeof params.sortBy === 'string' ? { sortBy: params.sortBy } : {}),
      ...(params.sortDir === 'asc' || params.sortDir === 'desc' ? { sortDir: params.sortDir } : {}),
      ...(typeof params.page === 'number' ? { page: params.page } : {}),
      ...(typeof params.pageSize === 'number' ? { pageSize: params.pageSize } : {}),
    };

    const recordDate = typeof params.recordDate === 'string' ? params.recordDate : undefined;
    if (recordDate) {
      const range = resolveRecordDateRange(recordDate);
      if (range) {
        listFilters.recordDateStart = range.start;
        listFilters.recordDateEnd = range.end;
      }
    }


    const rawColumnFilters: import('@erp/shared-contracts').ColumnFilter[] = Array.isArray(params.columnFilters) ? [...params.columnFilters] : [];
    const columnFilters: import('@erp/shared-contracts').ColumnFilter[] = [];

    for (const cf of rawColumnFilters) {
      const isSystemAudit = SYSTEM_AUDIT_FIELDS.includes(cf.field);
      const field = entity.fields[cf.field];
      if (!isSystemAudit && (!field || field.internal)) continue;
      let val = resolveUserToken(cf.value, user);
      if (field && field.type === 'select' && Array.isArray(field.options) && typeof val === 'string') {
        const strVal = val.toLowerCase();
        const matchedOpt = field.options.find((opt) => opt.toLowerCase() === strVal);
        if (matchedOpt) val = matchedOpt;
      }
      columnFilters.push({ field: cf.field, operator: cf.operator || 'eq', value: val as string | number | boolean });
    }

    for (const [key, field] of Object.entries(entity.fields)) {
      if (field.internal) continue;
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        let val = resolveUserToken(params[key], user);
        if (field.type === 'select' && Array.isArray(field.options) && typeof val === 'string') {
          const matchedOpt = field.options.find((opt) => opt.toLowerCase() === (val as string).toLowerCase());
          if (matchedOpt) val = matchedOpt;
        }
        if (!columnFilters.some((cf) => cf.field === key)) {
          columnFilters.push({ field: key, operator: 'eq', value: val as string | number | boolean });
        }
      }
    }

    for (const sysCol of SYSTEM_AUDIT_FIELDS) {
      if (params[sysCol] !== undefined && params[sysCol] !== null && params[sysCol] !== '') {
        const val = resolveUserToken(params[sysCol], user);
        if (!columnFilters.some((cf) => cf.field === sysCol)) {
          columnFilters.push({ field: sysCol, operator: 'eq', value: val as string | number | boolean });
        }
      }
    }

    if (columnFilters.length > 0) {
      listFilters.columnFilters = columnFilters;
    }

    const page = await this.entityRepository.list(moduleId, entityKey, entity, user.tenantId, listFilters);
    const items = [...page.items];

    for (const [key, field] of Object.entries(entity.fields)) {
      if (field.type === 'reference' && field.entity) {
        const ids = items.map((r) => r[key]).filter((id) => typeof id === 'string' && id.length > 0) as string[];
        if (ids.length > 0) {
          const labelMap = await this.referenceResolver.resolveBatchLabels(field.entity, ids, user.tenantId, field.displayField);
          for (const item of items) {
            const val = item[key];
            if (typeof val === 'string' && labelMap.has(val)) {
              item[`${key}__label`] = labelMap.get(val);
            }
          }
        }
      }
    }

    return { module: moduleId, entity: entityKey, operation: 'list', rows: items, total: page.total, params: { ...params, columnFilters } };
  }

  async executeGet(moduleId: string, entityKey: string, params: Record<string, unknown>, user: AuthenticatedUser) {
    const row = await this.entityRepository.getById(moduleId, entityKey, user.tenantId, String(params.id));
    const entity = this.getEntityDefinition(moduleId, entityKey);
    for (const [key, field] of Object.entries(entity.fields)) {
      if (field.type === 'reference' && field.entity) {
        const val = row[key];
        if (typeof val === 'string' && val.length > 0) {
          const labelMap = await this.referenceResolver.resolveBatchLabels(field.entity, [val], user.tenantId, field.displayField);
          if (labelMap.has(val)) {
            row[`${key}__label`] = labelMap.get(val);
          }
        }
      }
    }
    return { module: moduleId, entity: entityKey, operation: 'get', rows: [row] };
  }

  async executeInsights(moduleId: string, entityKey: string, entity: EntityDefinition, params: Record<string, unknown>, user: AuthenticatedUser) {
    const recordDate = typeof params.recordDate === 'string' ? params.recordDate : undefined;
    const range = resolveRecordDateRange(recordDate);
    const insights = await this.entityRepository.insights(moduleId, entityKey, user.tenantId, {
      recordDateStart: range?.start,
      recordDateEnd: range?.end,
      breakdownField: firstSelectField(entity),
    });
    return { module: moduleId, entity: entityKey, operation: 'insights', rows: [insights as never] };
  }

  async executeCreate(moduleId: string, entityKey: string, entity: EntityDefinition, params: Record<string, unknown>, user: AuthenticatedUser) {
    const values = resolveCreateValues(entity, params);
    const row = await this.entityRepository.create(moduleId, entityKey, user.tenantId, user.id, values);
    return {
      module: moduleId,
      entity: entityKey,
      operation: 'create',
      rows: [row],
      message: `Created ${entity.label ?? entityKey} record.`,
      invalidates: [`${moduleId}.${entityKey}`, `${moduleId}.${entityKey}.insights`],
    };
  }

  async executeUpdate(moduleId: string, entityKey: string, entity: EntityDefinition, params: Record<string, unknown>, user: AuthenticatedUser) {
    const { id, ...rest } = params;
    const values = resolveWritableValues(entity, rest);
    const row = await this.entityRepository.update(moduleId, entityKey, user.tenantId, user.id, String(id), values);
    return {
      module: moduleId,
      entity: entityKey,
      operation: 'update',
      rows: [row],
      invalidates: [`${moduleId}.${entityKey}`, `${moduleId}.${entityKey}.insights`],
    };
  }

  async executeTransition(moduleId: string, entityKey: string, entity: EntityDefinition, params: Record<string, unknown>, user: AuthenticatedUser, to: import('@prisma/client').RecordStatus) {
    if (!to) throw new BadRequestException('Missing target status "to"');
    await this.assertPermission(user, permissionForTransition(moduleId, entityKey, to));
    const row = await this.entityRepository.transition(moduleId, entityKey, user.tenantId, user.id, String(params.id), to);
    const label = entity.label ?? entityKey;
    const messages: Partial<Record<string, string>> = {
      approved: `Marked "${row.title ?? label}" as complete.`,
      cancelled: `Cancelled "${row.title ?? label}".`,
      deleted: `Deleted "${row.title ?? label}".`,
    };
    return {
      module: moduleId,
      entity: entityKey,
      operation: 'transition',
      rows: [row],
      message: messages[to] ?? `Updated ${label} status to "${to}".`,
      invalidates: [`${moduleId}.${entityKey}`, `${moduleId}.${entityKey}.insights`],
    };
  }

}
