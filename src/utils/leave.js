import { format, parseISO, addDays, differenceInCalendarDays, isWeekend } from 'date-fns';

// Two leave categories, matching Xero Payroll's "Annual Leave" and
// "Personal/Carer's Leave" balances. Personal covers sick, carer's,
// compassionate and anything else. Class strings are written out in full so
// Tailwind's JIT keeps them.
export const LEAVE_TYPES = [
  { key: 'annual',   label: 'Annual Leave',   short: 'Annual',   letter: 'A', hint: 'Holidays, time away',                   bar: 'bg-sky-500',  soft: 'bg-sky-100 text-sky-800 border-sky-300',   dot: 'bg-sky-500' },
  { key: 'personal', label: 'Personal Leave', short: 'Personal', letter: 'P', hint: "Sick, carer's, compassionate, other",   bar: 'bg-rose-500', soft: 'bg-rose-100 text-rose-800 border-rose-300', dot: 'bg-rose-500' },
];
export const LEAVE_TYPE_BY_KEY = Object.fromEntries(LEAVE_TYPES.map((t) => [t.key, t]));
export const typeMeta = (key) => LEAVE_TYPE_BY_KEY[key] || LEAVE_TYPE_BY_KEY.personal;

// Xero balances are in hours; days are shown at the standard 7.6-hour day.
export const HOURS_PER_DAY = 7.6;

export const LEAVE_STATUSES = [
  { key: 'pending',  label: 'Pending',  pill: 'bg-amber-100 text-amber-800 border-amber-300' },
  { key: 'approved', label: 'Approved', pill: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { key: 'declined', label: 'Declined', pill: 'bg-gray-100 text-gray-500 border-gray-300' },
];
export const STATUS_BY_KEY = Object.fromEntries(LEAVE_STATUSES.map((s) => [s.key, s]));

export const iso = (d) => format(d, 'yyyy-MM-dd');
export const todayIso = () => iso(new Date());

/** Every date (as ISO strings) from `from` to `to` inclusive. */
export function daysBetween(from, to) {
  const start = parseISO(from);
  const n = differenceInCalendarDays(parseISO(to), start);
  const out = [];
  for (let i = 0; i <= n; i++) out.push(iso(addDays(start, i)));
  return out;
}

/** Mon–Fri count between two dates — the default "work days" for a request. */
export function weekdayCount(from, to) {
  if (!from || !to || to < from) return 0;
  return daysBetween(from, to).filter((d) => !isWeekend(parseISO(d))).length;
}

/** Does a request touch any day in [from, to]? (ISO strings compare correctly.) */
export const overlaps = (r, from, to) => r.start_date <= to && r.end_date >= from;

/** Requests (not declined) covering one date. */
export const awayOn = (requests, day) =>
  requests.filter((r) => r.status !== 'declined' && r.start_date <= day && r.end_date >= day);

export function formatRange(r) {
  const s = parseISO(r.start_date);
  const e = parseISO(r.end_date);
  if (r.start_date === r.end_date) return format(s, 'EEE d MMM yyyy');
  if (s.getFullYear() !== e.getFullYear()) return `${format(s, 'd MMM yyyy')} – ${format(e, 'd MMM yyyy')}`;
  if (s.getMonth() !== e.getMonth()) return `${format(s, 'd MMM')} – ${format(e, 'd MMM yyyy')}`;
  return `${format(s, 'd')} – ${format(e, 'd MMM yyyy')}`;
}

/** "Next up" order: on now / upcoming soonest first, then past most-recent first. */
export function nextUpCompare(a, b, today = todayIso()) {
  const aPast = a.end_date < today;
  const bPast = b.end_date < today;
  if (aPast !== bPast) return aPast ? 1 : -1;
  return aPast ? b.start_date.localeCompare(a.start_date) : a.start_date.localeCompare(b.start_date);
}

/** People who appear in the planner: active staff, minus the generic admin login. */
export const plannerStaff = (staffList) => staffList.filter((s) => s.is_coach !== false);
