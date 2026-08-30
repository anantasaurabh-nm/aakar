import { describe, expect, it } from 'vitest';
import type { CapabilityDescriptor } from '@erp/shared-contracts';
import { classifyWithRules } from './rule-based-classifier';

const CAPABILITIES: CapabilityDescriptor[] = [
  { id: 'todo.task.list', module: 'todo', entity: 'task', description: "List the user's tasks", requiredPermission: 'todo.task.read' },
  { id: 'todo.task.insights', module: 'todo', entity: 'task', description: 'Summarize task counts and trends', requiredPermission: 'todo.task.read' },
  { id: 'todo.task.create', module: 'todo', entity: 'task', description: 'Create a new task', requiredPermission: 'todo.task.create' },
  { id: 'todo.task.complete', module: 'todo', entity: 'task', description: 'Mark a task as complete', requiredPermission: 'todo.task.approve' },
  { id: 'todo.task.delete', module: 'todo', entity: 'task', description: 'Delete a task', requiredPermission: 'todo.task.delete' },
];

describe('classifyWithRules', () => {
  it('routes "show me today\'s todo" to the list capability with today preset', () => {
    const decision = classifyWithRules("Show me my today's todo.", CAPABILITIES);
    expect(decision?.capability).toBe('todo.task.list');
    expect(decision?.parameters.recordDate).toBe('today');
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

  it('returns null when no capabilities are registered', () => {
    expect(classifyWithRules('show me today', [])).toBeNull();
  });
});
