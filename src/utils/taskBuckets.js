import { format, addDays, addWeeks, startOfWeek, endOfWeek, endOfMonth, startOfMonth, addMonths } from 'date-fns';

/**
 * Home task list / board grouping by when a task is due — replaces the old
 * by-cadence sections. Each task's date is dueDateFor() (a one-off's own
 * due_date; a recurring task's due day in its current period), so one-offs
 * sit alongside the recurring tasks due the same week.
 *
 * Overdue = not done and due before today; it always comes first. A done
 * task from a past day stays in its own bucket (this week), or drops to
 * "Completed earlier" once it's from before this week.
 */
export const TASK_BUCKETS = [
  { key: 'overdue',    label: 'Overdue',    tone: 'red' },
  { key: 'today',      label: 'Today' },
  { key: 'this_week',  label: 'This week' },
  { key: 'next_week',  label: 'Next week' },
  { key: 'this_month', label: 'This month' },
  { key: 'later',      label: 'Later' },
  { key: 'none',       label: 'No due date' },
  { key: 'done_earlier', label: 'Completed earlier', listOnly: true },
];

const ymd = (d) => format(d, 'yyyy-MM-dd');

// Boundaries for "now" — weeks run Monday–Sunday, as everywhere else.
export function bucketBounds(now = new Date()) {
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  return {
    today:        ymd(now),
    weekStart:    ymd(weekStart),
    weekEnd:      ymd(endOfWeek(now, { weekStartsOn: 1 })),
    nextWeekStart: ymd(addWeeks(weekStart, 1)),
    nextWeekEnd:  ymd(endOfWeek(addWeeks(weekStart, 1), { weekStartsOn: 1 })),
    monthEnd:     ymd(endOfMonth(now)),
    nextMonthStart: ymd(startOfMonth(addMonths(now, 1))),
  };
}

export function bucketFor(dueDate, done, b = bucketBounds()) {
  if (!dueDate) return 'none';
  if (!done && dueDate < b.today) return 'overdue';
  if (dueDate === b.today) return 'today';
  if (dueDate < b.weekStart) return 'done_earlier';
  if (dueDate <= b.weekEnd) return 'this_week';
  if (dueDate <= b.nextWeekEnd) return 'next_week';
  if (dueDate <= b.monthEnd) return 'this_month';
  return 'later';
}

// The due date a one-off gets when dropped on a board column, or undefined
// if that column can't take a drop (Overdue; or This month when the rest of
// the month is already inside next week). null = clear the due date.
export function dropDateFor(bucket, b = bucketBounds()) {
  switch (bucket) {
    case 'today':      return b.today;
    case 'this_week':  return b.weekEnd;
    case 'next_week':  return b.nextWeekStart;
    case 'this_month': return b.monthEnd > b.nextWeekEnd ? b.monthEnd : undefined;
    // First day past both next week and this month.
    case 'later':
      return b.monthEnd > b.nextWeekEnd
        ? b.nextMonthStart
        : ymd(addDays(new Date(`${b.nextWeekEnd}T00:00:00`), 1));
    case 'none':       return null;
    default:           return undefined;
  }
}
