import { describe, expect, it, vi } from 'vitest';

vi.mock('./api-client', () => ({
  apiClient: {
    post: vi.fn().mockResolvedValue({ ok: true }),
    patch: vi.fn().mockResolvedValue({ ok: true }),
    put: vi.fn().mockResolvedValue({ ok: true }),
    delete: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

import { getSubmitTarget, UnknownActionTargetError } from './action-registry';

describe('getSubmitTarget', () => {
  it('resolves a known target to its approved invalidation keys', () => {
    const target = getSubmitTarget('todo.task.create');
    expect(target.invalidates).toEqual(['todo.task', 'todo.task.insights']);
  });

  it('resolves role.permissions.update target', () => {
    const target = getSubmitTarget('role.permissions.update');
    expect(target).toBeDefined();
    expect(target.invalidates).toEqual(['user-roles.role', 'roles.insights']);
  });

  it('resolves user.create and user.deactivate targets', () => {
    const createTarget = getSubmitTarget('user.create');
    expect(createTarget.invalidates).toEqual(['user-management.user', 'users', 'users.insights']);

    const deleteTarget = getSubmitTarget('user.deactivate');
    expect(deleteTarget.invalidates).toEqual(['user-management.user', 'users', 'users.insights']);
  });

  it('rejects an unknown target instead of executing an arbitrary action', () => {
    expect(() => getSubmitTarget('server.provided.anything')).toThrow(UnknownActionTargetError);
  });
});
