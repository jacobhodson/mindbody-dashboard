import { format, parseISO, subDays, subWeeks, subMonths } from 'date-fns';
import { periodStartFor, periodEndFor } from './periods.js';

/**
 * Scoreboard period windows. `view` is 'weekly' | 'monthly' | 'rolling30';
 * `anchor` (yyyy-MM-dd) is the day the Scorecard's date navigator points at
 * (today for the current period, else that period's last day).
 *
 * Every window is { start, end, label, shortLabel, inProgress } with start/
 * end as inclusive yyyy-MM-dd strings. Rolling 30 days = the 30 days ending
 * on the anchor; table columns step back in non-overlapping 30-day blocks.
 */
export const SCOREBOARD_VIEWS = [
  { key: 'weekly',    label: 'Week' },
  { key: 'monthly',   label: 'Month' },
  { key: 'rolling30', label: 'Rolling 30 days' },
];

function windowFor(view, anchorDate, today) {
  if (view === 'rolling30') {
    const end = format(anchorDate, 'yyyy-MM-dd');
    const start = format(subDays(anchorDate, 29), 'yyyy-MM-dd');
    return {
      start, end,
      label: `${format(parseISO(start), 'd MMM')} – ${format(parseISO(end), 'd MMM')}`,
      shortLabel: `${format(parseISO(start), 'd MMM')} – ${format(parseISO(end), 'd MMM')}`,
      inProgress: end >= today,
    };
  }
  const start = periodStartFor(view, anchorDate);
  const end = periodEndFor(view, start);
  const s = parseISO(start);
  return {
    start, end,
    label: view === 'weekly' ? `Week of ${format(s, 'd MMM')}` : format(s, 'MMMM yyyy'),
    shortLabel: view === 'weekly' ? format(s, 'd MMM') : format(s, 'MMM yyyy'),
    inProgress: end >= today,
  };
}

export function scoreboardWindow(view, anchor) {
  const today = format(new Date(), 'yyyy-MM-dd');
  return windowFor(view, parseISO(anchor), today);
}

// `count` windows ending with the anchor's, oldest first (table columns).
export function scoreboardWindows(view, anchor, count = 6) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const a = parseISO(anchor);
  const step = (i) => (view === 'weekly' ? subWeeks(a, i) : view === 'monthly' ? subMonths(a, i) : subDays(a, 30 * i));
  return Array.from({ length: count }, (_, i) => windowFor(view, step(count - 1 - i), today));
}

// The target to judge a window against. Weekly/monthly use that cadence's
// target row. Rolling 30 uses the monthly target, falling back to the
// weekly target scaled to 30 days when a metric only has a weekly one.
export function targetValueFor(metric, view) {
  if (view === 'weekly')  return metric.weeklyTarget ? Number(metric.weeklyTarget.target_value) : null;
  if (view === 'monthly') return metric.monthlyTarget ? Number(metric.monthlyTarget.target_value) : null;
  if (metric.monthlyTarget) return Number(metric.monthlyTarget.target_value);
  if (metric.weeklyTarget)  return Math.round((Number(metric.weeklyTarget.target_value) * 30) / 7);
  return null;
}
