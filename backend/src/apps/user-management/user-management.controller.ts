import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SDUI_SCHEMA_VERSION } from '@erp/shared-contracts';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../core/auth/authenticated-user.interface';
import { PermissionsGuard } from '../../core/rbac/permissions.guard';
import { RequirePermissions } from '../../core/rbac/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UserAdminService } from './domain/user-admin.service';

const RoleEnum = z.enum(['SUPER_ADMIN', 'TENANT_ADMIN', 'MANAGER', 'STAFF', 'VIEWER']);

const ListQuerySchema = z.object({
  role: RoleEnum.optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

const CreateUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(40),
  password: z.string().min(8),
  role: RoleEnum,
});

const UpdateUserSchema = z.object({
  role: RoleEnum.optional(),
  isActive: z.boolean().optional(),
  avatarUrl: z.string().url().optional(),
});

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserManagementController {
  constructor(private readonly userAdminService: UserAdminService) {}

  @Get('ui/pages/admin/user-management')
  @RequirePermissions('user.read')
  getPage(@CurrentUser() user: AuthenticatedUser) {
    const canWrite = ['SUPER_ADMIN', 'TENANT_ADMIN'].includes(user.role);
    const rowActions = [{ id: 'edit', label: 'Edit', action: { type: 'edit', target: 'user.form' } }];
    if (canWrite) {
      rowActions.push({ id: 'delete', label: 'Deactivate', action: { type: 'delete', target: 'user.deactivate' } });
    }

    const toolbar: Record<string, unknown>[] = [];
    if (canWrite) {
      toolbar.push({ id: 'new', type: 'action', label: 'New User', action: { type: 'create', target: 'user.form' } });
    }
    toolbar.push(
      { id: 'search', type: 'search' },
      {
        id: 'role',
        type: 'filter',
        field: 'role',
        options: [
          { label: 'Super Admin', value: 'SUPER_ADMIN' },
          { label: 'Tenant Admin', value: 'TENANT_ADMIN' },
          { label: 'Manager', value: 'MANAGER' },
          { label: 'Staff', value: 'STAFF' },
          { label: 'Viewer', value: 'VIEWER' },
        ],
      },
      { id: 'columns', type: 'columns' },
    );

    return {
      schema: SDUI_SCHEMA_VERSION,
      brand: { name: 'User Management', icon: 'users' },
      navigation: {
        items: [{ id: 'users', label: 'Users', action: { type: 'navigate', target: 'users' } }],
      },
      page: {
        id: 'user-management',
        title: 'User Management',
        sections: [
          {
            id: 'user-insights',
            label: 'Insights',
            type: 'dashboard',
            toolbar: [],
            data: { source: 'users.insights' },
            config: { cards: [], charts: [] },
          },
          {
            id: 'users-table',
            label: 'Users Directory',
            type: 'table',
            toolbar,
            data: { source: 'users' },
            config: {
              columns: [
                { key: 'username', label: 'Username', type: 'text', sortable: true },
                { key: 'email', label: 'Email', type: 'text', sortable: true },
                { key: 'role', label: 'Role', type: 'badge', sortable: true },
                { key: 'isActive', label: 'Active', type: 'boolean', sortable: false },
                { key: 'lastLoginAt', label: 'Last Login', type: 'datetime', sortable: true },
              ],
              selectable: true,
              pageSize: 10,
              density: 'comfortable',
              rowActions,
            },
          },
        ],
      },
    };
  }

  @Get('ui/views/user-management/user-form')
  @RequirePermissions('user.read')
  async getUserForm(@CurrentUser() user: AuthenticatedUser, @Query('id') id?: string) {
    const existing = id ? await this.userAdminService.getById(user.tenantId, id) : null;
    return {
      id: 'user-form',
      label: existing ? 'Edit User' : 'New User',
      type: 'form',
      toolbar: [
        { id: 'cancel', type: 'action', label: 'Cancel', action: { type: 'cancel' } },
        { id: 'save', type: 'action', label: 'Save', action: { type: 'submit' } },
      ],
      config: {
        fields: [
          { name: 'id', label: 'id', type: 'hidden', required: false, defaultValue: existing?.id },
          { name: 'email', label: 'Email', type: 'text', required: !existing, defaultValue: existing?.email ?? '' },
          { name: 'username', label: 'Username', type: 'text', required: !existing, defaultValue: existing?.username ?? '' },
          ...(existing
            ? []
            : [{ name: 'password', label: 'Password', type: 'text' as const, required: true }]),
          {
            name: 'role',
            label: 'Role',
            type: 'select',
            required: true,
            defaultValue: existing?.role ?? 'STAFF',
            options: [
              { label: 'Super Admin', value: 'SUPER_ADMIN' },
              { label: 'Tenant Admin', value: 'TENANT_ADMIN' },
              { label: 'Manager', value: 'MANAGER' },
              { label: 'Staff', value: 'STAFF' },
              { label: 'Viewer', value: 'VIEWER' },
            ],
          },
          ...(existing
            ? [{ name: 'isActive', label: 'Active', type: 'switch' as const, required: false, defaultValue: existing.isActive }]
            : []),
        ],
        submitAction: { type: 'submit', target: existing ? 'user.update' : 'user.create' },
      },
    };
  }

  @Get('data/users')
  @RequirePermissions('user.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListQuerySchema)) query: z.infer<typeof ListQuerySchema>,
  ) {
    return this.userAdminService.list(user.tenantId, query);
  }

  @Get('data/users/insights')
  @RequirePermissions('user.read')
  insights(@CurrentUser() user: AuthenticatedUser) {
    return this.userAdminService.insights(user.tenantId);
  }

  @Post('actions/users')
  @RequirePermissions('user.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateUserSchema)) body: z.infer<typeof CreateUserSchema>,
  ) {
    return this.userAdminService.create(user.tenantId, user.id, body);
  }

  @Patch('actions/users/:id')
  @RequirePermissions('user.update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUserSchema)) body: z.infer<typeof UpdateUserSchema>,
  ) {
    return this.userAdminService.update(user.tenantId, user.id, id, body);
  }

  @Delete('actions/users/:id')
  @RequirePermissions('user.delete')
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.userAdminService.deactivate(user.tenantId, user.id, id);
  }
}
