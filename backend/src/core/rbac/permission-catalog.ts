export type Role = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER' | string;

export const SYSTEM_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'MANAGER', 'STAFF', 'VIEWER'] as const;

/**
 * Default permission catalog for DoersOS Core's own platform permissions
 * (user management, module management, AI configuration). Permission
 * strings for schema-driven module entities (e.g. `todo.task.read`) are
 * NOT listed here — they're generated and granted directly into
 * `role_permissions` by EntityRegistryService when a module is installed,
 * since this static catalog is only ever consulted as a fallback for a
 * completely empty table (see PermissionsService.loadMap).
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: [
    'user.read',
    'user.create',
    'user.update',
    'user.delete',
    'module.read',
    'module.manage',
    'module.install',
    'ai.config.read',
    'ai.config.write',
    'connectors.read',
    'connectors.manage',
    'notifications.read',
    'notifications.manage',
    'notifications.send',
  ],
  TENANT_ADMIN: [
    'user.read',
    'user.create',
    'user.update',
    'user.delete',
    'module.read',
    'module.manage',
    'connectors.read',
    'connectors.manage',
    'notifications.read',
    'notifications.manage',
    'notifications.send',
  ],
  MANAGER: ['user.read', 'notifications.read', 'notifications.send'],
  STAFF: ['notifications.read', 'notifications.send'],
  VIEWER: ['user.read', 'notifications.read'],
};

export const ALL_PERMISSIONS = Array.from(
  new Set(Object.values(DEFAULT_ROLE_PERMISSIONS).flat()),
).sort();
