/**
 * 28-day rolling window, split into 4 weekly buckets.
 * Returns:
 *   reds        – visited W2–W4 but NOT W1 (Red's List = inactive + churning)
 *   fringe      – visited W1, segmented by count (atRisk/moderate/engaged)
 *                 each client carries: sessionsThisWeek, trend, service, isFullyUtilising
 *   noShows     – clients with unsigned bookings in the last 7 days
 *   suspensions – clients with active SuspensionInfo or non-Active Status
 */
import { getStaffToken, mbGet, ok, err, CORS } from './utils/mb-auth.js';
import { subDays, format, parseISO, isAfter } from 'date-fns';

const BATCH = 15;

// ─── Helpers ────────────────────────────────────────────────────────────────

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
    return data.Class?.Visits || [];
  } catch {
    return [];
  }
}

async function getAllClients(token) {
  const map = {};
  let offset = 0;
  while (true) {
    const data = await mbGet('/client/clients', token, {
      ActiveOnly: false,
      Limit: 200,
      Offset: offset,
    });
    const clients = data.Clients || [];
    for (const c of clients) {
      map[String(c.Id)] = {
        id:            String(c.Id),
        name:          `${c.FirstName || ''} ${c.LastName || ''}`.trim(),
        email:         c.Email || '',
        phone:         c.MobilePhone || c.HomePhone || '',
        status:        c.Status || 'Active',
        suspensionInfo: c.SuspensionInfo || null,
        active:        c.Active !== false,
      };
    }
    if (clients.length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return map;
}

function trend(w1, w2, w3, w4) {
  const prevWeeks = [w2, w3, w4];
  const nonZero   = prevWeeks.filter((w) => w > 0);
  if (!nonZero.length) return { avg: 0, direction: 'new' };
  const avg = prevWeeks.reduce((s, w) => s + w, 0) / 3;
  const rounded = Math.round(avg * 10) / 10;
  if (w1 > avg + 0.4) return { avg: rounded, direction: 'up' };
  if (w1 < avg - 0.4) return { avg: rounded, direction: 'down' };
  return { avg: rounded, direction: 'stable' };
}

// ─── Handler ────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getStaffToken();
    const now   = new Date();

    const b7  = subDays(now, 7);
    const b14 = subDays(now, 14);
    const b21 = subDays(now, 21);
    const b28 = subDays(now, 28);

    const start = format(b28, "yyyy-MM-dd'T'00:00:00");
    const end   = format(now,  "yyyy-MM-dd'T'23:59:59");

    const allClasses = await getClasses(token, start, end);

    // Per-client data structures
    const weeks      = {};  // id → { w1, w2, w3, w4 }
    const services   = {};  // id → most-recent service name
    const noShowMap  = {};  // id → noShow count (last 7 days)

    for (let i = 0; i < allClasses.length; i += BATCH) {
      const batch   = allClasses.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map((cls) => getVisits(token, cls.Id)));

      batch.forEach((cls, idx) => {
        if (results[idx].status !== 'fulfilled') return;
        const classDate = parseISO(cls.StartDateTime);

        // Determine week bucket
        const inW1 = isAfter(classDate, b7);
        const inW2 = !inW1 && isAfter(classDate, b14);
        const inW3 = !inW1 && !inW2 && isAfter(classDate, b21);
        const inW4 = !inW1 && !inW2 && !inW3 && isAfter(classDate, b28);

        for (const visit of results[idx].value) {
          const id = String(visit.ClientId || '');
          if (!id) continue;

          if (!weeks[id]) weeks[id] = { w1: 0, w2: 0, w3: 0, w4: 0 };

          if (visit.SignedIn === true && !visit.LateCancelled) {
            if (inW1) weeks[id].w1++;
            if (inW2) weeks[id].w2++;
            if (inW3) weeks[id].w3++;
            if (inW4) weeks[id].w4++;

            // Track the most recent service name (W1 priority)
            if (inW1 && visit.ServiceName) services[id] = visit.ServiceName;
            else if (!services[id] && visit.ServiceName) services[id] = visit.ServiceName;
          }

          // No-show: booked but didn't sign in (last 7 days)
          if (inW1 && visit.SignedIn === false && !visit.LateCancelled) {
            noShowMap[id] = (noShowMap[id] || 0) + 1;
          }
        }
      });
    }

    // Fetch all clients for enrichment
    const clientMap = await getAllClients(token);

    function enrichClient(id, extra = {}) {
      const c   = clientMap[id] || { id, name: `Client ${id}`, email: '', phone: '' };
      const svc = services[id] || '';
      const w   = weeks[id]   || { w1: 0, w2: 0, w3: 0, w4: 0 };
      const t   = trend(w.w1, w.w2, w.w3, w.w4);
      const is2x        = svc.toLowerCase().includes('2x');
      const isFullyUtil = is2x && (extra.sessionsThisWeek ?? w.w1) >= 2;
      return { ...c, service: svc, trend: t, is2xMember: is2x, isFullyUtilising: isFullyUtil, ...extra };
    }

    // Red's List: visited W2–W4 but NOT W1
    const visitedW1   = new Set(Object.keys(weeks).filter((id) => weeks[id].w1 > 0));
    const visitedPrev = new Set(
      Object.keys(weeks).filter((id) => weeks[id].w2 > 0 || weeks[id].w3 > 0 || weeks[id].w4 > 0)
    );
    const reds = [...visitedPrev]
      .filter((id) => !visitedW1.has(id))
      .map((id) => enrichClient(id, { sessionsThisWeek: 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Fringe (visited W1)
    const byCount = (min, max) =>
      [...visitedW1]
        .filter((id) => { const c = weeks[id].w1; return c >= min && c <= max; })
        .map((id) => enrichClient(id, { sessionsThisWeek: weeks[id].w1 }));

    const fringeSegments = {
      atRisk:   { count: 0, clients: [] },
      moderate: { count: 0, clients: [] },
      engaged:  { count: 0, clients: [] },
    };
    const atRisk   = byCount(1, 1);
    const moderate = byCount(2, 3);
    const engaged  = byCount(4, 99);
    fringeSegments.atRisk   = { count: atRisk.length,   clients: atRisk.slice(0, 50) };
    fringeSegments.moderate = { count: moderate.length, clients: moderate.slice(0, 50) };
    fringeSegments.engaged  = { count: engaged.length,  clients: engaged.slice(0, 50) };

    // No-shows
    const noShows = Object.entries(noShowMap)
      .map(([id, count]) => ({ ...enrichClient(id), noShowCount: count }))
      .sort((a, b) => b.noShowCount - a.noShowCount)
      .slice(0, 50);

    // Suspensions from client status / SuspensionInfo
    const suspensions = Object.values(clientMap)
      .filter((c) => {
        if (c.suspensionInfo && Object.keys(c.suspensionInfo).length > 0) return true;
        if (c.status && c.status !== 'Active') return true;
        return false;
      })
      .map((c) => ({
        id:    c.id,
        name:  c.name,
        email: c.email,
        phone: c.phone,
        status: c.status,
        suspensionInfo: c.suspensionInfo,
      }))
      .slice(0, 50);

    return ok({
      reds:           reds.slice(0, 150),
      fringeSegments,
      noShows,
      suspensions,
      summary: {
        redsCount:        reds.length,
        visitedThisWeek:  visitedW1.size,
        noShowCount:      noShows.length,
        suspensionCount:  suspensions.length,
        totalTracked:     Object.keys(weeks).length,
      },
    });
  } catch (e) {
    console.error('mb-client-analytics:', e);
    return err(e.message);
  }
};
