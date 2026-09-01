import type { RecordDatePreset } from '@erp/shared-contracts';

/**
 * Resolves a standard business-date filter preset into a [start, end)
 * range over `record_date` — never `created_at`/`updated_at`
 * (Module System Amendment §4).
 */
export function resolveRecordDateRange(
  preset: string | undefined,
  now: Date = new Date(),
): { start: Date; end: Date } | null {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d: Date, n: number) => {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + n);
    return copy;
  };

  const today = startOfDay(now);

  switch (preset as RecordDatePreset | undefined) {
    case 'today':
      return { start: today, end: addDays(today, 1) };
    case 'tomorrow':
      return { start: addDays(today, 1), end: addDays(today, 2) };
    case 'yesterday':
      return { start: addDays(today, -1), end: today };
    case 'last_7_days':
      return { start: addDays(today, -6), end: addDays(today, 1) };
    case 'last_30_days':
      return { start: addDays(today, -29), end: addDays(today, 1) };
    case 'this_week': {
      const day = today.getDay();
      const monday = addDays(today, day === 0 ? -6 : 1 - day);
      return { start: monday, end: addDays(monday, 7) };
    }
    case 'last_week': {
      const day = today.getDay();
      const monday = addDays(today, (day === 0 ? -6 : 1 - day) - 7);
      return { start: monday, end: addDays(monday, 7) };
    }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      return { start, end };
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start, end };
    }
    case 'all_time':
      return null;
    default:
      return null;
  }
}
