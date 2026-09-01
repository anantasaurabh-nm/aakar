import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SDUI_SCHEMA_VERSION } from '@erp/shared-contracts';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../core/auth/authenticated-user.interface';
import { PermissionsGuard } from '../../core/rbac/permissions.guard';
import { RequirePermissions } from '../../core/rbac/require-permissions.decorator';
import { ModuleRegistryService } from '../../core/modules-registry/module-registry.service';
import { ModuleDiscoveryService } from '../../core/modules-registry/module-discovery.service';
import { SYSTEM_MODULE_IDS } from '../../core/modules-registry/module-manifests';
import { AuditService } from '../../core/audit/audit.service';
import { EntityRegistryService } from '../../core/entity-engine/entity-registry.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ModuleManagementController {
  constructor(
    private readonly moduleRegistry: ModuleRegistryService,
    private readonly discovery: ModuleDiscoveryService,
    private readonly entityRegistry: EntityRegistryService,
    private readonly audit: AuditService,
  ) {}

  @Get('ui/pages/admin/module-management')
  @RequirePermissions('module.read')
  getPage(@CurrentUser() user: AuthenticatedUser) {
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    return {
      schema: SDUI_SCHEMA_VERSION,
      brand: { name: 'Module Management', icon: 'modules' },
      navigation: { items: [] },
      page: {
        id: 'module-management',
        title: 'Module Management',
        sections: [
          {
            id: 'modules-table',
            label: 'Installed Modules',
            type: 'table',
            toolbar: [
              { id: 'discover', type: 'action', label: 'Discover', action: { type: 'submit', target: 'module.discover' } },
              { id: 'refresh', type: 'action', label: 'Refresh', action: { type: 'refresh' } },
            ],
            data: { source: 'modules' },
            config: {
              columns: [
                { key: 'name', label: 'Module', type: 'text', sortable: true },
                { key: 'type', label: 'Type', type: 'badge', sortable: true },
                { key: 'version', label: 'Version', type: 'text', sortable: false },
                { key: 'surfaces', label: 'Surfaces', type: 'tags', sortable: false },
                { key: 'status', label: 'Status', type: 'badge', sortable: true },
              ],
              selectable: false,
              pageSize: 50,
              density: 'comfortable',
              rowActions: [
                ...(isSuperAdmin
                  ? [{ id: 'install', label: 'Install', action: { type: 'submit', target: 'module.install' } }]
                  : []),
                { id: 'toggle', label: 'Enable/Disable', action: { type: 'submit', target: 'module.toggle' } },
              ],
            },
          },
        ],
      },
    };
  }

  @Get('data/modules')
  @RequirePermissions('module.read')
  async list(@Query('search') search?: string) {
    const rows = await this.moduleRegistry.listAll(search);
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        version: r.version,
        surfaces: r.surfaces,
        status: SYSTEM_MODULE_IDS.has(r.id) ? 'system' : r.status,
        isSystem: SYSTEM_MODULE_IDS.has(r.id),
      })),
      page: 1,
      pageSize: rows.length,
      total: rows.length,
    };
  }

  @Post('actions/modules/discover')
  @RequirePermissions('module.manage')
  async discover(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.discovery.discover();
    for (const id of result.discovered) {
      await this.audit.record({
        tenantId: user.tenantId,
        entity: 'module-management.module',
        recordId: id,
        action: 'discovered',
        performedBy: user.id,
      });
    }
    return result;
  }

  @Post('actions/modules/:id/install')
  @RequirePermissions('module.install')
  async install(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const entry = await this.moduleRegistry.get(id);
    if (!entry || entry.status !== 'discovered') {
      throw new Error(`Module "${id}" is not in "discovered" state`);
    }
    await this.entityRegistry.install(id);
    const updated = await this.moduleRegistry.setStatus(id, 'installed');
    await this.audit.record({
      tenantId: user.tenantId,
      entity: 'module-management.module',
      recordId: id,
      action: 'installed',
      performedBy: user.id,
    });
    return { id: updated.id, status: updated.status };
  }

  @Post('actions/modules/:id/toggle')
  @RequirePermissions('module.manage')
  async toggle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (SYSTEM_MODULE_IDS.has(id)) {
      throw new Error(`System module "${id}" cannot be toggled`);
    }
    const current = await this.moduleRegistry.get(id);
    if (!current) throw new Error(`Module "${id}" not found`);

    const next = current.status === 'enabled' ? 'disabled' : 'enabled';
    const updated = await this.moduleRegistry.setStatus(id, next);

    await this.audit.record({
      tenantId: user.tenantId,
      entity: 'module-management.module',
      recordId: id,
      action: next === 'enabled' ? 'enabled' : 'disabled',
      performedBy: user.id,
    });
    return { id: updated.id, status: updated.status };
  }

  @Post('actions/modules/:id/uninstall')
  @RequirePermissions('module.install')
  async uninstall(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (SYSTEM_MODULE_IDS.has(id)) {
      throw new Error(`System module "${id}" cannot be uninstalled`);
    }
    const current = await this.moduleRegistry.get(id);
    if (!current) throw new Error(`Module "${id}" not found`);

    const updated = await this.moduleRegistry.setStatus(id, 'discovered');

    await this.audit.record({
      tenantId: user.tenantId,
      entity: 'module-management.module',
      recordId: id,
      action: 'uninstalled',
      performedBy: user.id,
    });
    return { id: updated.id, status: updated.status };
  }
}
