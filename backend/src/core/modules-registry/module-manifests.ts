import type { ModuleManifest } from '@erp/shared-contracts';

/**
 * Static manifest catalog for V1. A production build would discover these
 * from installed packages on disk (Module System PRD §18); for now the set
 * of available modules ships with the platform and is synced into the
 * `module_registry` table at boot, preserving any enabled/disabled state an
 * administrator has already set.
 */
export const SYSTEM_MODULE_IDS = new Set([
  'user-management',
  'user-roles',
  'module-management',
  'ai-configuration',
  'connectors',
]);

export const MODULE_MANIFESTS: (ModuleManifest & { icon: string })[] = [
  {
    id: 'user-management',
    name: 'User Management',
    version: '1.0.0',
    description: 'Manage platform users, roles and access',
    type: 'native',
    surfaces: ['admin'],
    icon: 'users',
  },
  {
    id: 'user-roles',
    name: 'Roles & Permissions',
    version: '1.0.0',
    description: 'Create custom roles and manage module permission matrix',
    type: 'native',
    surfaces: ['admin'],
    icon: 'shield',
  },
  {
    id: 'module-management',
    name: 'Module Management',
    version: '1.0.0',
    description: 'Enable, disable and inspect installed modules',
    type: 'native',
    surfaces: ['admin'],
    icon: 'modules',
  },
  {
    id: 'ai-configuration',
    name: 'AI Configuration',
    version: '1.0.0',
    description: 'Configure AI model profiles and provider connections',
    type: 'native',
    surfaces: ['admin'],
    icon: 'ai',
  },
  {
    id: 'connectors',
    name: 'Connectors & Integrations',
    version: '1.0.0',
    description: 'Manage external API keys, tokens, and credentials securely',
    type: 'native',
    surfaces: ['admin'],
    icon: 'sparkles',
  },
];
