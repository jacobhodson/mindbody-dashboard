import {
  format, startOfWeek, startOfMonth,
  addDays, addWeeks, addMonths,
  endOfWeek, endOfMonth,
} from 'date-fns';

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

/**
 * Same as periodStartFor, but offset by `offset` whole periods (0 = current,
 * -1 = the previous day/week/month, +1 = next). Used by the Scorecard's
 * back/forward navigation.
 */
export function periodStartForOffset(cadence, offset, now = new Date()) {
  if (cadence === 'weekly')  return periodStartFor(cadence, addWeeks(now, offset));
  if (cadence === 'monthly') return periodStartFor(cadence, addMonths(now, offset));
  return periodStartFor(cadence, addDays(now, offset));
}

/** The last day (inclusive) of the period that starts on periodStart. */
export function periodEndFor(cadence, periodStart) {
  const start = new Date(`${periodStart}T00:00:00`);
  if (cadence === 'weekly')  return format(endOfWeek(start, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  if (cadence === 'monthly') return format(endOfMonth(start), 'yyyy-MM-dd');
  return periodStart; // daily
}

/** Human label for a period, e.g. "Mon 1 Sep", "Week of 25 Aug", "August 2026". */
export function periodLabel(cadence, periodStart) {
  const start = new Date(`${periodStart}T00:00:00`);
  if (cadence === 'weekly')  return `Week of ${format(start, 'd MMM')}`;
  if (cadence === 'monthly') return format(start, 'MMMM yyyy');
  return format(start, 'EEE d MMM');
}
