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

  it('resolves "last_7_days" to a 7-day window on record_date', () => {
    const range = resolveRecordDateRange('last_7_days', reference);
    expect(range).not.toBeNull();
    expect(range!.end.getTime() - range!.start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('resolves "last_30_days" to a 30-day window on record_date', () => {
    const range = resolveRecordDateRange('last_30_days', reference);
    expect(range).not.toBeNull();
    expect(range!.end.getTime() - range!.start.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('"this_week" always starts on Monday', () => {
    const range = resolveRecordDateRange('this_week', reference);
    expect(range!.start.getDay()).toBe(1);
  });
});
