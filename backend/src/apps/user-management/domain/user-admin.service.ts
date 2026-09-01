import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';
import { PermissionCatalogService } from '../../../core/rbac/permission-catalog.service';
import { CapabilityRegistry } from '../../../core/capabilities/capability-registry.service';
import type { Role } from '../../../core/rbac/permission-catalog';

export interface UserListQuery {
  role?: Role;
  isActive?: boolean;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface CreateUserInput {
  email: string;
  username: string;
  password: string;
  role: Role;
}

export interface UpdateUserInput {
  role?: Role;
  isActive?: boolean;
  avatarUrl?: string;
}

function toApi(user: {
  id: string;
  email: string;
  username: string;
  role: Role;
  isActive: boolean;
  avatarUrl: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    avatarUrl: user.avatarUrl,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  };
}

const ALLOWED_SORT_COLUMNS = ['username', 'email', 'role', 'isActive', 'lastLoginAt', 'createdAt'];

@Injectable()
export class UserAdminService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissionCatalog: PermissionCatalogService,
    private readonly capabilityRegistry: CapabilityRegistry,
  ) {}

  onModuleInit() {
    this.capabilityRegistry.register(
      {
        id: 'user-management.user.list',
        module: 'user-management',
        entity: 'user',
        requiredPermission: 'user.read',
        description: 'List and search platform users by username, email, role, or active status',
      },
      async (params, ctx) => {
        const result = await this.list(ctx.user.tenantId, params as never);
        return {
          module: 'user-management',
          entity: 'user',
          operation: 'list',
          rows: result.items as unknown as Record<string, unknown>[],
          total: result.total,
          params,
        };
      },
    );

    this.capabilityRegistry.register(
      {
        id: 'user-management.user.insights',
        module: 'user-management',
        entity: 'user',
        requiredPermission: 'user.read',
        description: 'Get user statistics, total counts, active user metrics, and role distribution insights',
      },
      async (_params, ctx) => {
        const insights = await this.insights(ctx.user.tenantId);
        return {
          module: 'user-management',
          entity: 'user',
          operation: 'insights',
          rows: [insights as unknown as Record<string, unknown>],
        };
      },
    );

    this.capabilityRegistry.register(
      {
        id: 'user-management.user.create',
        module: 'user-management',
        entity: 'user',
        requiredPermission: 'user.create',
        description: 'Provision a new platform user account or open the user creation form',
      },
      async (params, ctx) => {
        if (params.username && params.email && params.password && params.role) {
          const created = await this.create(ctx.user.tenantId, ctx.user.id, {
            username: String(params.username),
            email: String(params.email),
            password: String(params.password),
            role: String(params.role) as never,
          });
          return {
            module: 'user-management',
            entity: 'user',
            operation: 'create',
            rows: [created as unknown as Record<string, unknown>],
            message: `Created user "${created.username}".`,
          };
        }
        return {
          module: 'user-management',
          entity: 'user',
          operation: 'create',
          rows: [],
          message: 'Opening new user form.',
        };
      },
    );
  }

  async list(tenantId: string, query: UserListQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 200) : 10;

    const where = {
      tenantId,
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' as const } },
              { username: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const sortBy = query.sortBy && ALLOWED_SORT_COLUMNS.includes(query.sortBy) ? query.sortBy : 'createdAt';
    const sortDir = query.sortDir === 'asc' ? 'asc' : 'desc';

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items: rows.map(toApi), page, pageSize, total };
  }

  async getById(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) throw new NotFoundException('User not found');
    return toApi(user);
  }

  async create(tenantId: string, performedBy: string, input: CreateUserInput) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: input.email }, { username: input.username }] },
    });
    if (existing) throw new ConflictException('Email or username already in use');
    if (input.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const passwordHash = await hash(input.password, 10);
    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: input.email,
        username: input.username,
        passwordHash,
        role: input.role,
      },
    });
    await this.audit.record({
      tenantId,
      entity: 'user-management.user',
      recordId: user.id,
      action: 'created',
      performedBy,
    });
    return toApi(user);
  }

  async update(tenantId: string, performedBy: string, id: string, patch: UpdateUserInput) {
    const existing = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('User not found');

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        role: patch.role,
        isActive: patch.isActive,
        avatarUrl: patch.avatarUrl,
      },
    });
    await this.audit.record({
      tenantId,
      entity: 'user-management.user',
      recordId: id,
      action: 'updated',
      performedBy,
    });
    return toApi(user);
  }

  async deactivate(tenantId: string, performedBy: string, id: string) {
    const existing = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('User not found');

    const user = await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    await this.audit.record({
      tenantId,
      entity: 'user-management.user',
      recordId: id,
      action: 'deactivated',
      performedBy,
    });
    return toApi(user);
  }

  async toggleStatus(tenantId: string, performedBy: string, id: string) {
    const existing = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('User not found');

    const nextStatus = !existing.isActive;
    const user = await this.prisma.user.update({ where: { id }, data: { isActive: nextStatus } });
    await this.audit.record({
      tenantId,
      entity: 'user-management.user',
      recordId: id,
      action: nextStatus ? 'activated' : 'deactivated',
      performedBy,
    });
    return toApi(user);
  }

  async insights(tenantId: string) {
    const allPermissions = this.permissionCatalog.getAllPermissionIds();
    const [total, active, byRole, roleDefinitions, rolePermRows] = await Promise.all([
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.user.count({ where: { tenantId, isActive: true } }),
      this.prisma.user.groupBy({ by: ['role'], where: { tenantId }, _count: { _all: true } }),
      this.prisma.roleDefinition.findMany({ select: { key: true, name: true } }),
      this.prisma.rolePermission.findMany({ select: { role: true, permission: true } }),
    ]);

    const permsByRoleCount: Record<string, number> = {};
    for (const r of roleDefinitions) permsByRoleCount[r.key] = 0;
    for (const row of rolePermRows) {
      permsByRoleCount[row.role] = (permsByRoleCount[row.role] ?? 0) + 1;
    }

    return {
      cards: [
        { id: 'total', label: 'Total Users', value: total, accent: 'indigo' },
        { id: 'active', label: 'Active Users', value: active, accent: 'emerald' },
        { id: 'roles', label: 'Platform Roles', value: roleDefinitions.length, accent: 'cyan' },
        { id: 'capabilities', label: 'Capabilities & Permissions', value: allPermissions.length, accent: 'amber' },
      ],
      charts: [
        {
          id: 'by-role',
          title: 'User Role Distribution',
          type: 'donut',
          series: byRole.map((row) => ({
            id: row.role,
            label: roleDefinitions.find((r) => r.key === row.role)?.name ?? row.role,
            points: [{ x: row.role, y: row._count._all }],
          })),
        },
        {
          id: 'permissions-by-role',
          title: 'Permission Grants by Role',
          type: 'donut',
          series: Object.entries(permsByRoleCount).map(([roleKey, count]) => ({
            id: roleKey,
            label: roleDefinitions.find((r) => r.key === roleKey)?.name ?? roleKey,
            points: [{ x: roleKey, y: count }],
          })),
        },
      ],
    };
  }
}
