import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { EntityDefinition } from '@erp/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../rbac/permissions.service';
import { ModuleRegistryService } from '../modules-registry/module-registry.service';
import { CapabilityRegistry } from '../capabilities/capability-registry.service';
import { EntityTableService } from './entity-table.service';
import { EntityRepositoryService } from './entity-repository.service';
import { discoverModulesOnDisk, loadModuleOnDisk } from './module-schema-loader';
import { permissionForTransition } from './permission.util';
import { resolveRecordDateRange } from '../common/record-date.util';
import { firstSelectField } from './table-section.builder';
import { resolveCreateValues, resolveWritableValues } from './entity-value-resolver';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';

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
  ) {}

  async onModuleInit() {
    const discovered = discoverModulesOnDisk();
    let count = 0;
    for (const { manifest, schema } of discovered) {
      if (!schema) continue; // Level 0 manifest-only module — nothing for the entity engine to do

      const registryRow = await this.moduleRegistry.get(manifest.id);
      if (!registryRow || registryRow.status === 'discovered') continue; // must be explicitly Installed first

      for (const [entityKey, entity] of Object.entries(schema.entities)) {
        await this.registerEntity(manifest.id, entityKey, entity);
        count++;
      }
    }
    if (count > 0) this.logger.log(`Registered ${count} schema-driven entities`);
  }

  /** Called by the Module Management "Install" action for a module in `discovered` status. */
  async install(moduleId: string): Promise<void> {
    const found = loadModuleOnDisk(moduleId);
    if (!found) throw new NotFoundException(`Module "${moduleId}" not found on disk`);
    if (!found.schema) return; // Level 0 manifest-only module — nothing to install

    for (const [entityKey, entity] of Object.entries(found.schema.entities)) {
      await this.registerEntity(moduleId, entityKey, entity);
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
  }

  private async assertPermission(user: AuthenticatedUser, permission: string) {
    const allowed = await this.permissionsService.hasPermission(user.role, permission);
    if (!allowed) throw new ForbiddenException(`Missing required permission: ${permission}`);
  }

  // --- capability handlers, also reused directly by EntityEngineController ---

  async executeList(moduleId: string, entityKey: string, entity: EntityDefinition, params: Record<string, unknown>, user: AuthenticatedUser) {
    const page = await this.entityRepository.list(moduleId, entityKey, entity, user.tenantId, params as never);
    return { module: moduleId, entity: entityKey, operation: 'list', rows: page.items, total: page.total };
  }

  async executeGet(moduleId: string, entityKey: string, params: Record<string, unknown>, user: AuthenticatedUser) {
    const row = await this.entityRepository.getById(moduleId, entityKey, user.tenantId, String(params.id));
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
