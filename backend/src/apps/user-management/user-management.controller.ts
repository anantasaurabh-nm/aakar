import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../core/prisma/prisma.service';
import { UserAdminService } from './domain/user-admin.service';

const ListQuerySchema = z.object({
  role: z.string().optional(),
  isActive: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === true || val === 'true')),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

const CreateUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(40),
  password: z.string().min(8),
  role: z.string().min(1),
});

const UpdateUserSchema = z.object({
  role: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  avatarUrl: z.string().url().optional(),
});

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserManagementController {
  constructor(
    private readonly userAdminService: UserAdminService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('ui/pages/admin/user-management')
  @RequirePermissions('user.read')
  async getPage(@CurrentUser() user: AuthenticatedUser) {
    const canWrite = ['SUPER_ADMIN', 'TENANT_ADMIN'].includes(user.role);

    const roles = await this.prisma.roleDefinition.findMany({ orderBy: { name: 'asc' } });
    const roleOptions = roles.map((r) => ({ label: r.name, value: r.key }));

    const toolbar: Record<string, unknown>[] = [];
    if (canWrite) {
      toolbar.push({
        id: 'new',
        type: 'action',
        label: 'New User',
        action: { type: 'create', target: 'user-management.user.form' },
      });
    }
    toolbar.push(
      { id: 'search', type: 'search' },
      {
        id: 'role',
        type: 'filter',
        field: 'role',
        options: roleOptions,
      },
      {
        id: 'isActive',
        type: 'filter',
        field: 'isActive',
        options: [
          { label: 'Active', value: 'true' },
          { label: 'Inactive', value: 'false' },
        ],
      },
      { id: 'columns', type: 'columns' },
      { id: 'refresh', type: 'action', label: 'Refresh', action: { type: 'refresh' } },
    );

    return {
      schema: SDUI_SCHEMA_VERSION,
      brand: { name: 'User Management', icon: 'users' },
      navigation: {
        items: [
          { id: 'insights', label: 'Insights', action: { type: 'navigate', target: 'user-insights' } },
          { id: 'users', label: 'Users Directory', action: { type: 'navigate', target: 'users-table' } },
        ],
      },
      page: {
        id: 'user-management',
        title: 'User Management',
        sections: [
          {
            id: 'user-insights',
            label: 'User Insights',
            type: 'dashboard',
            toolbar: [
              { id: 'refresh', type: 'action', label: 'Refresh', action: { type: 'refresh' } },
            ],
            data: { source: 'users.insights' },
            config: { cards: [], charts: [] },
          },
          {
            id: 'users-table',
            label: 'Users Directory',
            type: 'table',
            toolbar,
            data: { source: 'user-management.user' },
            config: {
              columns: [
                { key: 'username', label: 'Username', type: 'text', sortable: true },
                { key: 'email', label: 'Email', type: 'text', sortable: true },
                { key: 'role', label: 'Role', type: 'badge', sortable: true },
                { key: 'isActive', label: 'Active', type: 'boolean', sortable: true },
                { key: 'lastLoginAt', label: 'Last Login', type: 'datetime', sortable: true },
                { key: 'created_at', label: 'Joined', type: 'datetime', sortable: true },
              ],
              selectable: true,
              pageSize: 50,
              density: 'comfortable',
              detailView: true,
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
    const roles = await this.prisma.roleDefinition.findMany({ orderBy: { name: 'asc' } });
    const roleOptions = roles.map((r) => ({ label: r.name, value: r.key }));

    return {
      id: 'user-form',
      label: existing ? `Edit User (${existing.username})` : 'New User',
      type: 'form',
      toolbar: [
        { id: 'cancel', type: 'action', label: 'Cancel', action: { type: 'cancel' } },
        { id: 'save', type: 'action', label: 'Save', action: { type: 'submit' } },
      ],
      config: {
        fields: [
          { name: 'id', label: 'id', type: 'hidden', required: false, defaultValue: existing?.id },
          { name: 'email', label: 'Email Address', type: 'text', required: !existing, defaultValue: existing?.email ?? '' },
          { name: 'username', label: 'Username', type: 'text', required: !existing, defaultValue: existing?.username ?? '' },
          ...(existing
            ? []
            : [{ name: 'password', label: 'Password (min 8 characters)', type: 'password' as const, required: true }]),
          {
            name: 'role',
            label: 'Platform Role',
            type: 'select',
            required: true,
            defaultValue: existing?.role ?? 'STAFF',
            options: roleOptions,
          },
          ...(existing
            ? [{ name: 'isActive', label: 'Active Account', type: 'switch' as const, required: false, defaultValue: existing.isActive }]
            : []),
        ],
        submitAction: { type: 'submit', target: existing ? 'user.update' : 'user.create' },
      },
      record: existing,
    };
  }

  @Get('data/users')
  @RequirePermissions('user.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListQuerySchema)) query: z.infer<typeof ListQuerySchema>,
  ) {
    return this.userAdminService.list(user.tenantId, query as never);
  }

  // Collision-free 2-segment path for core user insights
  @Get('data/users-insights')
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
    return this.userAdminService.create(user.tenantId, user.id, body as never);
  }

  @Patch('actions/users/:id')
  @RequirePermissions('user.update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUserSchema)) body: z.infer<typeof UpdateUserSchema>,
  ) {
    return this.userAdminService.update(user.tenantId, user.id, id, body as never);
  }

  @Delete('actions/users/:id')
  @RequirePermissions('user.delete')
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.userAdminService.deactivate(user.tenantId, user.id, id);
  }
}
