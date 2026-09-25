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
    invalidates: ['user-management.user', 'users', 'users.insights'],
    execute: (values) => apiClient.post('actions/users', omit(values, ['id'])),
  },
  'user-management.user.create': {
    invalidates: ['user-management.user', 'users', 'users.insights'],
    execute: (values) => apiClient.post('actions/users', omit(values, ['id'])),
  },
  'user.update': {
    invalidates: ['user-management.user', 'users', 'users.insights'],
    execute: (values) => apiClient.patch(`actions/users/${values.id}`, omit(values, ['id'])),
  },
  'user-management.user.update': {
    invalidates: ['user-management.user', 'users', 'users.insights'],
    execute: (values) => apiClient.patch(`actions/users/${values.id}`, omit(values, ['id'])),
  },
  'user.deactivate': {
    invalidates: ['user-management.user', 'users', 'users.insights'],
    execute: (values) => apiClient.delete(`actions/users/${values.id}`),
  },
  'user-management.user.delete': {
    invalidates: ['user-management.user', 'users', 'users.insights'],
    execute: (values) => apiClient.delete(`actions/users/${values.id}`),
  },

  'role.create': {
    invalidates: ['user-roles.role', 'roles.insights'],
    execute: (values) => apiClient.post('actions/roles', omit(values, ['id'])),
  },
  'user-roles.role.create': {
    invalidates: ['user-roles.role', 'roles.insights'],
    execute: (values) => apiClient.post('actions/roles', omit(values, ['id'])),
  },
  'role.update': {
    invalidates: ['user-roles.role', 'roles.insights'],
    execute: (values) => apiClient.patch(`actions/roles/${values.id}`, omit(values, ['id'])),
  },
  'user-roles.role.update': {
    invalidates: ['user-roles.role', 'roles.insights'],
    execute: (values) => apiClient.patch(`actions/roles/${values.id}`, omit(values, ['id'])),
  },
  'role.delete': {
    invalidates: ['user-roles.role', 'roles.insights'],
    execute: (values) => apiClient.delete(`actions/roles/${values.id}`),
  },
  'user-roles.role.delete': {
    invalidates: ['user-roles.role', 'roles.insights'],
    execute: (values) => apiClient.delete(`actions/roles/${values.id}`),
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
  'module.uninstall': {
    invalidates: ['modules'],
    execute: (values) => apiClient.post(`actions/modules/${values.id}/uninstall`),
  },

  // Role permissions matrix configuration (Settings surface)
  'role.permissions.update': {
    invalidates: ['user-roles.role', 'roles.insights'],
    execute: (values) => apiClient.put('actions/role-permissions', values),
  },

  // Settings groups don't use the 'ds' data-source cache (values are inlined
  // in the SDUI page response) — SettingsView invalidates the `ui` query
  // namespace directly on success instead, so `invalidates` is unused here.
  'ai.model-config.create': {
    invalidates: [],
    execute: (values) => apiClient.post('actions/ai-model-configs', omit(values, ['id'])),
  },
  'ai.model-config.update': {
    invalidates: [],
    execute: (values) => apiClient.put(`actions/ai-model-configs/${values.id}`, omit(values, ['id'])),
  },
  'ai.model-config.delete': {
    invalidates: [],
    execute: (values) => apiClient.delete(`actions/ai-model-configs/${values.id}`),
  },

  'connectors.connection.create': {
    invalidates: ['connectors', 'connectors.list', 'connectors.connection'],
    execute: (values) => apiClient.post('actions/connectors/create', values),
  },
  'connectors.connection.update': {
    invalidates: ['connectors', 'connectors.list', 'connectors.connection'],
    execute: (values) => apiClient.patch(`actions/connectors/${values.id}`, values),
  },
  'connectors.connection.delete': {
    invalidates: ['connectors', 'connectors.list', 'connectors.connection'],
    execute: (values) => apiClient.delete(`actions/connectors/${values.id}`),
  },
  'connectors.connection.test': {
    invalidates: ['connectors', 'connectors.list', 'connectors.connection'],
    execute: (values) => {
      if (values.id && Object.keys(values).length <= 2) {
        return apiClient.post(`actions/connectors/${values.id}/test`);
      }
      return apiClient.post('actions/connectors/test', values);
    },
  },

  'notifications.channel.save': {
    invalidates: ['notifications', 'notifications.list', 'notifications.channel-configs', 'ui'],
    execute: (values) => apiClient.post('actions/notifications/channel-config', values),
  },
  'notifications.mark-all-read': {
    invalidates: ['notifications', 'notifications.list', 'notifications.unread-count'],
    execute: () => apiClient.post('actions/notifications/mark-all-read'),
  },
  'notifications.test': {
    invalidates: ['notifications.channel-configs'],
    execute: (values) => apiClient.post('actions/notifications/test', values),
  },
  'notifications.send': {
    invalidates: ['notifications', 'notifications.list', 'notifications.unread-count'],
    execute: (values) => apiClient.post('actions/notifications/send', values),
  },
  'notifications.test-sample': {
    invalidates: ['notifications', 'notifications.list', 'notifications.unread-count'],
    execute: () => apiClient.post('actions/notifications/test-sample'),
  },
  'notification.dispatch': {
    invalidates: ['notifications', 'notifications.list', 'notifications.unread-count'],
    execute: (values) => apiClient.post('actions/notifications/dispatch', values),
  },
  'notifications.dispatch': {
    invalidates: ['notifications', 'notifications.list', 'notifications.unread-count'],
    execute: (values) => apiClient.post('actions/notifications/dispatch', values),
  },
};

export class UnknownActionTargetError extends Error {
  constructor(target: string) {
    super(`Unknown or unapproved action target: ${target}`);
  }
}

export function getSubmitTarget(target: string): SubmitTarget {
  const entry = REGISTRY[target];
  if (entry) return entry;

  // Module settings submit targets: e.g. "todo.settings", "actions/todo/settings", "/api/actions/todo/settings"
  const settingsMatch = target.match(/^(?:(?:\/api\/)?actions\/)?([a-zA-Z0-9_-]+)(?:\.settings|\/settings)$/);
  if (settingsMatch) {
    const mod = settingsMatch[1];
    return {
      invalidates: [`${mod}.settings`, `data.${mod}.settings`, 'ui', 'data'],
      execute: (values) => apiClient.post(`actions/${mod}/settings`, values),
    };
  }

  // Dynamic schema-driven entity submit targets:
  // e.g. "hello-module.greeting.create" -> POST actions/hello-module/greeting
  // e.g. "hello-module.greeting.update" -> PATCH actions/hello-module/greeting/:id
  // e.g. "hello-module.greeting.delete" -> DELETE actions/hello-module/greeting/:id
  // e.g. "hello-module.greeting.complete" -> PATCH actions/hello-module/greeting/:id/transition { to: 'approved' }
  // e.g. "hello-module.greeting.transition" -> PATCH actions/hello-module/greeting/:id/transition { to: values.to }
  const parts = target.split('.');
  if (parts.length === 3) {
    const [mod, ent, op] = parts;
    const baseInvalidates = [`${mod}.${ent}`, `${mod}.${ent}.list`, `${mod}.${ent}.insights`];

    switch (op) {
      case 'create':
        return {
          invalidates: baseInvalidates,
          execute: (values) => apiClient.post(`actions/${mod}/${ent}`, omit(values, ['id'])),
        };
      case 'update':
        return {
          invalidates: baseInvalidates,
          execute: (values) => apiClient.patch(`actions/${mod}/${ent}/${values.id}`, omit(values, ['id'])),
        };
      case 'delete':
        return {
          invalidates: baseInvalidates,
          execute: (values) => apiClient.delete(`actions/${mod}/${ent}/${values.id}`),
        };
      case 'complete':
        return {
          invalidates: baseInvalidates,
          execute: (values) => apiClient.patch(`actions/${mod}/${ent}/${values.id}/transition`, { to: 'approved' }),
        };
      case 'submit':
        return {
          invalidates: baseInvalidates,
          execute: (values) => apiClient.patch(`actions/${mod}/${ent}/${values.id}/transition`, { to: 'submitted' }),
        };
      case 'cancel':
        return {
          invalidates: baseInvalidates,
          execute: (values) => apiClient.patch(`actions/${mod}/${ent}/${values.id}/transition`, { to: 'cancelled' }),
        };
      case 'reopen':
      case 'draft':
        return {
          invalidates: baseInvalidates,
          execute: (values) => apiClient.patch(`actions/${mod}/${ent}/${values.id}/transition`, { to: 'draft' }),
        };
      case 'transition':
        return {
          invalidates: baseInvalidates,
          execute: (values) => apiClient.patch(`actions/${mod}/${ent}/${values.id}/transition`, { to: values.to }),
        };
    }
  }

  throw new UnknownActionTargetError(target);
}
