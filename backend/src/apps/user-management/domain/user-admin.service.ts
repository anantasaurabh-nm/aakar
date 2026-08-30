import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import type { Role } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';

export interface UserListQuery {
  role?: Role;
  search?: string;
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

@Injectable()
export class UserAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, query: UserListQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 200) : 10;

    const where = {
      tenantId,
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' as const } },
              { username: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
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

  async insights(tenantId: string) {
    const [total, active, byRole] = await Promise.all([
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.user.count({ where: { tenantId, isActive: true } }),
      this.prisma.user.groupBy({ by: ['role'], where: { tenantId }, _count: { _all: true } }),
    ]);

    return {
      cards: [
        { id: 'total', label: 'Total Users', value: total, accent: 'indigo' },
        { id: 'active', label: 'Active', value: active, accent: 'emerald' },
      ],
      charts: [
        {
          id: 'by-role',
          title: 'User Role Distribution',
          type: 'donut',
          series: byRole.map((row) => ({
            id: row.role,
            label: row.role,
            points: [{ x: row.role, y: row._count._all }],
          })),
        },
      ],
    };
  }
}
