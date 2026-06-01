/**
 * Returns inactive clients (visited last week, not this week) and fringe segments
 * (clients who DID visit this week, bucketed by frequency).
 *
 * Key structure from Mindbody classvisits endpoint:
 *   GET /class/classvisits → { Class: { Visits: [...] } }   (NOT data.Visits)
 *   Each visit has: ClientId (string), SignedIn (bool), LateCancelled (bool)
 *   Client names fetched separately via GET /site/clients?clientIds=...
 */
import { getStaffToken, mbGet, ok, err, CORS } from './utils/mb-auth.js';
import { subDays, format, parseISO, isAfter } from 'date-fns';

const BATCH = 8;

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
    // ⚠️ Correct path: data.Class.Visits (not data.Visits)
    return (data.Class?.Visits || []).filter((v) => v.SignedIn === true && !v.LateCancelled);
  } catch {
    return [];
  }
}

async function getAllClients(token) {
  const clientMap = {};
  let offset = 0;
  while (true) {
    const data = await mbGet('/client/clients', token, {
      ActiveOnly: false,
      Limit: 200,
      Offset: offset,
    });
    const clients = data.Clients || [];
    for (const c of clients) {
      clientMap[String(c.Id)] = {
        id: String(c.Id),
        name: `${c.FirstName || ''} ${c.LastName || ''}`.trim(),
        email: c.Email || '',
        phone: c.MobilePhone || c.HomePhone || '',
      };
    }
    if (clients.length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return clientMap;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getStaffToken();
    const now = new Date();
    const boundary7  = subDays(now, 7);
    const boundary14 = subDays(now, 14);

    const start14 = format(boundary14, "yyyy-MM-dd'T'00:00:00");
    const end     = format(now,        "yyyy-MM-dd'T'23:59:59");

    const allClasses = await getClasses(token, start14, end);

    // setA: client IDs who visited 8-14 days ago
    // setB: client IDs who visited in last 7 days { id -> count }
    const setA = new Set();
    const setB = {};

    for (let i = 0; i < allClasses.length; i += BATCH) {
      const batch = allClasses.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map((cls) => getVisits(token, cls.Id))
      );

      batch.forEach((cls, idx) => {
        if (results[idx].status !== 'fulfilled') return;
        const classDate = parseISO(cls.StartDateTime);
        const inThisWeek = isAfter(classDate, boundary7);
        const inLastWeek = !inThisWeek && isAfter(classDate, boundary14);

        for (const visit of results[idx].value) {
          const id = String(visit.ClientId || '');
          if (!id) continue;
          if (inThisWeek) {
            setB[id] = (setB[id] || 0) + 1;
          }
          if (inLastWeek) {
            setA.add(id);
          }
        }
      });
    }

    // Fetch client details for all IDs we've seen
    const allIds = [...new Set([...setA, ...Object.keys(setB)])];
    const clientMap = await getAllClients(token);

    function clientRow(id, extra = {}) {
      const c = clientMap[id] || { id, name: `Client ${id}`, email: '', phone: '' };
      return { ...c, ...extra };
    }

    // Inactive: visited last week but not this week
    const inactiveClients = [...setA]
      .filter((id) => !setB[id])
      .map((id) => clientRow(id))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Fringe segments from this week's visitors
    const churning = [...setA].filter((id) => !setB[id]).map((id) => clientRow(id, { sessionsThisWeek: 0 }));
    const atRisk   = Object.entries(setB).filter(([, c]) => c === 1).map(([id, c]) => clientRow(id, { sessionsThisWeek: c }));
    const moderate = Object.entries(setB).filter(([, c]) => c >= 2 && c <= 3).map(([id, c]) => clientRow(id, { sessionsThisWeek: c }));
    const engaged  = Object.entries(setB).filter(([, c]) => c >= 4).map(([id, c]) => clientRow(id, { sessionsThisWeek: c }));

    return ok({
      inactiveClients: inactiveClients.slice(0, 150),
      fringeSegments: {
        churning:  { count: churning.length,  clients: churning.slice(0, 50) },
        atRisk:    { count: atRisk.length,    clients: atRisk.slice(0, 50) },
        moderate:  { count: moderate.length,  clients: moderate.slice(0, 50) },
        engaged:   { count: engaged.length,   clients: engaged.slice(0, 50) },
      },
      summary: {
        inactiveCount:   inactiveClients.length,
        visitedThisWeek: Object.keys(setB).length,
        totalTracked:    allIds.length,
      },
    });
  } catch (e) {
    console.error('mb-client-analytics:', e);
    return err(e.message);
  }
};
