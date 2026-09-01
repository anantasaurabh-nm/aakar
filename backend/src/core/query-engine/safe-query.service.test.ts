import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { SafeQueryService } from './safe-query.service';
import type { StructuredQuery } from '@erp/shared-contracts';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';

describe('SafeQueryService', () => {
  let service: SafeQueryService;
  let mockPrisma: any;
  let mockPermissions: any;
  let mockModuleRegistry: any;

  const mockUser: AuthenticatedUser = {
    id: 'usr-1',
    tenantId: 'tenant-1',
    username: 'manager',
    role: 'MANAGER',
    email: 'manager@test.com',
  };

  const sampleCrossQuery: StructuredQuery = {
    title: 'Users with Pending Tasks',
    primaryEntity: { module: 'user-management', entity: 'user', alias: 'user' },
    joins: [
      {
        module: 'todo',
        entity: 'task',
        alias: 'task',
        type: 'INNER',
        on: { left: 'user.id', right: 'task.created_by' },
        where: [{ field: 'task.record_status', operator: 'neq', value: 'approved' }],
      },
    ],
    select: [
      { field: 'user.username', label: 'User' },
      { field: 'user.email', label: 'Email' },
      { field: 'task.id', label: 'Pending Tasks', aggregate: 'COUNT' },
    ],
    where: [],
    groupBy: ['user.id', 'user.username', 'user.email'],
    orderBy: [{ field: 'Pending_Tasks', direction: 'desc' }],
    limit: 10,
  };

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        { user: 'alice', email: 'alice@test.com', pending_tasks: BigInt(5) },
        { user: 'bob', email: 'bob@test.com', pending_tasks: BigInt(2) },
      ]),
    };

    mockPermissions = {
      hasPermission: vi.fn().mockResolvedValue(true),
    };

    mockModuleRegistry = {
      isEnabled: vi.fn().mockResolvedValue(true),
    };

    const mockAiLogger = { logStep: vi.fn() };
    service = new SafeQueryService(mockPrisma, mockPermissions, mockModuleRegistry, mockAiLogger as any);
  });

  it('successfully validates permissions when user has access to all joined tables', async () => {
    await expect(service.validatePermissions(sampleCrossQuery, mockUser)).resolves.not.toThrow();
    expect(mockPermissions.hasPermission).toHaveBeenCalledWith('MANAGER', 'user.read');
    expect(mockPermissions.hasPermission).toHaveBeenCalledWith('MANAGER', 'todo.task.read');
  });

  it('rejects with ForbiddenException if user lacks permission to any joined table', async () => {
    mockPermissions.hasPermission.mockImplementation(async (_role: string, perm: string) => {
      if (perm === 'todo.task.read') return false;
      return true;
    });

    await expect(service.validatePermissions(sampleCrossQuery, mockUser)).rejects.toThrow(ForbiddenException);
  });

  it('rejects with ForbiddenException if a referenced module is disabled', async () => {
    mockModuleRegistry.isEnabled.mockImplementation(async (mod: string) => {
      if (mod === 'todo') return false;
      return true;
    });

    await expect(service.validatePermissions(sampleCrossQuery, mockUser)).rejects.toThrow(ForbiddenException);
  });

  it('compiles and executes SQL, converting BigInt values to standard Numbers', async () => {
    const result = await service.execute(sampleCrossQuery, mockUser);
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    expect(result.operation).toBe('query');
    expect(result.rows).toHaveLength(2);
    expect(result.rows?.[0].pending_tasks).toBe(5); // BigInt(5) converted to 5
    expect(result.rows?.[0].user).toBe('alice');
  });

  it('rejects invalid or unsafe column references', async () => {
    const maliciousQuery: StructuredQuery = {
      ...sampleCrossQuery,
      select: [{ field: 'user.id; DROP TABLE users;', label: 'Hack' }],
    };

    await expect(service.execute(maliciousQuery, mockUser)).rejects.toThrow(BadRequestException);
  });
});
