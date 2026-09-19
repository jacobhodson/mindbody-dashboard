import {
  format, startOfWeek, startOfMonth,
  addDays, addWeeks, addMonths,
  endOfWeek, endOfMonth, setDate, getDaysInMonth,
  eachDayOfInterval,
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

/**
 * The period_start to use for a given template's *current* occurrence —
 * 'once' tasks aren't derived from "now" at all, they're pinned to their own
 * due_date, so this is the one place that needs the template, not just the
 * cadence, to compute the right bucket.
 */
export function periodStartForTemplate(template, now = new Date()) {
  if (template.cadence === 'once') return template.due_date;
  return periodStartFor(template.cadence, now);
}

/**
 * The display due date for a template's current period — yyyy-MM-dd.
 * Defaults to the end of the period (Sunday / last day of month) unless
 * `due_day` overrides it (1-7 Mon..Sun for weekly, 1-31 for monthly, clamped
 * to however many days that particular month actually has).
 */
export function dueDateFor(template, now = new Date()) {
  if (template.cadence === 'once') return template.due_date;

  const periodStart = periodStartFor(template.cadence, now);
  if (template.cadence === 'daily') return periodStart;

  if (template.cadence === 'weekly') {
    if (!template.due_day) return periodEndFor('weekly', periodStart);
    return format(addDays(new Date(`${periodStart}T00:00:00`), template.due_day - 1), 'yyyy-MM-dd');
  }

  // monthly
  if (!template.due_day) return periodEndFor('monthly', periodStart);
  const start = new Date(`${periodStart}T00:00:00`);
  const day = Math.min(template.due_day, getDaysInMonth(start));
  return format(setDate(start, day), 'yyyy-MM-dd');
}

/**
 * Every distinct period_start a template would actually record within
 * [rangeStart, rangeEnd] (both Dates) — used by the Team tab to compute
 * "expected vs completed" for a given month. Derived per-day via
 * periodStartFor rather than calendar math (eachWeekOfInterval etc.), so a
 * weekly task whose period spans a month boundary is counted exactly the
 * way it's really stored (a week logged anywhere in it always keys off
 * that week's Monday, even when the Monday itself falls in the prior
 * month) — no separate boundary-splitting logic needed.
 *
 * A template's own created_at clamps the start — a task created partway
 * through the month was never missable before it existed.
 */
export function periodsInRange(template, rangeStart, rangeEnd) {
  if (template.cadence === 'once') {
    if (!template.due_date) return [];
    const due = new Date(`${template.due_date}T00:00:00`);
    return due >= rangeStart && due <= rangeEnd ? [template.due_date] : [];
  }

  const createdAt = template.created_at ? new Date(template.created_at) : null;
  const effectiveStart = createdAt && createdAt > rangeStart ? createdAt : rangeStart;
  if (effectiveStart > rangeEnd) return [];

  const days = eachDayOfInterval({ start: effectiveStart, end: rangeEnd });
  return [...new Set(days.map((d) => periodStartFor(template.cadence, d)))];
}
