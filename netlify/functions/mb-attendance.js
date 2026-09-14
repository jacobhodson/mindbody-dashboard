import { createClient } from '@supabase/supabase-js';
import { getStaffToken, mbGet, ok, err, CORS } from './utils/mb-auth.js';
import {
  subDays, format, parseISO,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  subMonths, subWeeks,
  eachDayOfInterval,
} from 'date-fns';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Supported period values (passed as ?period=xxx):
 *   7days         – rolling last 7 days (default)
 *   calendarWeek  – Mon–Sun of last calendar week
 *   lastMonth     – 1st–last of previous month
 *   weekToDate    – Monday of current week → today
 *   monthToDate   – 1st of current month → today
 */
function getDateRange(period) {
  const now = new Date();
  switch (period) {
    case 'calendarWeek': {
      const s = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      const e = endOfWeek(subWeeks(now, 1),   { weekStartsOn: 1 });
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
      return { start: subDays(now, 6), end: now };
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

// 4-week rolling day-of-week average, sourced from the `client_class_visits`
// ledger (synced nightly by scheduled-client-sync.js) rather than a second
// live Mindbody fetch — one cheap Supabase query instead of doubling the
// Mindbody API calls on every period switch. Each visit row is one booking
// on one class, so a plain row count per day is the same unit as the
// TotalBooked sum used for `visits` elsewhere in this file.
//
// Anchored to the ledger's own latest synced date rather than "today": if
// the nightly sync ever falls behind, the window slides back with it
// instead of silently diluting the average with empty not-yet-synced days.
// Returns { Mon: avg, ... } with a day omitted entirely if it never occurs
// in the window (shouldn't happen at 28 days, but keeps this defensive).
async function rollingAvgByDowFromLedger() {
  const { data: latestRow, error: latestErr } = await supabase
    .from('client_class_visits')
    .select('class_date')
    .order('class_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr || !latestRow?.class_date) return {};

  const anchor    = parseISO(latestRow.class_date);
  const rollStart = subDays(anchor, 27);

  // Paginate — PostgREST caps a single request at 1000 rows, and a 28-day
  // window across the whole roster comfortably exceeds that (same pattern
  // as scheduled-client-sync.js's roster fetch).
  const visits = {};
  let from = 0;
  while (true) {
    const { data: rows, error } = await supabase
      .from('client_class_visits')
      .select('class_date')
      .gte('class_date', format(rollStart, 'yyyy-MM-dd'))
      .lte('class_date', format(anchor, 'yyyy-MM-dd'))
      .range(from, from + 999);
    if (error || !rows) return {};

    for (const row of rows) {
      const dow = format(parseISO(row.class_date), 'EEE');
      visits[dow] = (visits[dow] || 0) + 1;
    }
    if (rows.length < 1000) break;
    from += 1000;
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

    const [token, rollingAvgByDow] = await Promise.all([
      getStaffToken(),
      rollingAvgByDowFromLedger(),
    ]);
    const allClasses = await fetchClassesInRange(token, start, end);

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
        rollingAvg28: rollingAvgByDow[day] ?? null,
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
