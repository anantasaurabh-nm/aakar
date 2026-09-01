import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { SDUI_SCHEMA_VERSION } from '@erp/shared-contracts';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../core/auth/authenticated-user.interface';
import { PermissionsGuard } from '../../core/rbac/permissions.guard';
import { RequirePermissions } from '../../core/rbac/require-permissions.decorator';
import { PermissionsService } from '../../core/rbac/permissions.service';
import { PermissionCatalogService } from '../../core/rbac/permission-catalog.service';
import { AuditService } from '../../core/audit/audit.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RoleAdminService } from './domain/role-admin.service';

const CreateRoleSchema = z.object({
  key: z.string().min(2).max(40),
  name: z.string().min(2).max(60),
  description: z.string().max(250).optional(),
});

const UpdateRoleSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(250).optional(),
});

const UpdateRolePermissionsSchema = z
  .object({
    role: z.string().min(1),
    module: z.string().min(1),
  })
  .passthrough();

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserRolesController {
  constructor(
    private readonly roleAdminService: RoleAdminService,
    private readonly permissionsService: PermissionsService,
    private readonly permissionCatalog: PermissionCatalogService,
    private readonly audit: AuditService,
  ) {}

  @Get('ui/pages/admin/user-roles')
  @RequirePermissions('user.read')
  async getPage(@CurrentUser() user: AuthenticatedUser) {
    const canWrite = ['SUPER_ADMIN', 'TENANT_ADMIN'].includes(user.role);

    const toolbar: Record<string, unknown>[] = [];
    if (canWrite) {
      toolbar.push({
        id: 'new',
        type: 'action',
        label: 'New Role',
        action: { type: 'create', target: 'user-roles.role.form' },
      });
    }
    toolbar.push(
      { id: 'search', type: 'search' },
      { id: 'columns', type: 'columns' },
      { id: 'refresh', type: 'action', label: 'Refresh', action: { type: 'refresh' } },
    );

    const [allRoles, availableModules, rolePermsMap] = await Promise.all([
      this.roleAdminService.list(),
      this.permissionCatalog.getAvailableModulePermissions(),
      this.permissionsService.getRolePermissionsMap(),
    ]);

    const permissionTabs = allRoles.map((role) => {
      const grantedSet = new Set(rolePermsMap[role.key as never] ?? []);
      const groups = availableModules.map((mod) => {
        const modPermissions = mod.permissions;
        const grantedInMod = modPermissions.filter((p) => grantedSet.has(p.id)).length;

        const fields: Record<string, unknown>[] = [
          { name: 'role', label: 'Role', type: 'hidden', defaultValue: role.key },
          { name: 'module', label: 'Module', type: 'hidden', defaultValue: mod.moduleId },
        ];

        for (const p of modPermissions) {
          fields.push({
            name: p.id,
            label: `${p.label} (${p.id})`,
            type: 'switch',
            required: false,
            defaultValue: grantedSet.has(p.id),
          });
        }

        return {
          id: `${role.key}-${mod.moduleId}`,
          label: mod.moduleName,
          subtitle: `${grantedInMod} of ${modPermissions.length} granted · ${mod.description ?? ''}`,
          badge: `${grantedInMod}/${modPermissions.length}`,
          fields,
          submitAction: { type: 'submit', target: 'role.permissions.update' },
        };
      });

      return {
        id: role.key,
        label: role.name,
        badge: `${role.permissionsCount} perms`,
        groups,
      };
    });

    return {
      schema: SDUI_SCHEMA_VERSION,
      brand: { name: 'Roles & Permissions', icon: 'shield' },
      navigation: {
        items: [
          { id: 'insights', label: 'Insights', action: { type: 'navigate', target: 'roles-insights' } },
          { id: 'roles', label: 'Roles Directory', action: { type: 'navigate', target: 'roles-table' } },
          { id: 'matrix', label: 'Permission Matrix', action: { type: 'navigate', target: 'permissions-matrix' } },
        ],
      },
      page: {
        id: 'user-roles',
        title: 'Platform Roles & Permissions',
        sections: [
          {
            id: 'roles-insights',
            label: 'Role Insights',
            type: 'dashboard',
            toolbar: [
              { id: 'refresh', type: 'action', label: 'Refresh', action: { type: 'refresh' } },
            ],
            data: { source: 'roles.insights' },
            config: { cards: [], charts: [] },
          },
          {
            id: 'roles-table',
            label: 'Roles Directory',
            type: 'table',
            toolbar,
            data: { source: 'user-roles.role' },
            config: {
              columns: [
                { key: 'name', label: 'Role Name', type: 'text', sortable: true },
                { key: 'key', label: 'Role Code', type: 'badge', sortable: true },
                { key: 'isSystem', label: 'Type', type: 'badge', sortable: true },
                { key: 'permissionsCount', label: 'Active Permissions', type: 'badge', sortable: true },
                { key: 'usersCount', label: 'Assigned Users', type: 'badge', sortable: true },
                { key: 'description', label: 'Description', type: 'text', sortable: false },
              ],
              selectable: true,
              pageSize: 10,
              density: 'comfortable',
              detailView: true,
            },
          },
          {
            id: 'permissions-matrix',
            label: 'Roles & Permissions Matrix',
            type: 'settings',
            toolbar: [],
            config: {
              tabs: permissionTabs,
            },
          },
        ],
      },
    };
  }

  @Get('ui/views/user-roles/role-form')
  @RequirePermissions('user.read')
  async getRoleForm(@Query('id') id?: string) {
    const existing = id ? await this.roleAdminService.getById(id) : null;
    const [availableModules, rolePermsMap] = await Promise.all([
      this.permissionCatalog.getAvailableModulePermissions(),
      this.permissionsService.getRolePermissionsMap(),
    ]);

    const targetRoleKey = existing?.key ?? '';
    const grantedSet = new Set(targetRoleKey ? (rolePermsMap[targetRoleKey] ?? []) : []);

    const permissionModules = availableModules.map((mod) => ({
      moduleId: mod.moduleId,
      moduleName: mod.moduleName,
      description: mod.description,
      permissions: mod.permissions.map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        granted: grantedSet.has(p.id),
      })),
    }));

    return {
      id: 'role-form',
      label: existing ? `Edit Role (${existing.name})` : 'New Role',
      type: 'form',
      toolbar: [
        { id: 'cancel', type: 'action', label: 'Cancel', action: { type: 'cancel' } },
        { id: 'save', type: 'action', label: 'Save', action: { type: 'submit' } },
      ],
      config: {
        fields: [
          { name: 'id', label: 'id', type: 'hidden', required: false, defaultValue: existing?.id },
          {
            name: 'key',
            label: 'Role Code (e.g. ACCOUNTANT, SALES_LEAD)',
            type: 'text',
            required: !existing,
            defaultValue: existing?.key ?? '',
          },
          {
            name: 'name',
            label: 'Role Display Name',
            type: 'text',
            required: true,
            defaultValue: existing?.name ?? '',
          },
          {
            name: 'description',
            label: 'Description & Scope',
            type: 'textarea',
            required: false,
            defaultValue: existing?.description ?? '',
          },
        ],
        submitAction: { type: 'submit', target: existing ? 'role.update' : 'role.create' },
      },
      record: existing,
      permissionModules: existing ? permissionModules : undefined,
    };
  }

  @Get('data/roles')
  @RequirePermissions('user.read')
  list() {
    return this.roleAdminService.list();
  }

  @Get('data/roles-insights')
  @RequirePermissions('user.read')
  insights() {
    return this.roleAdminService.insights();
  }

  @Post('actions/roles')
  @RequirePermissions('user.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateRoleSchema)) body: z.infer<typeof CreateRoleSchema>,
  ) {
    return this.roleAdminService.create(user.tenantId, user.id, body);
  }

  @Patch('actions/roles/:id')
  @RequirePermissions('user.update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateRoleSchema)) body: z.infer<typeof UpdateRoleSchema>,
  ) {
    return this.roleAdminService.update(user.tenantId, user.id, id, body);
  }

  @Delete('actions/roles/:id')
  @RequirePermissions('user.delete')
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.roleAdminService.delete(user.tenantId, user.id, id);
  }

  @Put('actions/role-permissions')
  @RequirePermissions('user.update')
  async updateRolePermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(UpdateRolePermissionsSchema)) body: Record<string, unknown>,
  ) {
    const role = String(body.role);
    const moduleId = String(body.module);

    if (role === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only Super Admins can modify Super Admin permissions');
    }

    const availableModules = this.permissionCatalog.getAvailableModulePermissions();
    const targetModule = availableModules.find((m) => m.moduleId === moduleId);
    if (!targetModule) {
      throw new BadRequestException(`Unknown module "${moduleId}"`);
    }

    const permissionsDelta: Record<string, boolean> = {};
    for (const perm of targetModule.permissions) {
      if (perm.id in body) {
        permissionsDelta[perm.id] = Boolean(body[perm.id]);
      }
    }

    const result = await this.permissionsService.updateRolePermissions(role as never, permissionsDelta);

    await this.audit.record({
      tenantId: user.tenantId,
      entity: 'role-permissions',
      recordId: `${role}:${moduleId}`,
      action: 'updated',
      performedBy: user.id,
      metadata: { role, module: moduleId, permissions: permissionsDelta },
    });

    return {
      ok: true,
      role: result.role,
      module: moduleId,
      updatedCount: result.updatedCount,
    };
  }
}
