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

  it('rejects an unknown target instead of executing an arbitrary action', () => {
    expect(() => getSubmitTarget('server.provided.anything')).toThrow(UnknownActionTargetError);
  });
});
