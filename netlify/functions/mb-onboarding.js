/**
 * GET /api/mb-onboarding
 *
 * Identifies clients currently in the 4-week onboarding program, groups them
 * into week columns (1–4), and counts sessions via the class-visit approach
 * (proven to work — same pattern as mb-client-analytics.js).
 *
 * Triggered by purchases of any of these products:
 *   "3 Session Pass" | "14 Day Pass" | "4 Week Kickstarter"
 *   "Strong Dad Transformation" | "Strong Mum Transformation"
 *
 * PLUS a third pathway that isn't a sales-product match at all:
 * "straight-in" members who joined directly onto a full membership with no
 * trial pass. They can't be detected the same way as the 5 products above —
 * those are one-off purchases, but a membership is billed repeatedly, so
 * "purchased a membership product in the last N days" would match every
 * existing member's every billing cycle, not just new joins (confirmed live
 * against this account's actual sales: "Newstrength Unlimited" alone had
 * 837 line items in a 60-day window against a roster nowhere near that
 * size). Detected instead from `clients.creation_date` (Supabase, synced
 * nightly) — see straightInCandidates() below.
 *
 * A client's start date (sale date, or creation_date for straight-in) can be
 * manually corrected via `onboarding_start_overrides` — a coach fixing a
 * mis-logged sale, or pushing a client's effective start later because they
 * were extended/started late. See getStartOverrides() below.
 *
 * Week 1–4 is bucketed by real Monday–Sunday calendar weeks (differenceInCalendarWeeks,
 * weekStartsOn: 1) rather than a rolling exact-7-day window from the start
 * date's own time-of-day — the old approach put a Wednesday starter halfway
 * through week boundaries all program long. Same convention as
 * mb-revenue.js/coachPerformance's "this week".
 */
import { createClient } from '@supabase/supabase-js';
import { getStaffToken, mbGet, ok, err, CORS, formatPhone } from './utils/mb-auth.js';
import { subDays, format, parseISO, differenceInDays, differenceInCalendarWeeks } from 'date-fns';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ONBOARDING_WINDOW_DAYS = 27; // still governs the straight-in creation_date cutoff and the sales/classes fetch window
const ONBOARDING_WEEKS = 4;        // the pipeline itself is now bucketed by calendar week, not day count

const BATCH = 15;

const ONBOARDING_KEYWORDS = [
  '3 session pass',
  '14 day pass',
  '4 week kickstarter',
  'strong dad transformation',
  'strong mum transformation',
];

function isOnboardingProduct(name = '') {
  const lower = name.toLowerCase();
  return ONBOARDING_KEYWORDS.some((k) => lower.includes(k));
}

function shortProduct(name = '') {
  const lower = name.toLowerCase();
  if (lower.includes('strong dad'))                            return 'Strong Dad';
  if (lower.includes('strong mum'))                            return 'Strong Mum';
  if (lower.includes('4 week') || lower.includes('kickstarter')) return '4-Week';
  if (lower.includes('14 day'))                                return '14-Day';
  if (lower.includes('3 session'))                             return '3-Session';
  return name.split(' ').slice(0, 2).join(' ');
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function getSales(token, start, end) {
  let all = [], offset = 0;
  while (true) {
    const data = await mbGet('/sale/sales', token, {
      StartSaleDateTime: start,
      EndSaleDateTime:   end,
      Limit:  200,
      Offset: offset,
    });
    all = all.concat(data.Sales || []);
    if ((data.Sales || []).length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return all;
}

async function getClasses(token, start, end) {
  let all = [], offset = 0;
  while (true) {
    const data = await mbGet('/class/classes', token, {
      StartDateTime: start,
      EndDateTime:   end,
      Limit:  200,
      Offset: offset,
    });
    // Only fetch visits for classes that actually had bookings
    const classes = (data.Classes || []).filter((c) => (c.TotalBooked || 0) > 0);
    all = all.concat(classes);
    if ((data.Classes || []).length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return all;
}

async function getClassVisits(token, classId) {
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
      Limit:  200,
      Offset: offset,
    });
    const clients = data.Clients || [];
    for (const c of clients) {
      map[String(c.Id)] = {
        id:    String(c.Id),
        name:  `${c.FirstName || ''} ${c.LastName || ''}`.trim(),
        email: c.Email || '',
        phone: formatPhone(c.MobilePhone || c.HomePhone),
      };
    }
    if (clients.length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return map;
}

// Clients who joined straight onto a full membership — Active (or manually
// status_override'd Active; see clientStatus.js's effectiveStatus, mirrored
// here in SQL) within the onboarding window, and not already claimed by the
// trial-product sweep above (`excludeIds`). Read from Supabase rather than
// a fresh Mindbody call — the roster sync already keeps `clients` current,
// and creation_date/status are exactly the fields this needs.
async function straightInCandidates(excludeIds) {
  const cutoff = format(subDays(new Date(), ONBOARDING_WINDOW_DAYS), 'yyyy-MM-dd');
  const { data, error } = await supabase
    .from('clients')
    .select('mindbody_id, creation_date, status, status_override')
    .gte('creation_date', cutoff);
  if (error) { console.error('[mb-onboarding] straightInCandidates query failed:', error.message); return []; }

  return (data || []).filter((c) => {
    if (excludeIds.has(c.mindbody_id)) return false;
    const effectiveStatus = c.status_override || c.status;
    return effectiveStatus === 'Active';
  });
}

// Manual corrections to a client's onboarding start date (see this file's
// header and the onboarding_start_overrides migration) — applied after
// detection below so the rest of this function doesn't need to know
// overrides exist. Keyed by Mindbody client ID, same as
// onboarding_rollover_decisions.
async function getStartOverrides() {
  const { data, error } = await supabase
    .from('onboarding_start_overrides')
    .select('mindbody_client_id, start_date');
  if (error) { console.error('[mb-onboarding] getStartOverrides failed:', error.message); return {}; }
  const map = {};
  for (const row of data || []) map[row.mindbody_client_id] = row.start_date; // 'yyyy-MM-dd'
  return map;
}

// Real Monday–Sunday calendar weeks, not a rolling exact-7-day window from
// the start date's own time-of-day (see file header for why). Week is
// clamped to [1, ONBOARDING_WEEKS] — a client whose real week has run past
// 4 still shows in week 4 rather than disappearing, same clamp behaviour
// the old day-count version had.
function weekInfoFor(startDate, now) {
  const weeksSinceStart = differenceInCalendarWeeks(now, startDate, { weekStartsOn: 1 });
  const week = Math.min(ONBOARDING_WEEKS, Math.max(1, weeksSinceStart + 1));
  return { weeksSinceStart, week };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getStaffToken();
    const now   = new Date();

    const windowStart = subDays(now, 29);
    const fetchStart  = format(windowStart, "yyyy-MM-dd'T'00:00:00");
    const fetchEnd    = format(now,         "yyyy-MM-dd'T'23:59:59");

    // Fetch sales, clients, classes, and start-date overrides in parallel to
    // minimise wall-clock time
    console.log('[mb-onboarding] Starting parallel fetch…');
    const [allSales, clientMap, allClasses, startOverrides] = await Promise.all([
      getSales(token, fetchStart, fetchEnd),
      getAllClients(token),
      getClasses(token, fetchStart, fetchEnd),
      getStartOverrides(),
    ]);
    console.log(`[mb-onboarding] Got ${allSales.length} sales, ${Object.keys(clientMap).length} clients, ${allClasses.length} classes, ${Object.keys(startOverrides).length} start overrides`);

    // ── Identify onboarding clients from sales ────────────────────────────
    const onboardingMap = {};  // clientId → { startDate, product, shortProduct }

    for (const sale of allSales) {
      if (!sale.SaleDate) continue;
      const clientId = String(sale.Client?.Id ?? sale.ClientId ?? '');
      if (!clientId || clientId === 'undefined') continue;

      for (const item of (sale.PurchasedItems || [])) {
        const name = item.Description || item.Name || '';
        if (!isOnboardingProduct(name)) continue;

        const saleDate = parseISO(sale.SaleDate);
        // Keep only the most recent onboarding purchase per client
        if (!onboardingMap[clientId] || saleDate > onboardingMap[clientId].startDate) {
          onboardingMap[clientId] = {
            startDate:    saleDate,
            product:      name,
            shortProduct: shortProduct(name),
          };
        }
        break; // One onboarding product per sale is enough
      }
    }

    // Filter to clients currently within weeks 1–4 of their (possibly
    // overridden) start date
    const tradeOnboarding = Object.entries(onboardingMap)
      .map(([clientId, info]) => {
        const override  = startOverrides[clientId];
        const startDate = override ? parseISO(override) : info.startDate;
        const { weeksSinceStart, week } = weekInfoFor(startDate, now);
        return {
          clientId, ...info, startDate,
          daysSinceStart: differenceInDays(now, startDate),
          weeksSinceStart, week,
          hasStartOverride: !!override,
          isStraightIn: false,
        };
      })
      .filter((c) => c.weeksSinceStart >= 0 && c.weeksSinceStart < ONBOARDING_WEEKS);

    // Straight-in members — same board/tasks, no rollover decision (see
    // OnboardingCard.jsx). Anchored to their actual signup (creation_date)
    // rather than a sale, since there's no trial-purchase event to anchor to.
    const straightIn = (await straightInCandidates(new Set(tradeOnboarding.map((c) => c.clientId))))
      .map((c) => {
        const override  = startOverrides[c.mindbody_id];
        const startDate = override ? parseISO(override) : parseISO(c.creation_date);
        const { weeksSinceStart, week } = weekInfoFor(startDate, now);
        return {
          clientId: c.mindbody_id,
          startDate,
          product: 'Straight-in membership',
          shortProduct: 'Straight-In',
          daysSinceStart: differenceInDays(now, startDate),
          weeksSinceStart, week,
          hasStartOverride: !!override,
          isStraightIn: true,
        };
      })
      .filter((c) => c.weeksSinceStart >= 0 && c.weeksSinceStart < ONBOARDING_WEEKS);

    const activeOnboarding = [...tradeOnboarding, ...straightIn];

    console.log(`[mb-onboarding] ${activeOnboarding.length} active onboarding clients (${straightIn.length} straight-in)`);

    if (activeOnboarding.length === 0) {
      return ok({
        week1: [], week2: [], week3: [], week4: [],
        pipelineReds: [],
        onboardingIds: [],
        summary: { total: 0, atRisk: 0, week1Count: 0, week2Count: 0, week3Count: 0, week4Count: 0 },
      });
    }

    // ── Batch-fetch class visits, counting only for onboarding clients ────
    const onboardingSet = new Set(activeOnboarding.map((c) => c.clientId));
    const visitsByClient = {};   // clientId → Date[]

    for (let i = 0; i < allClasses.length; i += BATCH) {
      const batch   = allClasses.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map((cls) => getClassVisits(token, cls.Id))
      );

      batch.forEach((cls, idx) => {
        if (results[idx].status !== 'fulfilled') return;
        const classDate = parseISO(cls.StartDateTime);

        for (const visit of results[idx].value) {
          const id = String(visit.ClientId || '');
          if (!id || !onboardingSet.has(id)) continue;  // Skip non-onboarding clients
          if (visit.SignedIn === true && !visit.LateCancelled) {
            if (!visitsByClient[id]) visitsByClient[id] = [];
            visitsByClient[id].push(classDate);
          }
        }
      });
    }

    // ── Count sessions per onboarding week (relative to each client's start date) ─
    const enriched = activeOnboarding.map((c) => {
      const visits       = visitsByClient[c.clientId] || [];
      const weekSessions = [0, 0, 0, 0];   // index 0 = Week 1

      for (const visitDate of visits) {
        const weekIdx = differenceInCalendarWeeks(visitDate, c.startDate, { weekStartsOn: 1 });
        if (weekIdx >= 0 && weekIdx < ONBOARDING_WEEKS) weekSessions[weekIdx]++;
      }

      const totalSessions       = weekSessions.reduce((s, w) => s + w, 0);
      const currentWeekSessions = weekSessions[c.week - 1];
      const client              = clientMap[c.clientId] || { id: c.clientId, name: `Client ${c.clientId}`, email: '', phone: '' };

      // Most recent signed-in visit across the entire onboarding window
      const lastVisit = visits.length > 0
        ? visits.reduce((max, d) => (d > max ? d : max))
        : null;

      return {
        id:                 c.clientId,
        name:               client.name,
        email:              client.email,
        phone:              client.phone,
        product:            c.product,
        shortProduct:       c.shortProduct,
        isStraightIn:       c.isStraightIn,
        startDate:          format(c.startDate, 'yyyy-MM-dd'),
        daysSinceStart:     c.daysSinceStart,
        week:               c.week,
        hasStartOverride:   c.hasStartOverride,
        weekSessions,
        totalSessions,
        currentWeekSessions,
        isAtRisk:           currentWeekSessions === 0,
        lastSessionDate:    lastVisit ? format(lastVisit, 'yyyy-MM-dd') : null,
      };
    });

    const byWeek = (w) => enriched.filter((c) => c.week === w).sort((a, b) => a.name.localeCompare(b.name));
    const pipelineReds = enriched
      .filter((c) => c.isAtRisk)
      // Sort: most recently active first, then by how far through their program
      .sort((a, b) => {
        if (!a.lastSessionDate && !b.lastSessionDate) return b.daysSinceStart - a.daysSinceStart;
        if (!a.lastSessionDate) return 1;
        if (!b.lastSessionDate) return -1;
        return b.lastSessionDate.localeCompare(a.lastSessionDate);
      });

    console.log(`[mb-onboarding] Done. ${enriched.length} clients, ${pipelineReds.length} at risk`);

    return ok({
      week1:         byWeek(1),
      week2:         byWeek(2),
      week3:         byWeek(3),
      week4:         byWeek(4),
      pipelineReds,
      onboardingIds: enriched.map((c) => c.id),
      summary: {
        total:      enriched.length,
        atRisk:     pipelineReds.length,
        week1Count: byWeek(1).length,
        week2Count: byWeek(2).length,
        week3Count: byWeek(3).length,
        week4Count: byWeek(4).length,
      },
    });
  } catch (e) {
    console.error('[mb-onboarding] Failed:', e.message);
    return err(e.message);
  }
};
