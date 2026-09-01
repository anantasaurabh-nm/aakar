import { describe, expect, it } from 'vitest';
import type { CapabilityDescriptor } from '@erp/shared-contracts';
import { classifyWithRules } from './rule-based-classifier';

const CAPABILITIES: CapabilityDescriptor[] = [
  { id: 'todo.task.list', module: 'todo', entity: 'task', description: "List the user's tasks", requiredPermission: 'todo.task.read' },
  { id: 'todo.task.insights', module: 'todo', entity: 'task', description: 'Summarize task counts and trends', requiredPermission: 'todo.task.read' },
  { id: 'todo.task.create', module: 'todo', entity: 'task', description: 'Create a new task', requiredPermission: 'todo.task.create' },
  { id: 'todo.task.complete', module: 'todo', entity: 'task', description: 'Mark a task as complete', requiredPermission: 'todo.task.approve' },
  { id: 'todo.task.delete', module: 'todo', entity: 'task', description: 'Delete a task', requiredPermission: 'todo.task.delete' },
  { id: 'user-management.user.list', module: 'user-management', entity: 'user', description: 'List platform users', requiredPermission: 'user.read' },
  { id: 'user-management.user.insights', module: 'user-management', entity: 'user', description: 'User insights and statistics', requiredPermission: 'user.read' },
  { id: 'user-management.user.create', module: 'user-management', entity: 'user', description: 'Create a new user', requiredPermission: 'user.create' },
  { id: 'user-roles.role.list', module: 'user-roles', entity: 'role', description: 'List platform roles and permissions', requiredPermission: 'user.read' },
  { id: 'user-roles.role.insights', module: 'user-roles', entity: 'role', description: 'Role insights and distributions', requiredPermission: 'user.read' },
  { id: 'user-roles.role.create', module: 'user-roles', entity: 'role', description: 'Create a new role', requiredPermission: 'user.create' },
  { id: 'core.query.execute', module: 'core', entity: 'query', description: 'Execute cross-entity query', requiredPermission: 'user.read' },
];

describe('classifyWithRules', () => {
  it('routes "who are the users with pending todos?" to core.query.execute with multi-table join', () => {
    const decision = classifyWithRules('who are the users with pending todos?', CAPABILITIES);
    expect(decision?.capability).toBe('core.query.execute');
    expect(decision?.parameters.query).toBeDefined();
    const q = decision?.parameters.query as any;
    expect(q.primaryEntity.entity).toBe('user');
    expect(q.joins[0].entity).toBe('task');
  });

  it('routes "show me today\'s todo" to the list capability with today preset', () => {
    const decision = classifyWithRules("Show me my today's todo.", CAPABILITIES);
    expect(decision?.capability).toBe('todo.task.list');
    expect(decision?.parameters.recordDate).toBe('today');
  });

  it('routes "do you know about roles?" to user-roles.role.list', () => {
    const decision = classifyWithRules('do you know about roles?', CAPABILITIES);
    expect(decision?.capability).toBe('user-roles.role.list');
  });

  it('routes "who are the users of this portal?" to user-management.user.list', () => {
    const decision = classifyWithRules('who are the users of this portal?', CAPABILITIES);
    expect(decision?.capability).toBe('user-management.user.list');
  });

  it('routes "create a new user" to user-management.user.create', () => {
    const decision = classifyWithRules('create a new user', CAPABILITIES);
    expect(decision?.capability).toBe('user-management.user.create');
  });

  it('routes "create a new role called Support" to user-roles.role.create', () => {
    const decision = classifyWithRules('create a new role called Support', CAPABILITIES);
    expect(decision?.capability).toBe('user-roles.role.create');
    expect(decision?.parameters.name).toBe('Support');
  });

  it('routes "how many users are there?" to user-management.user.insights', () => {
    const decision = classifyWithRules('how many users are there?', CAPABILITIES);
    expect(decision?.capability).toBe('user-management.user.insights');
  });

  it('routes "how many roles are there?" to user-roles.role.insights', () => {
    const decision = classifyWithRules('how many roles are there?', CAPABILITIES);
    expect(decision?.capability).toBe('user-roles.role.insights');
  });

  it('scales dynamically to arbitrary new modules (e.g. inventory, billing)', () => {
    const dynamicCapabilities: CapabilityDescriptor[] = [
      ...CAPABILITIES,
      { id: 'inventory.item.list', module: 'inventory', entity: 'item', description: 'List inventory stock items', requiredPermission: 'inventory.item.read' },
      { id: 'inventory.item.create', module: 'inventory', entity: 'item', description: 'Create stock item', requiredPermission: 'inventory.item.create' },
      { id: 'inventory.item.insights', module: 'inventory', entity: 'item', description: 'Stock analytics', requiredPermission: 'inventory.item.read' },
      { id: 'billing.invoice.list', module: 'billing', entity: 'invoice', description: 'List customer invoices', requiredPermission: 'billing.invoice.read' },
      { id: 'billing.invoice.create', module: 'billing', entity: 'invoice', description: 'Create invoice', requiredPermission: 'billing.invoice.create' },
    ];

    const itemCreate = classifyWithRules('create a new item for Warehouse A', dynamicCapabilities);
    expect(itemCreate?.capability).toBe('inventory.item.create');

    const invoiceList = classifyWithRules('show me all invoices', dynamicCapabilities);
    expect(invoiceList?.capability).toBe('billing.invoice.list');

    const inventoryStats = classifyWithRules('how many items are in stock?', dynamicCapabilities);
    expect(inventoryStats?.capability).toBe('inventory.item.insights');
  });

  it('routes create requests to the create capability with an extracted title', () => {
    const decision = classifyWithRules('Create a task to call the customer', CAPABILITIES);
    expect(decision?.capability).toBe('todo.task.create');
    expect(decision?.parameters.title).toContain('call the customer');
  });

  it('routes completion phrasing to the complete capability', () => {
    const decision = classifyWithRules('Mark the customer call as done', CAPABILITIES);
    expect(decision?.capability).toBe('todo.task.complete');
  });

  it('flags delete requests as needing confirmation', () => {
    const decision = classifyWithRules('Delete the customer call task', CAPABILITIES);
    expect(decision?.capability).toBe('todo.task.delete');
    expect(decision?.needsConfirmation).toBe(true);
  });

  it('falls back to the list capability for unrecognized phrasing', () => {
    const decision = classifyWithRules('asdkjhaskjdh random gibberish', CAPABILITIES);
    expect(decision?.capability).toBe('todo.task.list');
  });

  it('routes "show only high priority todos" to list capability with priority HIGH', () => {
    const decision = classifyWithRules('show only high priority todos', CAPABILITIES);
    expect(decision?.capability).toBe('todo.task.list');
    expect(decision?.parameters.priority).toBe('HIGH');
  });

  it('routes "approved todos" to list capability with status approved', () => {
    const decision = classifyWithRules('approved todos', CAPABILITIES);
    expect(decision?.capability).toBe('todo.task.list');
    expect(decision?.parameters.status).toBe('approved');
  });

  it('routes "todos from general cat" to list capability with category General', () => {
    const decision = classifyWithRules('todos from general cat', CAPABILITIES);
    expect(decision?.capability).toBe('todo.task.list');
    expect(decision?.parameters.category).toBe('General');
  });

  it('routes "category = enginnering" with typo to list capability with category Engineering', () => {
    const decision = classifyWithRules('category = enginnering', CAPABILITIES);
    expect(decision?.capability).toBe('todo.task.list');
    expect(decision?.parameters.category).toBe('Engineering');
  });

  it('routes "all records" to list capability with empty parameters (cleared filters)', () => {
    const decision = classifyWithRules('all records', CAPABILITIES);
    expect(decision?.capability).toBe('todo.task.list');
    expect(Object.keys(decision?.parameters ?? {})).toHaveLength(0);
  });

  it('returns null when no capabilities are registered', () => {
    expect(classifyWithRules('show me today', [])).toBeNull();
  });
});
