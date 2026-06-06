/**
 * GET /api/mb-pt-analytics
 *
 * Returns data for the Personal Training tab:
 *   stats         – PT and SP session counts across 4 time windows
 *   ptReds        – clients who had PT/SP last week but not this week
 *   openGym       – clients with 1+ open-gym sessions this week
 *   unchecked     – past PT/SP sessions still in "Booked" status (not checked off)
 *   sessionCredits– clients with accumulated unused PT/SP session credits
 *
 * Session types are matched by keywords against SessionTypeName / ServiceName.
 * Requires no extra env vars — uses the same Mindbody token as other functions.
 */
import { getStaffToken, mbGet, ok, err, CORS } from './utils/mb-auth.js';
import {
  subDays, format, parseISO,
  startOfMonth, endOfMonth, endOfDay, subMonths,
} from 'date-fns';

const SKIP_STATUS = new Set(['NoShow', 'LateCancelled', 'Cancelled']);
const CREDIT_BATCH = 10;

// ─── Session-type classifier ─────────────────────────────────────────────────
// Returns 'pt' | 'sp' | 'gym' | 'other'
function classify(name = '') {
  const s = name.toLowerCase();
  if (
    /personal\s*train/.test(s) ||
    /\bpt\b/.test(s)           ||
    /\bpt\d/.test(s)           ||   // PT1, PT2, PT3
    /1[:\s]1/.test(s)          ||   // 1:1 or 1 1
    /1on1/.test(s)
  ) return 'pt';

  if (
    /semi.?private/.test(s)   ||
    /\bsp\b/.test(s)          ||
    /\bsp\d/.test(s)          ||   // SP1, SP2, SP3
    /small.?private/.test(s)  ||
    /partner.?train/.test(s)  ||
    /2:1/.test(s)             ||
    /3:1/.test(s)
  ) return 'sp';

  if (
    /open.?gym/.test(s)       ||
    /open.?train/.test(s)     ||
    /gym.?access/.test(s)
  ) return 'gym';

  return 'other';
}

// ─── Appointment fetcher ─────────────────────────────────────────────────────
// Returns { appts, firstPageRaw } so the handler can expose the raw shape in _debug
async function fetchAppointments(token, startDate, endDate) {
  let all = [];
  let offset = 0;
  let firstPageRaw = null;
  while (true) {
    const data = await mbGet('/appointment/staffappointments', token, {
      StartDate: startDate,
      EndDate:   endDate,
      Limit:     200,
      Offset:    offset,
    });
    if (firstPageRaw === null) {
      // Capture response shape: all keys + first item of any array key
      firstPageRaw = {
        keys: Object.keys(data),
        arraySizes: Object.fromEntries(
          Object.entries(data).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length])
        ),
        firstItem: (() => {
          for (const v of Object.values(data)) {
            if (Array.isArray(v) && v.length > 0) return v[0];
          }
          return null;
        })(),
      };
      console.log('[mb-pt-analytics] first page keys:', firstPageRaw.keys, 'array sizes:', firstPageRaw.arraySizes);
    }
    const appts = data.Appointments || data.StaffAppointments || [];
    all = all.concat(appts);
    if (appts.length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return { appts: all, firstPageRaw };
}

// ─── Client services fetcher (remaining PT/SP credits) ──────────────────────
async function fetchClientServices(token, clientId) {
  try {
    const data = await mbGet('/client/clientservices', token, {
      clientId,
      ActiveOnly: true,
      Limit: 50,
    });
    return data.ClientServices || [];
  } catch {
    return [];
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getStaffToken();
    const now   = new Date();

    // ── Date windows ─────────────────────────────────────────────────────
    const yesterday = endOfDay(subDays(now, 1));

    // W1 = last 7 days ending yesterday
    const w1End   = yesterday;
    const w1Start = subDays(w1End, 6);

    // W2 = 7 days before that
    const w2End   = endOfDay(subDays(w1Start, 1));
    const w2Start = subDays(w2End, 6);

    // W3 = 7 days before W2
    const w3End   = endOfDay(subDays(w2Start, 1));
    const w3Start = subDays(w3End, 6);

    // W4 = 7 days before W3
    const w4End   = endOfDay(subDays(w3Start, 1));
    const w4Start = subDays(w4End, 6);

    // Calendar windows
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd   = yesterday;
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd   = endOfMonth(subMonths(now, 1));

    // Fetch span: last month start → yesterday (covers all 4 weekly windows + months)
    const fetchStart = format(lastMonthStart, "yyyy-MM-dd'T'00:00:00");
    const fetchEnd   = format(yesterday,      "yyyy-MM-dd'T'23:59:59");

    // ── Fetch & classify ─────────────────────────────────────────────────
    const { appts: raw, firstPageRaw } = await fetchAppointments(token, fetchStart, fetchEnd);

    const appts = raw.map(a => ({
      ...a,
      _type: classify(a.SessionTypeName || a.ServiceName || ''),
      _date: parseISO(a.StartDateTime),
      _id:   String(a.ClientId),
      _name: `${a.FirstName || ''} ${a.LastName || ''}`.trim() || `Client ${a.ClientId}`,
    }));

    const ptAppts   = appts.filter(a => a._type === 'pt');
    const spAppts   = appts.filter(a => a._type === 'sp');
    const ptsp      = appts.filter(a => a._type === 'pt' || a._type === 'sp');
    const gymAppts  = appts.filter(a => a._type === 'gym');

    // ── Helpers ───────────────────────────────────────────────────────────
    function countIn(arr, start, end) {
      return arr.filter(a => !SKIP_STATUS.has(a.Status) && a._date >= start && a._date <= end).length;
    }

    function clientsIn(arr, start, end) {
      return new Set(
        arr.filter(a => !SKIP_STATUS.has(a.Status) && a._date >= start && a._date <= end).map(a => a._id)
      );
    }

    function weekCounts(arr, clientId) {
      const f = (s, e) => arr.filter(a => a._id === clientId && !SKIP_STATUS.has(a.Status) && a._date >= s && a._date <= e).length;
      return { w1: f(w1Start, w1End), w2: f(w2Start, w2End), w3: f(w3Start, w3End), w4: f(w4Start, w4End) };
    }

    // ── Stats ─────────────────────────────────────────────────────────────
    const stats = {
      pt: {
        thisWeek:  countIn(ptAppts, w1Start, w1End),
        lastWeek:  countIn(ptAppts, w2Start, w2End),
        thisMonth: countIn(ptAppts, thisMonthStart, thisMonthEnd),
        lastMonth: countIn(ptAppts, lastMonthStart, lastMonthEnd),
      },
      sp: {
        thisWeek:  countIn(spAppts, w1Start, w1End),
        lastWeek:  countIn(spAppts, w2Start, w2End),
        thisMonth: countIn(spAppts, thisMonthStart, thisMonthEnd),
        lastMonth: countIn(spAppts, lastMonthStart, lastMonthEnd),
      },
    };

    // ── PT Red's List ──────────────────────────────────────────────────────
    const thisWeekClients = clientsIn(ptsp, w1Start, w1End);
    const lastWeekClients = clientsIn(ptsp, w2Start, w2End);

    const ptReds = [...lastWeekClients]
      .filter(id => !thisWeekClients.has(id))
      .map(id => {
        const clientAppts = ptsp.filter(a => a._id === id).sort((a, b) => b._date - a._date);
        const last = clientAppts[0];
        return {
          id,
          name:             last._name,
          email:            last.Email || last.email || '',
          phone:            last.MobilePhone || last.HomePhone || '',
          service:          last.SessionTypeName || last.ServiceName || '',
          staffName:        `${last.StaffFirstName || ''} ${last.StaffLastName || ''}`.trim(),
          lastSession:      format(last._date, 'yyyy-MM-dd'),
          weeklyAttendance: weekCounts(ptsp, id),
        };
      })
      .sort((a, b) => b.lastSession.localeCompare(a.lastSession));

    // ── Open Gym (this week, 1+) ──────────────────────────────────────────
    const gymMap = {};
    for (const a of gymAppts) {
      if (SKIP_STATUS.has(a.Status) || a._date < w1Start || a._date > w1End) continue;
      if (!gymMap[a._id]) gymMap[a._id] = { id: a._id, name: a._name, email: a.Email || '', count: 0 };
      gymMap[a._id].count++;
    }
    const openGym = Object.values(gymMap).filter(c => c.count > 0).sort((a, b) => b.count - a.count);

    // ── Unchecked Sessions (past PT/SP sessions still "Booked") ───────────
    const unchecked = ptsp
      .filter(a => a._date >= w1Start && a._date <= w1End && a.Status === 'Booked')
      .map(a => ({
        id:         String(a.Id),
        clientId:   a._id,
        clientName: a._name,
        service:    a.SessionTypeName || a.ServiceName || '',
        staffName:  `${a.StaffFirstName || ''} ${a.StaffLastName || ''}`.trim(),
        startTime:  a.StartDateTime,
        type:       a._type,
      }))
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    // ── Session Credits ────────────────────────────────────────────────────
    // Fetch for unique PT/SP clients seen in last 28 days (capped at 60)
    const recentIds = [...new Set(
      ptsp.filter(a => a._date >= w4Start).map(a => a._id)
    )].slice(0, 60);

    const creditMap = {};
    for (let i = 0; i < recentIds.length; i += CREDIT_BATCH) {
      const batch = recentIds.slice(i, i + CREDIT_BATCH);
      const results = await Promise.allSettled(
        batch.map(async id => ({ id, services: await fetchClientServices(token, id) }))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') creditMap[r.value.id] = r.value.services;
      }
    }

    const sessionCredits = [];
    for (const [clientId, services] of Object.entries(creditMap)) {
      const ptSvcs = services.filter(s => {
        const t = classify(s.Name || s.ServiceName || '');
        return (t === 'pt' || t === 'sp') && (s.Remaining || 0) > 0;
      });
      if (ptSvcs.length === 0) continue;
      const total = ptSvcs.reduce((sum, s) => sum + (s.Remaining || 0), 0);
      const appt  = ptsp.find(a => a._id === clientId);
      sessionCredits.push({
        id:       clientId,
        name:     appt ? appt._name : `Client ${clientId}`,
        email:    appt?.Email || '',
        credits:  total,
        services: ptSvcs.map(s => ({ name: s.Name || s.ServiceName || '', remaining: s.Remaining || 0 })),
      });
    }
    sessionCredits.sort((a, b) => b.credits - a.credits);

    // ── Debug logging ──────────────────────────────────────────────────────
    const sampleTypes = [...new Set(raw.slice(0, 30).map(a => a.SessionTypeName || a.ServiceName).filter(Boolean))];
    console.log('[mb-pt-analytics] sample types:', sampleTypes);
    console.log(`[mb-pt-analytics] total=${raw.length} pt=${ptAppts.length} sp=${spAppts.length} gym=${gymAppts.length}`);

    return ok({ stats, ptReds, openGym, unchecked, sessionCredits, _debug: { sampleTypes, totalRaw: raw.length, fetchStart, fetchEnd, firstPageRaw } });

  } catch (e) {
    console.error('mb-pt-analytics:', e);
    return err(e.message);
  }
};
