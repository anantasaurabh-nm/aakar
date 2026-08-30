import { describe, expect, it } from 'vitest';
import type { EntityDefinition } from '@erp/shared-contracts';
import { resolveCreateValues, resolveWritableValues } from './entity-value-resolver';

const TASK_ENTITY: EntityDefinition = {
  label: 'Task',
  readOnly: false,
  fields: {
    title: { type: 'string', label: 'Title', required: true, internal: false, listVisible: true, sortable: true, searchable: true },
    origin_module: { type: 'string', internal: true, required: false, listVisible: true, sortable: false, searchable: false, default: 'todo' },
    origin_record_id: { type: 'string', internal: true, required: false, listVisible: false, sortable: false, searchable: false },
  },
};

describe('resolveCreateValues (origin-tracking trust boundary)', () => {
  it('defaults internal fields (e.g. origin_module) when the caller supplies no _origin', () => {
    const values = resolveCreateValues(TASK_ENTITY, { title: 'Follow up on meeting' });
    expect(values.title).toBe('Follow up on meeting');
    expect(values.origin_module).toBe('todo');
    expect(values.origin_record_id).toBeUndefined();
  });

  it('ignores a client-supplied originModule field on the public path (not declared in the request schema, but defense in depth here too)', () => {
    const values = resolveCreateValues(TASK_ENTITY, { title: 'x', origin_module: 'spoofed' });
    // originModule isn't read from params directly (only from params._origin) — it always falls back to the schema default.
    expect(values.origin_module).toBe('todo');
  });

  it('stamps a non-default origin only when passed via the reserved _origin key (the in-process capability path)', () => {
    const values = resolveCreateValues(TASK_ENTITY, {
      title: 'Send follow-up email',
      _origin: { module: 'minutes', recordId: 'meeting-42' },
    });
    expect(values.origin_module).toBe('minutes');
    expect(values.origin_record_id).toBe('meeting-42');
  });
});

describe('resolveWritableValues', () => {
  it('never includes internal fields, even if present in params', () => {
    const values = resolveWritableValues(TASK_ENTITY, { title: 'Updated', origin_module: 'spoofed' });
    expect(values).toEqual({ title: 'Updated' });
  });
});
