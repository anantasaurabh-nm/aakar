import { describe, expect, it } from 'vitest';
import { resolveRecordDateRange } from './record-date.util';

describe('resolveRecordDateRange', () => {
  const reference = new Date('2026-08-29T15:00:00Z');

  it('resolves "today" to a one-day window on record_date', () => {
    const range = resolveRecordDateRange('today', reference);
    expect(range).not.toBeNull();
    expect(range!.end.getTime() - range!.start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('resolves "all_time" to no range restriction', () => {
    expect(resolveRecordDateRange('all_time', reference)).toBeNull();
  });

  it('resolves an unknown preset to no range restriction (fails safe)', () => {
    expect(resolveRecordDateRange('not-a-real-preset', reference)).toBeNull();
  });

  it('"this_week" always starts on Monday', () => {
    const range = resolveRecordDateRange('this_week', reference);
    expect(range!.start.getDay()).toBe(1);
  });
});
