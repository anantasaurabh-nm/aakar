import { apiClient } from './api-client';

interface SubmitTarget {
  invalidates: string[];
  execute: (values: Record<string, unknown>) => Promise<unknown>;
}

function omit<T extends Record<string, unknown>>(obj: T, keys: string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...obj };
  for (const key of keys) delete copy[key];
  return copy;
}

/** Cuts the boilerplate for a status-transition target — still an explicit, whitelisted entry per entity. */
function transitionTarget(path: string, to: string, invalidates: string[]): SubmitTarget {
  return {
    invalidates,
    execute: (values) => apiClient.patch(`actions/${path}/${values.id}/transition`, { to }),
  };
}

/**
 * Controlled submit-action registry. Every mutation target is an approved,
 * explicit operation — never an arbitrary server-provided URL/method
 * (SDUI PRD §16.3-16.4).
 */
const REGISTRY: Record<string, SubmitTarget> = {
  'todo.task.create': {
    invalidates: ['todo.task', 'todo.task.insights'],
    execute: (values) => apiClient.post('actions/todo/task', omit(values, ['id'])),
  },
  'todo.task.update': {
    invalidates: ['todo.task', 'todo.task.insights'],
    execute: (values) => apiClient.patch(`actions/todo/task/${values.id}`, omit(values, ['id'])),
  },
  'todo.task.complete': {
    invalidates: ['todo.task', 'todo.task.insights'],
    execute: (values) => apiClient.patch(`actions/todo/task/${values.id}/transition`, { to: 'approved' }),
  },
  'todo.task.submit': transitionTarget('todo/task', 'submitted', ['todo.task', 'todo.task.insights']),
  'todo.task.cancel': transitionTarget('todo/task', 'cancelled', ['todo.task', 'todo.task.insights']),
  'todo.task.reopen': transitionTarget('todo/task', 'draft', ['todo.task', 'todo.task.insights']),
  'todo.task.draft': transitionTarget('todo/task', 'draft', ['todo.task', 'todo.task.insights']),
  'todo.task.delete': {
    invalidates: ['todo.task', 'todo.task.insights'],
    execute: (values) => apiClient.delete(`actions/todo/task/${values.id}`),
  },

  'user.create': {
    invalidates: ['users', 'users.insights'],
    execute: (values) => apiClient.post('actions/users', omit(values, ['id'])),
  },
  'user.update': {
    invalidates: ['users', 'users.insights'],
    execute: (values) => apiClient.patch(`actions/users/${values.id}`, omit(values, ['id'])),
  },
  'user.deactivate': {
    invalidates: ['users', 'users.insights'],
    execute: (values) => apiClient.delete(`actions/users/${values.id}`),
  },

  'module.toggle': {
    invalidates: ['modules'],
    execute: (values) => apiClient.post(`actions/modules/${values.id}/toggle`),
  },
  'module.discover': {
    invalidates: ['modules'],
    execute: () => apiClient.post('actions/modules/discover'),
  },
  'module.install': {
    invalidates: ['modules'],
    execute: (values) => apiClient.post(`actions/modules/${values.id}/install`),
  },

  'ai.model.save': {
    invalidates: ['ai.models'],
    execute: (values) => apiClient.put(`actions/ai-configuration/models/${values.profile}`, omit(values, ['profile'])),
  },
  'ai.connection.save': {
    invalidates: ['ai.connections', 'ai.models'],
    execute: (values) => apiClient.put(`actions/ai-configuration/connections/${values.name}`, omit(values, ['name'])),
  },
  'ai.connection.delete': {
    invalidates: ['ai.connections'],
    execute: (values) => apiClient.delete(`actions/ai-configuration/connections/${values.name}`),
  },
};

export class UnknownActionTargetError extends Error {
  constructor(target: string) {
    super(`Unknown or unapproved action target: ${target}`);
  }
}

export function getSubmitTarget(target: string): SubmitTarget {
  const entry = REGISTRY[target];
  if (!entry) throw new UnknownActionTargetError(target);
  return entry;
}
