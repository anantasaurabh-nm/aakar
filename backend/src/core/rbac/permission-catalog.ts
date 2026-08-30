import { Role } from '@prisma/client';

/**
 * Default permission catalog for DoersOS Core's own platform permissions
 * (user management, module management, AI configuration). Permission
 * strings for schema-driven module entities (e.g. `todo.task.read`) are
 * NOT listed here — they're generated and granted directly into
 * `role_permissions` by EntityRegistryService when a module is installed,
 * since this static catalog is only ever consulted as a fallback for a
 * completely empty table (see PermissionsService.loadMap).
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, string[]> = {
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
  ],
  TENANT_ADMIN: ['user.read', 'user.create', 'user.update', 'user.delete', 'module.read', 'module.manage'],
  MANAGER: ['user.read'],
  STAFF: [],
  VIEWER: ['user.read'],
};

export const ALL_PERMISSIONS = Array.from(
  new Set(Object.values(DEFAULT_ROLE_PERMISSIONS).flat()),
).sort();
