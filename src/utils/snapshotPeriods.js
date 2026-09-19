import { format, startOfMonth, endOfMonth, startOfDay, subDays } from 'date-fns';

// Period keys for the snapshot-backed views (LER table, Group/PT tables'
// Rolling 30 / Month options, Team tab): 'rolling30', or 'm:yyyy-MM' for a
// specific calendar month.
export const ROLLING_KEY = 'rolling30';

export const isSnapshotPeriod = (key) => key === ROLLING_KEY || (typeof key === 'string' && key.startsWith('m:'));

export const monthKeyFor = (date) => `m:${format(date, 'yyyy-MM')}`;

// 'm:2026-08' -> '2026-08-01' (the ler_monthly.month value)
export const monthDateOf = (key) => `${key.slice(2)}-01`;

export function periodLabel(key) {
  if (key === ROLLING_KEY) return 'Rolling 30 days';
  return format(new Date(`${monthDateOf(key)}T00:00:00`), 'MMMM yyyy');
}

// Months of `year` up to and including the current one, newest first.
export function monthOptions(year, now = new Date()) {
  const last = now.getFullYear() === year ? now.getMonth() : 11;
  const out = [];
  for (let m = last; m >= 0; m--) out.push({ key: monthKeyFor(new Date(year, m, 1)), label: format(new Date(year, m, 1), 'MMMM yyyy') });
  return out;
}

// The stored row for one coach in a snapshot period, normalised to the same
// shape whether it came from ler_monthly or coach_rolling30.
export function snapshotRowFor(key, staffId, monthlyRows, rollingLatest) {
  if (key === ROLLING_KEY) return rollingLatest?.[staffId] || null;
  const monthStr = monthDateOf(key);
  return monthlyRows.find((r) => r.staff_id === staffId && r.month === monthStr) || null;
}

// The Date range a snapshot period covers — used to line task-completion
// stats up with the same window (task_completions isn't snapshotted, it's
// already historical, so it's just queried for whatever range is selected).
export function periodRange(key, now = new Date()) {
  if (key === ROLLING_KEY) return { start: startOfDay(subDays(now, 29)), end: now };
  const start = startOfMonth(new Date(`${monthDateOf(key)}T00:00:00`));
  // Clamped to now — viewing the current month shouldn't count days that
  // haven't happened yet as missed tasks.
  const monthEnd = endOfMonth(start);
  return { start, end: monthEnd < now ? monthEnd : now };
}
