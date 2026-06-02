/**
 * GET /api/mb-onboarding
 *
 * Identifies clients currently in the 4-week onboarding program, groups them
 * into week columns (1–4), and calculates their session counts per week.
 *
 * Triggered by purchases of any of these products:
 *   "3 Session Pass" | "14 Day Pass" | "4 Week Kickstarter"
 *   "Strong Dad Transformation" | "Strong Mum Transformation"
 *
 * Response:
 *   week1, week2, week3, week4  — arrays of enriched client objects
 *   pipelineReds                — clients with 0 sessions in their current week
 *   onboardingIds               — flat list of all active onboarding client IDs
 *   summary                     — aggregate counts
 */
import { getStaffToken, mbGet, ok, err, CORS } from './utils/mb-auth.js';
import { subDays, format, parseISO, differenceInDays } from 'date-fns';

const BATCH = 10;

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

// Short display name for the product badge on the card
function shortProduct(name = '') {
  const lower = name.toLowerCase();
  if (lower.includes('strong dad'))      return 'Strong Dad';
  if (lower.includes('strong mum'))      return 'Strong Mum';
  if (lower.includes('4 week') || lower.includes('kickstarter')) return '4-Week';
  if (lower.includes('14 day'))          return '14-Day';
  if (lower.includes('3 session'))       return '3-Session';
  return name.split(' ').slice(0, 2).join(' ');
}

async function getSales(token, fetchStart, fetchEnd) {
  let all = [];
  let offset = 0;
  while (true) {
    const data = await mbGet('/sale/sales', token, {
      StartSaleDateTime: fetchStart,
      EndSaleDateTime:   fetchEnd,
      Limit:  200,
      Offset: offset,
    });
    all = all.concat(data.Sales || []);
    if ((data.Sales || []).length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return all;
}

async function getClientVisits(token, clientId, startDate, endDate) {
  try {
    const data = await mbGet('/client/clientvisits', token, {
      ClientId:  clientId,
      StartDate: format(startDate, 'yyyy-MM-dd'),
      EndDate:   format(endDate,   'yyyy-MM-dd'),
      Limit: 200,
    });
    // MB API returns ClientVisits array; each item has SignedIn + StartDateTime
    return (data.ClientVisits || []).filter(
      (v) => v.SignedIn === true && !v.LateCancelled
    );
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
        phone: c.MobilePhone || c.HomePhone || '',
      };
    }
    if (clients.length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return map;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getStaffToken();
    const now   = new Date();

    // Fetch sales from the last 29 days (28-day program + 1-day buffer)
    const windowStart  = subDays(now, 29);
    const fetchStart   = format(windowStart, "yyyy-MM-dd'T'00:00:00");
    const fetchEnd     = format(now,         "yyyy-MM-dd'T'23:59:59");

    // ── Step 1: identify onboarding clients from sales ───────────────────
    const [allSales, clientMap] = await Promise.all([
      getSales(token, fetchStart, fetchEnd),
      getAllClients(token),
    ]);

    // Map: clientId → { startDate, product (raw), clientInfo from sale }
    const onboardingMap = {};

    for (const sale of allSales) {
      if (!sale.SaleDate) continue;

      // Client ID can be at sale.Client.Id or sale.ClientId
      const clientId = String(
        sale.Client?.Id ?? sale.ClientId ?? ''
      );
      if (!clientId || clientId === 'undefined') continue;

      for (const item of (sale.PurchasedItems || [])) {
        const productName = item.Description || item.Name || '';
        if (!isOnboardingProduct(productName)) continue;

        const saleDate = parseISO(sale.SaleDate);
        // Keep the most recent onboarding sale per client
        if (
          !onboardingMap[clientId] ||
          saleDate > onboardingMap[clientId].startDate
        ) {
          // Try to get client details from the sale object first (faster)
          const saleClient = sale.Client || {};
          onboardingMap[clientId] = {
            startDate:   saleDate,
            product:     productName,
            shortProduct: shortProduct(productName),
            // Prefer client map (more reliable); fall back to sale data
            name:  clientMap[clientId]?.name  || `${saleClient.FirstName || ''} ${saleClient.LastName || ''}`.trim() || `Client ${clientId}`,
            email: clientMap[clientId]?.email || saleClient.Email        || '',
            phone: clientMap[clientId]?.phone || saleClient.MobilePhone  || saleClient.HomePhone || '',
          };
        }
        break; // Only process one matching product per sale
      }
    }

    // Filter to clients whose program is currently active (days 0–27)
    const activeOnboarding = Object.entries(onboardingMap)
      .map(([clientId, info]) => {
        const daysSinceStart = differenceInDays(now, info.startDate);
        // Week 1 = days 0–6, Week 2 = days 7–13, etc.
        const week = Math.min(4, Math.floor(daysSinceStart / 7) + 1);
        return { clientId, ...info, daysSinceStart, week };
      })
      .filter((c) => c.daysSinceStart >= 0 && c.daysSinceStart <= 27);

    if (activeOnboarding.length === 0) {
      return ok({
        week1: [], week2: [], week3: [], week4: [],
        pipelineReds: [],
        onboardingIds: [],
        summary: { total: 0, atRisk: 0, week1Count: 0, week2Count: 0, week3Count: 0, week4Count: 0 },
      });
    }

    // ── Step 2: fetch client visits per onboarding client (batched) ───────
    const visitsByClient = {}; // clientId → signed-in visit dates

    for (let i = 0; i < activeOnboarding.length; i += BATCH) {
      const batch = activeOnboarding.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(({ clientId, startDate }) =>
          getClientVisits(token, clientId, startDate, now)
        )
      );

      batch.forEach(({ clientId }, idx) => {
        if (results[idx].status !== 'fulfilled') {
          visitsByClient[clientId] = [];
          return;
        }
        visitsByClient[clientId] = results[idx].value.map((v) =>
          parseISO(v.StartDateTime || v.ClassStartTime || '')
        ).filter(Boolean);
      });
    }

    // ── Step 3: count sessions per onboarding week for each client ────────
    const enriched = activeOnboarding.map((c) => {
      const visits = visitsByClient[c.clientId] || [];

      // weekSessions[0] = week 1, [1] = week 2, etc.
      const weekSessions = [0, 0, 0, 0];
      for (const visitDate of visits) {
        const day = differenceInDays(visitDate, c.startDate);
        if      (day >= 0  && day < 7)  weekSessions[0]++;
        else if (day >= 7  && day < 14) weekSessions[1]++;
        else if (day >= 14 && day < 21) weekSessions[2]++;
        else if (day >= 21 && day < 28) weekSessions[3]++;
      }

      const totalSessions       = weekSessions.reduce((s, w) => s + w, 0);
      const currentWeekSessions = weekSessions[c.week - 1];
      const isAtRisk            = currentWeekSessions === 0;

      return {
        id:                 c.clientId,
        name:               c.name,
        email:              c.email,
        phone:              c.phone,
        product:            c.product,
        shortProduct:       c.shortProduct,
        startDate:          format(c.startDate, 'yyyy-MM-dd'),
        daysSinceStart:     c.daysSinceStart,
        week:               c.week,
        weekSessions,       // [w1, w2, w3, w4]
        totalSessions,
        currentWeekSessions,
        isAtRisk,
      };
    });

    // ── Step 4: group into kanban columns ─────────────────────────────────
    const byWeek = (w) => enriched.filter((c) => c.week === w).sort((a, b) => a.name.localeCompare(b.name));

    const pipelineReds = enriched
      .filter((c) => c.isAtRisk)
      // Sort: furthest into their program first (most urgent)
      .sort((a, b) => b.daysSinceStart - a.daysSinceStart);

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
    console.error('mb-onboarding:', e);
    return err(e.message);
  }
};
