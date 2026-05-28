/**
 * Returns two datasets in one call (shares the same class-visit queries):
 *   inactiveClients  – attended 8-14 days ago but NOT in the last 7 days
 *   fringeSegments   – clients who DID attend in last 7 days, segmented by frequency
 *
 * Algorithm:
 *  1. Fetch classes for last 14 days that had at least 1 booking
 *  2. In parallel batches, fetch visits per class
 *  3. Build setA (visited days 8-14) and setB (visited days 0-7, with count)
 *  4. inactive = in setA but NOT in setB
 *  5. fringe segments = setB bucketed by visit count
 */
import { getStaffToken, mbGet, ok, err, CORS } from './utils/mb-auth.js';
import { subDays, format, parseISO, isAfter, isBefore } from 'date-fns';

const BATCH = 10; // parallel visit requests per batch

async function getClasses(token, startStr, endStr) {
  let all = [];
  let offset = 0;
  while (true) {
    const data = await mbGet('/class/classes', token, {
      StartDateTime: startStr,
      EndDateTime: endStr,
      Limit: 200,
      Offset: offset,
    });
    const classes = (data.Classes || []).filter((c) => (c.TotalBooked || 0) > 0);
    all = all.concat(classes);
    if ((data.Classes || []).length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return all;
}

async function getVisits(token, classId) {
  try {
    const data = await mbGet('/class/classvisits', token, { ClassID: classId });
    return (data.Visits || []).filter((v) => !v.Cancelled);
  } catch {
    return [];
  }
}

function clientKey(visit) {
  return visit.ClientId || visit.Client?.Id || null;
}

function clientInfo(visit, existing) {
  if (existing) return existing;
  const c = visit.Client || {};
  return {
    id: String(visit.ClientId || c.Id || ''),
    name: `${c.FirstName || ''} ${c.LastName || ''}`.trim(),
    email: c.Email || '',
    phone: c.MobilePhone || c.HomePhone || '',
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getStaffToken();
    const now = new Date();

    // Boundary timestamps
    const boundary7  = subDays(now, 7);   // start of "this week" window
    const boundary14 = subDays(now, 14);  // start of "last week" window

    const start14 = format(boundary14, "yyyy-MM-dd'T'00:00:00");
    const end     = format(now,        "yyyy-MM-dd'T'23:59:59");

    const allClasses = await getClasses(token, start14, end);

    // setA: clients who visited 8-14 days ago  { id -> clientInfo }
    // setB: clients who visited in last 7 days  { id -> { info, count } }
    const setA = {};
    const setB = {};

    for (let i = 0; i < allClasses.length; i += BATCH) {
      const batch = allClasses.slice(i, i + BATCH);
      const visitArrays = await Promise.allSettled(
        batch.map((cls) => getVisits(token, cls.Id))
      );

      batch.forEach((cls, idx) => {
        if (visitArrays[idx].status !== 'fulfilled') return;
        const classDate = parseISO(cls.StartDateTime);
        const inWeek1 = isAfter(classDate, boundary7);                              // last 7 days
        const inWeek2 = !inWeek1 && isAfter(classDate, boundary14);                // 8-14 days ago

        for (const visit of visitArrays[idx].value) {
          const id = String(clientKey(visit) || '');
          if (!id) continue;

          if (inWeek1) {
            if (!setB[id]) setB[id] = { info: clientInfo(visit, null), count: 0 };
            setB[id].count++;
            setB[id].info = clientInfo(visit, setB[id].info);
          }
          if (inWeek2 && !setA[id]) {
            setA[id] = clientInfo(visit, null);
          }
        }
      });
    }

    // Inactive: in setA but not setB
    const inactiveClients = Object.entries(setA)
      .filter(([id]) => !setB[id])
      .map(([, info]) => info)
      .sort((a, b) => a.name.localeCompare(b.name));

    // Fringe segments from setB
    const churning  = [];  // was here last week (setA) and also this week but only 0 (edge case — covered by inactive)
    const atRisk    = [];  // 1 session this week
    const moderate  = [];  // 2–3 sessions
    const engaged   = [];  // 4+ sessions

    for (const [id, { info, count }] of Object.entries(setB)) {
      const row = { ...info, sessionsThisWeek: count };
      if (count === 1)       atRisk.push(row);
      else if (count <= 3)   moderate.push(row);
      else                   engaged.push(row);
    }

    // Also surface setA clients with 0 visits this week as "churning" in fringe
    for (const [id, info] of Object.entries(setA)) {
      if (!setB[id]) churning.push({ ...info, sessionsThisWeek: 0 });
    }

    return ok({
      inactiveClients: inactiveClients.slice(0, 150),
      fringeSegments: {
        churning:  { count: churning.length,  clients: churning.slice(0, 50) },
        atRisk:    { count: atRisk.length,    clients: atRisk.slice(0, 50) },
        moderate:  { count: moderate.length,  clients: moderate.slice(0, 50) },
        engaged:   { count: engaged.length,   clients: engaged.slice(0, 50) },
      },
      summary: {
        inactiveCount:    inactiveClients.length,
        visitedThisWeek:  Object.keys(setB).length,
        totalTracked:     Object.keys(setA).length + Object.keys(setB).length,
      },
    });
  } catch (e) {
    console.error('mb-client-analytics:', e);
    return err(e.message);
  }
};
