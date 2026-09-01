'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Boxes,
  Bot,
  Check,
  CheckSquare,
  LayoutGrid,
  Loader2,
  Shield,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useUiStore } from '@/lib/ui-store';
import { Badge } from '@/components/ui/Badge';

const MODULE_ICONS: Record<string, LucideIcon> = {
  todo: CheckSquare,
  'user-management': Users,
  'user-roles': ShieldCheck,
  'module-management': Boxes,
  'ai-configuration': Bot,
  ai: Bot,
};

export interface ModulePermissionItem {
  id: string;
  label: string;
  description?: string;
  granted: boolean;
}

export interface PermissionModuleGroup {
  moduleId: string;
  moduleName: string;
  description?: string;
  permissions: ModulePermissionItem[];
}

interface RolePermissionMatrixProps {
  roleKey: string;
  roleName?: string;
  initialModules: PermissionModuleGroup[];
}

export function RolePermissionMatrix({ roleKey, roleName, initialModules }: RolePermissionMatrixProps) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const [modulesState, setModulesState] = useState<PermissionModuleGroup[]>(initialModules);
  const [savingModule, setSavingModule] = useState<string | null>(null);

  const totalPermissions = modulesState.reduce((acc, m) => acc + m.permissions.length, 0);
  const totalGranted = modulesState.reduce(
    (acc, m) => acc + m.permissions.filter((p) => p.granted).length,
    0,
  );

  async function handleToggle(moduleId: string, permissionId: string, nextGranted: boolean) {
    const mod = modulesState.find((m) => m.moduleId === moduleId);
    if (!mod) return;

    // Optimistic state update
    const updatedModules = modulesState.map((m) => {
      if (m.moduleId !== moduleId) return m;
      return {
        ...m,
        permissions: m.permissions.map((p) => (p.id === permissionId ? { ...p, granted: nextGranted } : p)),
      };
    });
    setModulesState(updatedModules);
    setSavingModule(moduleId);

    try {
      const payload: Record<string, unknown> = {
        role: roleKey,
        module: moduleId,
        [permissionId]: nextGranted,
      };

      await apiClient.put('actions/role-permissions', payload);
      queryClient.invalidateQueries({ queryKey: ['ds', 'user-roles.role'] });
      queryClient.invalidateQueries({ queryKey: ['ds', 'roles.insights'] });
      pushToast(`Updated ${permissionId} for ${roleName || roleKey}`);
    } catch (err) {
      // Revert on error
      setModulesState(modulesState);
      pushToast(err instanceof Error ? err.message : 'Failed to update permission', 'error');
    } finally {
      setSavingModule(null);
    }
  }

  async function handleToggleAll(moduleId: string, enableAll: boolean) {
    const mod = modulesState.find((m) => m.moduleId === moduleId);
    if (!mod) return;

    const updatedModules = modulesState.map((m) => {
      if (m.moduleId !== moduleId) return m;
      return {
        ...m,
        permissions: m.permissions.map((p) => ({ ...p, granted: enableAll })),
      };
    });
    setModulesState(updatedModules);
    setSavingModule(moduleId);

    try {
      const payload: Record<string, unknown> = {
        role: roleKey,
        module: moduleId,
      };
      for (const p of mod.permissions) {
        payload[p.id] = enableAll;
      }

      await apiClient.put('actions/role-permissions', payload);
      queryClient.invalidateQueries({ queryKey: ['ds', 'user-roles.role'] });
      queryClient.invalidateQueries({ queryKey: ['ds', 'roles.insights'] });
      pushToast(`${enableAll ? 'Granted all' : 'Cleared all'} permissions for ${mod.moduleName}`);
    } catch (err) {
      setModulesState(modulesState);
      pushToast(err instanceof Error ? err.message : 'Failed to update permissions', 'error');
    } finally {
      setSavingModule(null);
    }
  }

  return (
    <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Section Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 12,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--badge-primary-bg)',
              color: 'var(--accent-indigo)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Shield size={18} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Permissions Matrix
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Configure module capabilities and access control for this role
            </div>
          </div>
        </div>

        <Badge tone={totalGranted === totalPermissions ? 'success' : totalGranted > 0 ? 'primary' : 'neutral'}>
          {totalGranted} of {totalPermissions} Capabilities Granted
        </Badge>
      </div>

      {/* Modules Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: 16,
        }}
      >
        {modulesState.map((mod) => {
          const Icon = MODULE_ICONS[mod.moduleId] ?? LayoutGrid;
          const grantedCount = mod.permissions.filter((p) => p.granted).length;
          const allGranted = grantedCount === mod.permissions.length;
          const isSaving = savingModule === mod.moduleId;

          return (
            <div
              key={mod.moduleId}
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                boxShadow: 'var(--shadow-sm)',
                transition: 'border-color 0.15s ease',
              }}
            >
              {/* Module Card Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: 10,
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={15} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {mod.moduleName}
                    </div>
                    {mod.description && (
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {mod.description}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isSaving && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--accent-indigo)' }} />}
                  <Badge tone={allGranted ? 'success' : grantedCount > 0 ? 'primary' : 'neutral'}>
                    {grantedCount}/{mod.permissions.length}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => handleToggleAll(mod.moduleId, !allGranted)}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--accent-indigo)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 4px',
                    }}
                    title={allGranted ? 'Clear all permissions in this module' : 'Grant all permissions in this module'}
                  >
                    {allGranted ? 'Clear' : 'All'}
                  </button>
                </div>
              </div>

              {/* Permission Switches List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {mod.permissions.map((perm) => (
                  <label
                    key={perm.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: perm.granted ? 'var(--surface)' : 'transparent',
                      border: perm.granted ? '1px solid var(--border)' : '1px solid transparent',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease, border-color 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: perm.granted ? 600 : 500,
                          color: perm.granted ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        {perm.label}
                      </span>
                      <code
                        style={{
                          fontSize: 10,
                          color: 'var(--text-tertiary)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {perm.id}
                      </code>
                    </div>

                    <input
                      type="checkbox"
                      checked={perm.granted}
                      onChange={(e) => handleToggle(mod.moduleId, perm.id, e.target.checked)}
                      style={{
                        width: 17,
                        height: 17,
                        accentColor: 'var(--accent-indigo)',
                        cursor: 'pointer',
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
