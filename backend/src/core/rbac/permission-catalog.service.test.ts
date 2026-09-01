import { describe, expect, it } from 'vitest';
import { PermissionCatalogService } from './permission-catalog.service';

describe('PermissionCatalogService', () => {
  const service = new PermissionCatalogService();

  it('aggregates core module permissions', () => {
    const modules = service.getAvailableModulePermissions();
    const userMgmt = modules.find((m) => m.moduleId === 'user-management');
    const moduleMgmt = modules.find((m) => m.moduleId === 'module-management');
    const aiConfig = modules.find((m) => m.moduleId === 'ai-configuration');

    expect(userMgmt).toBeDefined();
    expect(userMgmt?.permissions.map((p) => p.id)).toEqual([
      'user.read',
      'user.create',
      'user.update',
      'user.delete',
    ]);

    expect(moduleMgmt).toBeDefined();
    expect(moduleMgmt?.permissions.map((p) => p.id)).toEqual([
      'module.read',
      'module.manage',
      'module.install',
    ]);

    expect(aiConfig).toBeDefined();
    expect(aiConfig?.permissions.map((p) => p.id)).toEqual([
      'ai.config.read',
      'ai.config.write',
    ]);
  });

  it('discovers schema-driven modules on disk (e.g. todo)', () => {
    const modules = service.getAvailableModulePermissions();
    const todoMod = modules.find((m) => m.moduleId === 'todo');

    expect(todoMod).toBeDefined();
    expect(todoMod?.permissions.map((p) => p.id)).toContain('todo.task.read');
    expect(todoMod?.permissions.map((p) => p.id)).toContain('todo.task.create');
    expect(todoMod?.permissions.map((p) => p.id)).toContain('todo.task.update');
    expect(todoMod?.permissions.map((p) => p.id)).toContain('todo.task.approve');
    expect(todoMod?.permissions.map((p) => p.id)).toContain('todo.task.delete');
  });

  it('returns all unique permission IDs sorted', () => {
    const allIds = service.getAllPermissionIds();
    expect(allIds.length).toBeGreaterThan(0);
    expect(allIds).toContain('user.read');
    expect(allIds).toContain('todo.task.read');
    expect(allIds).toContain('ai.config.read');
    expect(allIds).toContain('module.read');
  });
});
