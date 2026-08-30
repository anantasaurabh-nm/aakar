import { describe, expect, it } from 'vitest';
import { lifecycleFor, TRANSITION_TARGET_SUFFIX } from './record-lifecycle';

describe('lifecycleFor (finetune-1 §3.2 default record lifecycle)', () => {
  it('draft: editable, Submit forward action, Delete available', () => {
    const l = lifecycleFor('draft');
    expect(l.canEdit).toBe(true);
    expect(l.forward).toEqual({ label: 'Submit', to: 'submitted' });
    expect(l.sideActions.map((a) => a.to)).toEqual(['deleted']);
  });

  it('submitted: editable, Approve forward action', () => {
    const l = lifecycleFor('submitted');
    expect(l.canEdit).toBe(true);
    expect(l.forward).toEqual({ label: 'Approve', to: 'approved' });
  });

  it('approved: read-only, only Cancel Record available (no Delete)', () => {
    const l = lifecycleFor('approved');
    expect(l.canEdit).toBe(false);
    expect(l.forward).toBeUndefined();
    expect(l.sideActions).toEqual([{ label: 'Cancel Record', to: 'cancelled' }]);
  });

  it('cancelled: read-only, only then can be Deleted', () => {
    const l = lifecycleFor('cancelled');
    expect(l.canEdit).toBe(false);
    expect(l.sideActions.map((a) => a.to)).toEqual(['deleted']);
  });

  it('unknown/undefined status defaults to draft', () => {
    expect(lifecycleFor(undefined)).toEqual(lifecycleFor('draft'));
  });
});

describe('TRANSITION_TARGET_SUFFIX', () => {
  it('maps "approved" to the existing .complete action-registry suffix, not .approve', () => {
    expect(TRANSITION_TARGET_SUFFIX.approved).toBe('complete');
  });
});
