import { apiClient, buildQuery } from './api-client';

/**
 * Controlled form-view registry. An action's `target` never contains a raw
 * URL — it is an opaque identifier the client resolves here, matching the
 * SDUI PRD's "known registries" rule (stack.md §16.4).
 */
const REGISTRY: Record<string, string> = {
  'todo.task.form': 'ui/views/todo/task/form',
  'user.form': 'ui/views/user-management/user-form',
  'user-management.user.form': 'ui/views/user-management/user-form',
  'user-roles.role.form': 'ui/views/user-roles/role-form',
};

export class UnknownFormTargetError extends Error {
  constructor(target: string) {
    super(`Unknown or unapproved form target: ${target}`);
  }
}

export async function fetchFormSection(target: string, params?: Record<string, unknown>): Promise<unknown> {
  const path = REGISTRY[target];
  if (!path) throw new UnknownFormTargetError(target);
  return apiClient.get(`${path}${buildQuery(params ?? {})}`);
}
