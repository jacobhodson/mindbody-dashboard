import { ok, err, CORS } from './utils/mb-auth.js';
// Reads the Supabase Mindbody mirror (synced by scheduled-mb-mirror.js), never Mindbody itself.
import { getMirrorToken as getStaffToken, mirrorGet as mbGet } from './utils/mb-mirror.js';
import { loadAttendanceRules, classCounts } from './utils/attendance-rules.js';
import {
  subDays, format, parseISO,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  subMonths, subWeeks,
  eachDayOfInterval,
} from 'date-fns';

/**
 * Supported period values (passed as ?period=xxx):
 *   7days         – last 7 full days, not including today (default)
 *   calendarWeek  – Sun–Sat of last calendar week
 *   lastMonth     – 1st–last of previous month
 *   weekToDate    – Monday of current week → today
 *   monthToDate   – 1st of current month → today
 */
function getDateRange(period) {
  const now = new Date();
  switch (period) {
    case 'calendarWeek': {
      const s = startOfWeek(subWeeks(now, 1), { weekStartsOn: 0 });
      const e = endOfWeek(subWeeks(now, 1),   { weekStartsOn: 0 });
      return { start: s, end: e };
    }
    case 'lastMonth': {
      return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
    }
    case 'weekToDate': {
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: now };
    }
    case 'monthToDate': {
      return { start: startOfMonth(now), end: now };
    }
    case '7days':
    default:
      return { start: subDays(now, 7), end: subDays(now, 1) };
  }
}

const DOW_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Fetch every class in [start, end], paginating the Mindbody /class/classes list.
async function fetchClassesInRange(token, start, end) {
  const startStr = format(start, "yyyy-MM-dd'T'00:00:00");
  const endStr   = format(end,   "yyyy-MM-dd'T'23:59:59");

  let allClasses = [];
  let offset = 0;
  while (true) {
    const data = await mbGet('/class/classes', token, {
      StartDateTime: startStr,
      EndDateTime: endStr,
      Limit: 200,
      Offset: offset,
    });
    const classes = data.Classes || [];
    allClasses = allClasses.concat(classes);
    if (classes.length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return allClasses;
}

// 4-week rolling day-of-week average over the 28 days ending yesterday,
// from the same mirrored class list (and the same Settings → Attendance
// class filter) as the selected period, so the two always agree. Used to
// read the client_class_visits ledger, which carries no class type and so
// couldn't honour the setting; the mirror syncs hourly, so the old
// "anchor to the ledger's latest synced date" guard isn't needed.
// Returns { Mon: avg, ... }.
async function rollingAvgByDow(token, rules) {
  const anchor    = subDays(new Date(), 1);
  const rollStart = subDays(anchor, 27);
  const classes   = (await fetchClassesInRange(token, rollStart, anchor)).filter((c) => classCounts(rules, c));

  const visits = {};
  for (const cls of classes) {
    if (!cls.StartDateTime) continue;
    const dow = format(parseISO(cls.StartDateTime), 'EEE');
    visits[dow] = (visits[dow] || 0) + (cls.TotalBooked || 0);
  }
  const occurrences = {};
  for (const d of eachDayOfInterval({ start: rollStart, end: anchor })) {
    const dow = format(d, 'EEE');
    occurrences[dow] = (occurrences[dow] || 0) + 1;
  }
  const out = {};
  for (const dow of DOW_ORDER) {
    if (occurrences[dow]) out[dow] = Math.round((visits[dow] || 0) / occurrences[dow]);
  }
  return out;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const period = event.queryStringParameters?.period || '7days';
    const { start, end } = getDateRange(period);

    const [token, rules] = await Promise.all([getStaffToken(), loadAttendanceRules()]);
    // Settings → Attendance: class types unticked there don't count.
    const [periodClasses, rollingAvg] = await Promise.all([
      fetchClassesInRange(token, start, end),
      rollingAvgByDow(token, rules),
    ]);
    const allClasses = periodClasses.filter((c) => classCounts(rules, c));

    // Aggregate by date, day-of-week, and (day-of-week + class) for the
    // "which classes drove this?" breakdown.
    const byDate      = {};
    const byDow       = {};
    const classByDow  = {}; // dow -> Map(className -> { visits, sessions })

    for (const cls of allClasses) {
      if (!cls.StartDateTime) continue;
      const d    = parseISO(cls.StartDateTime);
      const key  = format(d, 'yyyy-MM-dd');
      const dow  = format(d, 'EEE');
      const name = cls.ClassDescription?.Name || cls.Name || 'Class';
      const booked = cls.TotalBooked || 0;

      byDate[key] = (byDate[key] || 0) + booked;
      byDow[dow]  = (byDow[dow]  || 0) + booked;

      if (!classByDow[dow]) classByDow[dow] = new Map();
      const entry = classByDow[dow].get(name) || { visits: 0, sessions: 0 };
      entry.visits += booked;
      entry.sessions += 1;
      classByDow[dow].set(name, entry);
    }

    // Build a complete daily series with 0-fill for empty days
    const days = eachDayOfInterval({ start, end });
    const daily = days.map((d) => {
      const key   = format(d, 'yyyy-MM-dd');
      const label = format(d, 'MMM d');
      return { date: key, label, visits: byDate[key] || 0 };
    });

    const occurrencesByDow = {};
    for (const d of days) {
      const dow = format(d, 'EEE');
      occurrencesByDow[dow] = (occurrencesByDow[dow] || 0) + 1;
    }

    const byDowArr = DOW_ORDER.map((day) => {
      const occurrences = occurrencesByDow[day] || 0;
      const visits = byDow[day] || 0;
      const topClasses = [...(classByDow[day]?.entries() || [])]
        .map(([name, v]) => ({ name, visits: v.visits, sessions: v.sessions }))
        .sort((a, b) => b.visits - a.visits)
        .slice(0, 5);
      return {
        day,
        visits,
        occurrences,
        avg: occurrences > 0 ? Math.round(visits / occurrences) : 0,
        rollingAvg28: rollingAvg[day] ?? null,
        topClasses,
      };
    });

    const total  = daily.reduce((s, d) => s + d.visits, 0);
    const avgDay = daily.length > 0 ? Math.round(total / daily.length) : 0;
    const peak   = daily.reduce((m, d) => d.visits > m.visits ? d : m, { visits: 0, label: '–' });

    return ok({
      period,
      daily,
      byDow: byDowArr,
      stats: {
        total7: total,
        avgDaily: avgDay,
        peakDay: peak.label,
        peakVisits: peak.visits,
        dateRange: `${format(start, 'dd MMM')} – ${format(end, 'dd MMM yyyy')}`,
      },
    });
  } catch (e) {
    console.error('mb-attendance:', e);
    return err(e.message);
  }
};
