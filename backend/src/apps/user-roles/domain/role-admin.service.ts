import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';
import { PermissionsService } from '../../../core/rbac/permissions.service';
import { PermissionCatalogService } from '../../../core/rbac/permission-catalog.service';
import { CapabilityRegistry } from '../../../core/capabilities/capability-registry.service';

export interface CreateRoleInput {
  key: string;
  name: string;
  description?: string;
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
}

const DEFAULT_SYSTEM_ROLES = [
  { key: 'SUPER_ADMIN', name: 'Super Admin', description: 'Full system and platform administration access', isSystem: true },
  { key: 'TENANT_ADMIN', name: 'Tenant Admin', description: 'Workspace administrator with full tenant control', isSystem: true },
  { key: 'MANAGER', name: 'Manager', description: 'Operational team lead with approvals and management access', isSystem: true },
  { key: 'STAFF', name: 'Staff', description: 'Standard operational team member', isSystem: true },
  { key: 'VIEWER', name: 'Viewer', description: 'Read-only access across enabled modules', isSystem: true },
];

@Injectable()
export class RoleAdminService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissionsService: PermissionsService,
    private readonly permissionCatalog: PermissionCatalogService,
    private readonly capabilityRegistry: CapabilityRegistry,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultRoles();

    this.capabilityRegistry.register(
      {
        id: 'user-roles.role.list',
        module: 'user-roles',
        entity: 'role',
        requiredPermission: 'user.read',
        description: 'List platform roles, custom roles, assigned users count, and permission grants',
      },
      async () => {
        const roles = await this.list();
        return {
          module: 'user-roles',
          entity: 'role',
          operation: 'list',
          rows: roles as unknown as Record<string, unknown>[],
          total: roles.length,
        };
      },
    );

    this.capabilityRegistry.register(
      {
        id: 'user-roles.role.insights',
        module: 'user-roles',
        entity: 'role',
        requiredPermission: 'user.read',
        description: 'Get role statistics, system vs custom role counts, and capability distributions',
      },
      async () => {
        const insights = await this.insights();
        return {
          module: 'user-roles',
          entity: 'role',
          operation: 'insights',
          rows: [insights as unknown as Record<string, unknown>],
        };
      },
    );

    this.capabilityRegistry.register(
      {
        id: 'user-roles.role.create',
        module: 'user-roles',
        entity: 'role',
        requiredPermission: 'user.create',
        description: 'Create a new custom platform role or open the role creation form',
      },
      async (params, ctx) => {
        const roleTitle = params.title || params.name;
        if (roleTitle) {
          const name = String(roleTitle);
          const key = name.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
          const created = await this.create(ctx.user.tenantId, ctx.user.id, {
            name,
            key,
            description: `Custom ${name} role`,
          });
          return {
            module: 'user-roles',
            entity: 'role',
            operation: 'create',
            rows: [created as unknown as Record<string, unknown>],
            message: `Created new role "${name}".`,
          };
        }
        return {
          module: 'user-roles',
          entity: 'role',
          operation: 'create',
          rows: [],
          message: 'Opening new role form.',
        };
      },
    );
  }

  async ensureDefaultRoles() {
    for (const role of DEFAULT_SYSTEM_ROLES) {
      await this.prisma.roleDefinition.upsert({
        where: { key: role.key },
        create: {
          id: role.key.toLowerCase(),
          key: role.key,
          name: role.name,
          description: role.description,
          isSystem: true,
        },
        update: {
          name: role.name,
          isSystem: true,
        },
      });
    }
  }

  async list() {
    await this.ensureDefaultRoles();
    const [roles, rolePerms, userCounts] = await Promise.all([
      this.prisma.roleDefinition.findMany({ orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] }),
      this.prisma.rolePermission.findMany({ select: { role: true, permission: true } }),
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    ]);

    const permsCountByRole: Record<string, number> = {};
    for (const row of rolePerms) {
      permsCountByRole[row.role] = (permsCountByRole[row.role] ?? 0) + 1;
    }

    const usersCountByRole: Record<string, number> = {};
    for (const row of userCounts) {
      usersCountByRole[row.role] = row._count._all;
    }

    return roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description ?? '',
      isSystem: r.isSystem,
      permissionsCount: permsCountByRole[r.key] ?? 0,
      usersCount: usersCountByRole[r.key] ?? 0,
      created_at: r.createdAt.toISOString(),
      updated_at: r.updatedAt.toISOString(),
    }));
  }

  async getById(id: string) {
    const role = await this.prisma.roleDefinition.findFirst({
      where: { OR: [{ id }, { key: id }] },
    });
    if (!role) throw new NotFoundException(`Role "${id}" not found`);

    const perms = await this.prisma.rolePermission.count({ where: { role: role.key } });
    const users = await this.prisma.user.count({ where: { role: role.key } });

    return {
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description ?? '',
      isSystem: role.isSystem,
      permissionsCount: perms,
      usersCount: users,
      created_at: role.createdAt.toISOString(),
      updated_at: role.updatedAt.toISOString(),
    };
  }

  async create(tenantId: string, performedBy: string, input: CreateRoleInput) {
    const normalizedKey = input.key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (!normalizedKey || normalizedKey.length < 2) {
      throw new BadRequestException('Role key must be at least 2 alphanumeric characters');
    }

    const existing = await this.prisma.roleDefinition.findUnique({ where: { key: normalizedKey } });
    if (existing) throw new ConflictException(`Role with code "${normalizedKey}" already exists`);

    const role = await this.prisma.roleDefinition.create({
      data: {
        key: normalizedKey,
        name: input.name.trim(),
        description: input.description?.trim(),
        isSystem: false,
      },
    });

    await this.audit.record({
      tenantId,
      entity: 'user-roles.role',
      recordId: role.id,
      action: 'created',
      performedBy,
    });

    return this.getById(role.id);
  }

  async update(tenantId: string, performedBy: string, id: string, input: UpdateRoleInput) {
    const existing = await this.prisma.roleDefinition.findFirst({
      where: { OR: [{ id }, { key: id }] },
    });
    if (!existing) throw new NotFoundException('Role not found');

    const updated = await this.prisma.roleDefinition.update({
      where: { id: existing.id },
      data: {
        name: input.name ? input.name.trim() : existing.name,
        description: input.description !== undefined ? input.description.trim() : existing.description,
      },
    });

    await this.audit.record({
      tenantId,
      entity: 'user-roles.role',
      recordId: updated.id,
      action: 'updated',
      performedBy,
    });

    return this.getById(updated.id);
  }

  async delete(tenantId: string, performedBy: string, id: string) {
    const existing = await this.prisma.roleDefinition.findFirst({
      where: { OR: [{ id }, { key: id }] },
    });
    if (!existing) throw new NotFoundException('Role not found');
    if (existing.isSystem) {
      throw new BadRequestException('Built-in system roles cannot be deleted');
    }

    const assignedUsers = await this.prisma.user.count({ where: { role: existing.key } });
    if (assignedUsers > 0) {
      throw new BadRequestException(`Cannot delete role "${existing.name}": it is currently assigned to ${assignedUsers} user(s)`);
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role: existing.key } }),
      this.prisma.roleDefinition.delete({ where: { id: existing.id } }),
    ]);

    this.permissionsService.invalidateCache();

    await this.audit.record({
      tenantId,
      entity: 'user-roles.role',
      recordId: existing.id,
      action: 'deleted',
      performedBy,
    });

    return { ok: true, id: existing.id, key: existing.key };
  }

  async insights() {
    await this.ensureDefaultRoles();
    const allPermissions = this.permissionCatalog.getAllPermissionIds();
    const [roles, rolePerms, userCounts] = await Promise.all([
      this.prisma.roleDefinition.findMany(),
      this.prisma.rolePermission.findMany({ select: { role: true } }),
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    ]);

    const systemRolesCount = roles.filter((r) => r.isSystem).length;
    const customRolesCount = roles.filter((r) => !r.isSystem).length;

    const permsCountByRole: Record<string, number> = {};
    for (const r of roles) permsCountByRole[r.key] = 0;
    for (const row of rolePerms) {
      permsCountByRole[row.role] = (permsCountByRole[row.role] ?? 0) + 1;
    }

    return {
      cards: [
        { id: 'total-roles', label: 'Total Roles', value: roles.length, accent: 'indigo' },
        { id: 'system-roles', label: 'System Roles', value: systemRolesCount, accent: 'cyan' },
        { id: 'custom-roles', label: 'Custom Roles', value: customRolesCount, accent: 'emerald' },
        { id: 'total-perms', label: 'Platform Capabilities', value: allPermissions.length, accent: 'amber' },
      ],
      charts: [
        {
          id: 'perms-by-role',
          title: 'Permission Grants by Role',
          type: 'donut',
          series: Object.entries(permsCountByRole).map(([role, count]) => ({
            id: role,
            label: role,
            points: [{ x: role, y: count }],
          })),
        },
        {
          id: 'users-by-role',
          title: 'Users Assigned per Role',
          type: 'donut',
          series: userCounts.map((u) => ({
            id: u.role,
            label: u.role,
            points: [{ x: u.role, y: u._count._all }],
          })),
        },
      ],
    };
  }
}
