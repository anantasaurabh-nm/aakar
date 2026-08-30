import { describe, expect, it } from 'vitest';
import { lifecycleFor, TRANSITION_TARGET_SUFFIX } from './record-lifecycle';

describe('lifecycleFor (DoersOS Default Workflow)', () => {
  it('draft: editable, Submit forward action, Cancel available (Delete not allowed)', () => {
    const l = lifecycleFor('draft');
    expect(l.canEdit).toBe(true);
    expect(l.forward).toEqual({ label: 'Submit', to: 'submitted' });
    expect(l.sideActions.map((a) => a.to)).toEqual(['cancelled']);
  });

  it('submitted: editable, Approve forward action, Cancel available', () => {
    const l = lifecycleFor('submitted');
    expect(l.canEdit).toBe(true);
    expect(l.forward).toEqual({ label: 'Approve', to: 'approved' });
    expect(l.sideActions.map((a) => a.to)).toEqual(['cancelled']);
  });

  it('approved: read-only, only Cancel available', () => {
    const l = lifecycleFor('approved');
    expect(l.canEdit).toBe(false);
    expect(l.forward).toBeUndefined();
    expect(l.sideActions.map((a) => a.to)).toEqual(['cancelled']);
  });

  it('cancelled: read-only, Reopen as Draft and Delete available', () => {
    const l = lifecycleFor('cancelled');
    expect(l.canEdit).toBe(false);
    expect(l.forward).toEqual({ label: 'Reopen as Draft', to: 'draft' });
    expect(l.sideActions.map((a) => a.to)).toEqual(['deleted']);
  });

  it('deleted: read-only, no actions possible', () => {
    const l = lifecycleFor('deleted');
    expect(l.canEdit).toBe(false);
    expect(l.forward).toBeUndefined();
    expect(l.sideActions).toEqual([]);
  });

  it('unknown/undefined status defaults to draft', () => {
    expect(lifecycleFor(undefined)).toEqual(lifecycleFor('draft'));
  });
});

describe('TRANSITION_TARGET_SUFFIX', () => {
  it('maps "approved" to the existing .complete action-registry suffix, not .approve', () => {
    expect(TRANSITION_TARGET_SUFFIX.approved).toBe('complete');
  });

  it('maps "draft" to reopen target suffix', () => {
    expect(TRANSITION_TARGET_SUFFIX.draft).toBe('reopen');
  });
});
