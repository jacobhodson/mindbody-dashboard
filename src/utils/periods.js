import { format, startOfWeek, startOfMonth } from 'date-fns';

/**
 * Normalizes "now" down to the start of the given cadence's current period,
 * as a yyyy-MM-dd string — matches task_completions.period_start.
 * Weeks start Monday, to match the rest of the dashboard (RedsList, etc.).
 */
export function periodStartFor(cadence, now = new Date()) {
  if (cadence === 'weekly')  return format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  if (cadence === 'monthly') return format(startOfMonth(now), 'yyyy-MM-dd');
  return format(now, 'yyyy-MM-dd'); // daily
}
