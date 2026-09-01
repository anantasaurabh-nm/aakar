import { Injectable } from '@nestjs/common';
import { discoverModulesOnDisk } from '../entity-engine/module-schema-loader';

export interface PermissionItem {
  id: string;
  label: string;
  description: string;
  entityKey?: string;
  operation?: string;
}

export interface ModulePermissionGroup {
  moduleId: string;
  moduleName: string;
  icon: string;
  description?: string;
  permissions: PermissionItem[];
}

const CORE_MODULE_PERMISSIONS: ModulePermissionGroup[] = [
  {
    moduleId: 'user-management',
    moduleName: 'User Management',
    icon: 'users',
    description: 'Manage platform users, roles, and access control',
    permissions: [
      { id: 'user.read', label: 'View Users', description: 'View user directory and analytics' },
      { id: 'user.create', label: 'Create Users', description: 'Provision new platform user accounts' },
      { id: 'user.update', label: 'Update Users', description: 'Edit user accounts, roles, and status' },
      { id: 'user.delete', label: 'Deactivate Users', description: 'Deactivate user accounts' },
    ],
  },
  {
    moduleId: 'module-management',
    moduleName: 'Module Management',
    icon: 'modules',
    description: 'Manage, install, enable and disable platform modules',
    permissions: [
      { id: 'module.read', label: 'View Modules', description: 'Inspect installed and discovered modules' },
      { id: 'module.manage', label: 'Manage Modules', description: 'Enable, disable, and discover modules' },
      { id: 'module.install', label: 'Install Modules', description: 'Install newly discovered modules from disk' },
    ],
  },
  {
    moduleId: 'ai-configuration',
    moduleName: 'AI Configuration',
    icon: 'ai',
    description: 'Configure AI provider connections, keys, and model profiles',
    permissions: [
      { id: 'ai.config.read', label: 'View AI Config', description: 'View AI model profiles and provider setups' },
      { id: 'ai.config.write', label: 'Manage AI Config', description: 'Add, update, and remove AI model configurations' },
    ],
  },
];

@Injectable()
export class PermissionCatalogService {
  /**
   * Aggregates all system capabilities and permissions across Core platform
   * modules and schema-driven business modules installed on disk.
   */
  getAvailableModulePermissions(): ModulePermissionGroup[] {
    const groups: ModulePermissionGroup[] = [...CORE_MODULE_PERMISSIONS];

    // Discover schema-driven modules on disk (e.g. todo)
    const diskModules = discoverModulesOnDisk();
    for (const { manifest, schema } of diskModules) {
      if (!schema || !schema.entities) continue;

      const permissions: PermissionItem[] = [];
      for (const [entityKey, entity] of Object.entries(schema.entities)) {
        const label = entity.label ?? entityKey;
        permissions.push({
          id: `${manifest.id}.${entityKey}.read`,
          label: `View ${label}`,
          description: `Read and search ${label} records`,
          entityKey,
          operation: 'read',
        });
        if (!entity.readOnly) {
          permissions.push({
            id: `${manifest.id}.${entityKey}.create`,
            label: `Create ${label}`,
            description: `Create new ${label} records`,
            entityKey,
            operation: 'create',
          });
          permissions.push({
            id: `${manifest.id}.${entityKey}.update`,
            label: `Edit ${label}`,
            description: `Modify existing ${label} records`,
            entityKey,
            operation: 'update',
          });
          permissions.push({
            id: `${manifest.id}.${entityKey}.approve`,
            label: `Approve ${label}`,
            description: `Approve or transition lifecycle status of ${label} records`,
            entityKey,
            operation: 'approve',
          });
          permissions.push({
            id: `${manifest.id}.${entityKey}.delete`,
            label: `Delete ${label}`,
            description: `Delete or soft-delete ${label} records`,
            entityKey,
            operation: 'delete',
          });
        }
      }

      groups.push({
        moduleId: manifest.id,
        moduleName: manifest.name,
        icon: manifest.id,
        description: manifest.description,
        permissions,
      });
    }

    return groups;
  }

  /** Returns flat list of all valid permission strings in the entire system. */
  getAllPermissionIds(): string[] {
    const modules = this.getAvailableModulePermissions();
    return Array.from(new Set(modules.flatMap((m) => m.permissions.map((p) => p.id)))).sort();
  }
}
