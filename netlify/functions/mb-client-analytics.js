/**
 * 28-day rolling window, split into 4 weekly buckets.
 * Supports ?period=7days (default) or ?period=calendarWeek (last Mon–Sun)
 *
 * Returns:
 *   reds        – visited W2–W4 but NOT W1 (recent churn), PLUS active clients
 *                 with ZERO visits anywhere in the 28-day window ("long-lapsed").
 *                 Long-lapsed clients used to fall out of this list entirely once
 *                 they crossed the 28-day mark — they're now flagged instead
 *                 (`longLapsed: true`), with `hasActiveContract` set from a live
 *                 contract check so staff can prioritise still-paying members
 *                 for an urgent call. Clients whose only active contract is
 *                 PT/semi-private are excluded from the long-lapsed group —
 *                 they're not expected to attend group classes at all (see
 *                 mb-pt-analytics.js ptReds for their equivalent).
 *   fringe      – visited W1, segmented by count (atRisk/engaged)
 *                 each client carries: sessionsThisWeek, trend, service, isFullyUtilising
 *   noShows     – clients with unsigned bookings in W1 window
 *   suspensions – clients with active SuspensionInfo or hold-type status
 *                 (excludes Terminated, Expired, Non Member)
 */
import { getStaffToken, mbGet, ok, err, CORS, formatPhone } from './utils/mb-auth.js';
import { subDays, endOfDay, format, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns';

const BATCH = 15;

// Statuses that are NOT a suspension — exclude from suspensions list
// 'declined' is handled separately under finances
const EXCLUDED_SUSPENSION_STATUSES = new Set([
  'active', 'terminated', 'expired', 'non member', 'non-member', 'declined',
]);

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

// Fetch active contracts for a client and return the soonest future resume date
async function getContractResumeDate(token, clientId) {
  try {
    const data = await mbGet('/client/clientcontracts', token, { clientId, Limit: 20 });
    const contracts = data.ClientContracts || data.Contracts || [];
    let earliest = null;
    for (const c of contracts) {
      // Try all field name variants MB might use
      const raw =
        c.ResumeDate    || c.resumeDate    ||
        c.SuspendedUntil|| c.suspendedUntil||
        c.HoldEndDate   || c.holdEndDate   ||
        c.EndSuspension || c.endSuspension ||
        null;
      if (!raw) continue;
      const d = new Date(raw);
      if (isNaN(d.getTime())) continue;
      if (!earliest || d < earliest) earliest = d;
    }
    // Log the full contract array once so we can see the actual field names
    if (contracts.length > 0) {
      console.log(`[mb-analytics] contract sample for ${clientId}:`, JSON.stringify(contracts[0]));
    }
    return earliest;
  } catch {
    return null;
  }
}

// PT/semi-private contract names — these clients are tracked via appointments
// (see mb-pt-analytics.js / the Personal Training tab), not group classes, so
// having zero group-class visits is expected for them and shouldn't flag them
// on the group-class Red's List. Same classifier as mb-pt-analytics.js.
function isPtContractName(name = '') {
  const s = name.toLowerCase();
  if (/semi.?private/.test(s) || /\bsp\b/.test(s) || /\bsp\d/.test(s) || /small.?private/.test(s) || /partner.?train/.test(s) || /2:1/.test(s) || /3:1/.test(s)) return true;
  if (/personal\s*train/.test(s) || /\bpt\b/.test(s) || /\bpt\d/.test(s) || /1[:\s]1/.test(s) || /1on1/.test(s) || /individual\s*(coach|program)/.test(s)) return true;
  return false;
}

// Fetch a client's contracts and report whether a GROUP-CLASS contract is
// currently active (today falls within its start/end dates, or it has no end
// date at all — i.e. an ongoing auto-pay membership). PT/semi-private-only
// contracts don't count here — see isPtContractName above — but are reported
// via hasPtContract so callers can tell "no active contract at all" apart
// from "active, but PT-only." Field names are defensive since MB's contract
// schema varies by account — same approach as getContractResumeDate.
async function getActiveContract(token, clientId) {
  try {
    const data = await mbGet('/client/clientcontracts', token, { clientId, Limit: 20 });
    const contracts = data.ClientContracts || data.Contracts || [];
    const now = new Date();
    let hasPtContract = false;
    for (const c of contracts) {
      const startRaw = c.AgreementDate || c.StartDate || c.startDate || null;
      const endRaw   = c.ExpirationDate || c.EndDate || c.endDate || null;
      const start = startRaw ? new Date(startRaw) : null;
      const end   = endRaw   ? new Date(endRaw)   : null;
      const started  = !start || isNaN(start.getTime()) || start <= now;
      const notEnded = !end   || isNaN(end.getTime())   || end   >= now;
      if (!(started && notEnded)) continue;
      const name = c.Name || c.ContractName || c.ProductName || '';
      if (isPtContractName(name)) { hasPtContract = true; continue; }
      return { hasActiveContract: true, contractName: name || null, hasPtContract };
    }
    return { hasActiveContract: false, contractName: null, hasPtContract };
  } catch {
    return { hasActiveContract: false, contractName: null, hasPtContract: false };
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
        id:             String(c.Id),
        name:           `${c.FirstName || ''} ${c.LastName || ''}`.trim(),
        email:          c.Email || '',
        phone:          formatPhone(c.MobilePhone || c.HomePhone),
        status:         c.Status || 'Active',
        suspensionInfo: c.SuspensionInfo || null,
        active:         c.Active !== false,
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
  const avg     = prevWeeks.reduce((s, w) => s + w, 0) / 3;
  const rounded = Math.round(avg * 10) / 10;
  if (w1 > avg + 0.4) return { avg: rounded, direction: 'up' };
  if (w1 < avg - 0.4) return { avg: rounded, direction: 'down' };
  return { avg: rounded, direction: 'stable' };
}

// ─── Handler ────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token  = await getStaffToken();
    const now    = new Date();
    const period = event.queryStringParameters?.period || '7days';

    // ── W1 window ──────────────────────────────────────────────────────────
    let w1Start, w1End;
    if (period === 'calendarWeek') {
      w1Start = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      w1End   = endOfWeek(subWeeks(now, 1),   { weekStartsOn: 1 });
    } else {
      // default: rolling last 7 days, ending yesterday (today excluded)
      w1Start = subDays(now, 7);
      w1End   = endOfDay(subDays(now, 1)); // 23:59:59.999 yesterday
    }

    // ── W2–W4 boundaries (7-day buckets going back from w1Start) ───────────
    const b14 = subDays(w1Start, 7);
    const b21 = subDays(w1Start, 14);
    const b28 = subDays(w1Start, 21);

    const startStr = format(b28,   "yyyy-MM-dd'T'00:00:00");
    const endStr   = format(w1End, "yyyy-MM-dd'T'23:59:59");

    const allClasses = await getClasses(token, startStr, endStr);

    // Per-client data structures
    const weeks         = {};  // id → { w1, w2, w3, w4 }
    const services      = {};  // id → most-recent service name
    const noShowMap     = {};  // id → [{ className, day, time, staffName }]
    const lastVisitDate = {};  // id → most recent signed-in Date

    for (let i = 0; i < allClasses.length; i += BATCH) {
      const batch   = allClasses.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map((cls) => getVisits(token, cls.Id)));

      batch.forEach((cls, idx) => {
        if (results[idx].status !== 'fulfilled') return;
        const classDate = parseISO(cls.StartDateTime);

        // Determine week bucket
        const inW1 = classDate >= w1Start && classDate <= w1End;
        const inW2 = !inW1 && classDate > b14;
        const inW3 = !inW1 && !inW2 && classDate > b21;
        const inW4 = !inW1 && !inW2 && !inW3 && classDate > b28;

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

            // Track most recent signed-in visit date across all windows
            if (!lastVisitDate[id] || classDate > lastVisitDate[id]) {
              lastVisitDate[id] = classDate;
            }
          }

          // No-show: booked but didn't sign in (W1 window)
          if (inW1 && visit.SignedIn === false && !visit.LateCancelled) {
            if (!noShowMap[id]) noShowMap[id] = [];
            noShowMap[id].push({
              className: cls.ClassDescription?.Name || cls.Name || 'Class',
              day:       format(classDate, 'EEE d MMM'),
              time:      format(classDate, 'h:mm a'),
              staffName: `${cls.Staff?.FirstName || ''} ${cls.Staff?.LastName || ''}`.trim(),
            });
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
      const lastDate          = lastVisitDate[id] ? format(lastVisitDate[id], 'yyyy-MM-dd') : null;
      const weeklyAttendance  = { w1: w.w1, w2: w.w2, w3: w.w3, w4: w.w4 };
      return { ...c, service: svc, trend: t, is2xMember: is2x, isFullyUtilising: isFullyUtil, lastSessionDate: lastDate, weeklyAttendance, ...extra };
    }

    // Red's List: visited W2–W4 but NOT W1, active contract only, not suspended
    const visitedW1   = new Set(Object.keys(weeks).filter((id) => weeks[id].w1 > 0));
    const visitedPrev = new Set(
      Object.keys(weeks).filter((id) => weeks[id].w2 > 0 || weeks[id].w3 > 0 || weeks[id].w4 > 0)
    );
    const reds = [...visitedPrev]
      .filter((id) => !visitedW1.has(id))
      .filter((id) => {
        const c = clientMap[id];
        if (!c) return false;
        // Active contract members only
        if ((c.status || '').toLowerCase() !== 'active') return false;
        // Exclude anyone on a suspension / hold
        if (c.suspensionInfo && Object.keys(c.suspensionInfo).length > 0) return false;
        return true;
      })
      .map((id) => enrichClient(id, { sessionsThisWeek: 0 }))
      // Sort: most recently seen first → longest absent last
      .sort((a, b) => {
        if (!a.lastSessionDate && !b.lastSessionDate) return 0;
        if (!a.lastSessionDate) return 1;
        if (!b.lastSessionDate) return -1;
        return b.lastSessionDate.localeCompare(a.lastSessionDate);
      });

    // Long-lapsed: active, non-suspended clients with ZERO visits anywhere in
    // the 28-day window. These have no entry in `weeks` at all, so without this
    // they just vanish from Red's List the moment they cross ~28 days absent —
    // even if they're still on an active, paying contract.
    const seenIds = new Set(Object.keys(weeks));
    const longLapsedCandidates = Object.values(clientMap)
      .filter((c) => (c.status || '').toLowerCase() === 'active')
      .filter((c) => !(c.suspensionInfo && Object.keys(c.suspensionInfo).length > 0))
      .filter((c) => !seenIds.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      // Higher cap than reds: PT/SP-only clients (filtered out below, after
      // the contract check) will always show up here — 0 group visits is
      // normal for them — so a chunk of this pool won't make the final list.
      .slice(0, 150);

    // Contract check both groups so staff can prioritise active-contract
    // holders first. Capped before fetching to bound parallel MB API calls
    // (same pattern as the suspensions contract lookup below).
    const redsForContractCheck = reds.slice(0, 100);
    const [redsContracts, lapsedContracts] = await Promise.all([
      Promise.allSettled(redsForContractCheck.map((c) => getActiveContract(token, c.id))),
      Promise.allSettled(longLapsedCandidates.map((c) => getActiveContract(token, c.id))),
    ]);

    reds.forEach((c, i) => {
      const result = i < redsContracts.length && redsContracts[i].status === 'fulfilled'
        ? redsContracts[i].value : null;
      c.hasActiveContract = result?.hasActiveContract ?? false;
      c.contractName      = result?.contractName ?? null;
      c.longLapsed         = false;
    });

    // PT/semi-private-only clients are excluded entirely — they have no
    // active *group-class* contract, so 0 group-class visits doesn't mean
    // they've lapsed. They're tracked on the Personal Training tab instead
    // (mb-pt-analytics.js ptReds), via their appointments.
    const longLapsed = longLapsedCandidates
      .map((c, i) => ({ c, result: lapsedContracts[i].status === 'fulfilled' ? lapsedContracts[i].value : null }))
      .filter(({ result }) => !(result && result.hasPtContract && !result.hasActiveContract))
      .map(({ c, result }) => enrichClient(c.id, {
        sessionsThisWeek:  0,
        longLapsed:        true,
        hasActiveContract: result?.hasActiveContract ?? false,
        contractName:      result?.contractName ?? null,
      }));

    // Merge: active-contract + long-lapsed ("urgent") first, then other
    // active-contract holders, then everyone else by most-recently-seen.
    const allReds = [...reds, ...longLapsed].sort((a, b) => {
      const aUrgent = a.hasActiveContract && a.longLapsed;
      const bUrgent = b.hasActiveContract && b.longLapsed;
      if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;
      if (a.hasActiveContract !== b.hasActiveContract) return a.hasActiveContract ? -1 : 1;
      if (!a.lastSessionDate && !b.lastSessionDate) return 0;
      if (!a.lastSessionDate) return 1;
      if (!b.lastSessionDate) return -1;
      return b.lastSessionDate.localeCompare(a.lastSessionDate);
    });

    // Fringe (visited W1): atRisk = 1–2, engaged = 3+
    const byCount = (min, max) =>
      [...visitedW1]
        .filter((id) => { const c = weeks[id].w1; return c >= min && c <= max; })
        .map((id) => enrichClient(id, { sessionsThisWeek: weeks[id].w1 }));

    const atRisk  = byCount(1, 2);
    const engaged = byCount(3, 99);

    const fringeSegments = {
      atRisk:  { count: atRisk.length,  clients: atRisk.slice(0, 50)  },
      engaged: { count: engaged.length, clients: engaged.slice(0, 50) },
    };

    // No-shows
    const noShows = Object.entries(noShowMap)
      .map(([id, sessions]) => ({ ...enrichClient(id), noShowCount: sessions.length, sessions }))
      .sort((a, b) => b.noShowCount - a.noShowCount)
      .slice(0, 50);

    // Suspensions — only include actual holds/suspensions
    // Excludes: Active, Terminated, Expired, Non Member, Declined (Declined goes to Finances)
    const rawSuspensions = Object.values(clientMap)
      .filter((c) => {
        const statusLower = (c.status || '').toLowerCase();
        if (EXCLUDED_SUSPENSION_STATUSES.has(statusLower)) return false;
        if (c.suspensionInfo && Object.keys(c.suspensionInfo).length > 0) return true;
        if (c.status && c.status !== 'Active') return true;
        return false;
      })
      .slice(0, 50);

    // Log suspension info structure so we can see what MB actually returns
    if (rawSuspensions.length > 0) {
      console.log('[mb-analytics] suspensionInfo sample:', JSON.stringify(rawSuspensions[0].suspensionInfo));
    }

    // Fetch resume dates from client contracts (suspension dates live on contracts, not client profiles)
    const contractResumes = await Promise.allSettled(
      rawSuspensions.map((c) => getContractResumeDate(token, c.id))
    );

    const suspensions = rawSuspensions.map((c, i) => {
      const contractResume = contractResumes[i].status === 'fulfilled' ? contractResumes[i].value : null;

      // Also check the SuspensionInfo on the client object for dates
      const info = c.suspensionInfo || {};
      const infoResume =
        info.ResumeDate    || info.resumeDate    ||
        info.EndDate       || info.endDate       ||
        info.SuspensionEnd || info.suspensionEnd ||
        null;

      // Prefer the contract resume date; fall back to client-level SuspensionInfo date
      const resumeDate = contractResume
        ? contractResume.toISOString()
        : infoResume || null;

      return {
        id:             c.id,
        name:           c.name,
        email:          c.email,
        phone:          c.phone,
        status:         c.status,
        suspensionInfo: c.suspensionInfo,
        resumeDate,     // ISO string or null
      };
    });

    // Declined clients — payment-declined status, shown under Finances
    const declinedClients = Object.values(clientMap)
      .filter((c) => (c.status || '').toLowerCase() === 'declined')
      .map((c) => ({
        id:     c.id,
        name:   c.name,
        email:  c.email,
        phone:  c.phone,
        status: c.status,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 100);

    return ok({
      period,
      reds:           allReds.slice(0, 200),
      fringeSegments,
      noShows,
      suspensions,
      declinedClients,
      summary: {
        redsCount:        allReds.length,
        urgentCount:      allReds.filter((c) => c.hasActiveContract && c.longLapsed).length,
        longLapsedCount:  longLapsed.length,
        visitedThisWeek:  visitedW1.size,
        noShowCount:      noShows.length,
        suspensionCount:  suspensions.length,
        declinedCount:    declinedClients.length,
        totalTracked:     Object.keys(weeks).length,
      },
    });
  } catch (e) {
    console.error('mb-client-analytics:', e);
    return err(e.message);
  }
};
