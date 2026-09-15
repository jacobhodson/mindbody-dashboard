/**
 * GET /api/mb-group-performance
 *
 * Group-class revenue and per-coach LER, mirroring mb-pt-analytics.js's
 * coachPerformance but for group classes instead of PT/SP appointments —
 * manager-only, Finance tab (see GroupPerformanceTable.jsx).
 *
 * The $ basis is different from PT/SP on purpose: group memberships bill
 * weekly/fortnightly/monthly at different rates per plan, so there's no
 * clean "price per class" the way a single-session PT credit has a price.
 * Instead: total group-membership revenue for last month (a complete
 * month) ÷ how many *countable* group classes ran that month = one
 * effective average value per class, then attributed to whichever coach
 * taught each class this week/month.
 *
 * Two explicit exclusions from "countable" classes (2026-09-19, per the
 * owner): the free Saturday Open Gym sessions and the free Sunday Run Club
 * — neither produces revenue or needs a coach, so counting them would
 * understate the average value of a real paid class.
 *
 * GROUP_MEMBERSHIP_KEYWORDS is a judgement call, not a Mindbody-provided
 * flag — see the comment below for exactly what's in/out and why.
 */
import { getStaffToken, mbGet, ok, err, CORS } from './utils/mb-auth.js';
import {
  format, parseISO,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  subMonths, subWeeks,
  differenceInCalendarDays,
} from 'date-fns';

// Group-class revenue products — confirmed with the owner (2026-09-19):
// the two recurring memberships PLUS single-session drop-ins all count
// (a single session still fills a class seat and produces real revenue).
// Deliberately excludes, based on a live 180-day product sweep:
//   - "Fat Loss Group" — sounds group-shaped but reads as a fixed-term
//     program purchase, not an ongoing membership — confirmed excluded
//   - "Open Gym"/"Open gym Family" — separate self-directed access
//     product, not group classes — confirmed excluded (also nearly all $0
//     in practice, bundled free with other purchases in this account)
//   - "Individual Coaching & Open Gym Access" — "Individual", not group
//   - "Kick Starter"/"3 session pass"/"14 Day Pass"/"Strong Dad/Mum
//     Transformation" — onboarding trial passes, a different pipeline
// If any of these should actually count, this is the one place to widen.
const GROUP_MEMBERSHIP_KEYWORDS = ['newstrength unlimited', 'newstrength 2x week', 'newstrength single session'];

function isGroupMembership(description = '') {
  const d = description.toLowerCase();
  return GROUP_MEMBERSHIP_KEYWORDS.some((k) => d.includes(k));
}

// Free, uncoached, no-revenue sessions — excluded from the countable class
// population (and therefore from the average-value-per-class denominator
// and every coach's session count).
function isExcludedFreeClass(name, date) {
  const n = (name || '').trim().toLowerCase();
  const day = format(date, 'EEEE');
  if (day === 'Saturday' && n === 'open gym') return true;
  if (day === 'Sunday' && n === 'run club') return true;
  return false;
}

async function fetchAllSales(token, start, end) {
  const fetchStart = format(start, "yyyy-MM-dd'T'00:00:00");
  const fetchEnd   = format(end,   "yyyy-MM-dd'T'23:59:59");
  let all = [], offset = 0;
  while (true) {
    const data = await mbGet('/sale/sales', token, {
      StartSaleDateTime: fetchStart,
      EndSaleDateTime:   fetchEnd,
      Limit: 200,
      Offset: offset,
    });
    const sales = data.Sales || [];
    all = all.concat(sales);
    if (sales.length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return all;
}

async function fetchAllClasses(token, start, end) {
  const fetchStart = format(start, "yyyy-MM-dd'T'00:00:00");
  const fetchEnd   = format(end,   "yyyy-MM-dd'T'23:59:59");
  let all = [], offset = 0;
  while (true) {
    const data = await mbGet('/class/classes', token, {
      StartDateTime: fetchStart,
      EndDateTime:   fetchEnd,
      Limit: 200,
      Offset: offset,
    });
    const classes = data.Classes || [];
    all = all.concat(classes);
    if (classes.length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return all;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getStaffToken();
    const now = new Date();

    // Calendar Mon-Sun weeks / calendar months ending "now" — matches
    // mb-revenue.js's convention exactly. A trailing 7-day window ending
    // yesterday (this file's original approach, copied from
    // mb-pt-analytics.js) silently excludes today and shifts "this week"
    // a day early against the calendar — confirmed live as the cause of
    // coach counts looking wrong (2026-09-19). Fixed here and in
    // mb-pt-analytics.js's coachPerformance together.
    const w1Start = startOfWeek(now, { weekStartsOn: 1 });
    const w1End   = now;
    const w2Start = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const w2End   = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd   = now;
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd   = endOfMonth(subMonths(now, 1));

    const dateRanges = {
      thisWeek:  `${format(w1Start, 'd MMM')} – ${format(w1End, 'd MMM')}`,
      lastWeek:  `${format(w2Start, 'd MMM')} – ${format(w2End, 'd MMM')}`,
      thisMonth: `${format(thisMonthStart, 'd MMM')} – ${format(thisMonthEnd, 'd MMM')}`,
      lastMonth: `${format(lastMonthStart, 'd MMM')} – ${format(lastMonthEnd, 'd MMM')}`,
    };

    const fetchFrom = lastMonthStart;

    const [allSales, allClasses] = await Promise.all([
      fetchAllSales(token, fetchFrom, now),
      fetchAllClasses(token, fetchFrom, now),
    ]);

    // ── Group membership revenue, by period ─────────────────────────────
    const revenue = { thisWeek: 0, lastWeek: 0, thisMonth: 0, lastMonth: 0 };
    const inRange = (d, s, e) => d >= s && d <= e;
    for (const sale of allSales) {
      if (!sale.SaleDate) continue;
      const saleDate = parseISO(sale.SaleDate);
      const amount = (sale.PurchasedItems || []).reduce((sum, item) => {
        if (item.Returned || !isGroupMembership(item.Description || '')) return sum;
        return sum + (item.TotalAmount || 0);
      }, 0);
      if (amount <= 0) continue;
      if (inRange(saleDate, w1Start, w1End))               revenue.thisWeek  += amount;
      if (inRange(saleDate, w2Start, w2End))               revenue.lastWeek  += amount;
      if (inRange(saleDate, thisMonthStart, thisMonthEnd)) revenue.thisMonth += amount;
      if (inRange(saleDate, lastMonthStart, lastMonthEnd)) revenue.lastMonth += amount;
    }

    const lastMonthWeeks = (differenceInCalendarDays(lastMonthEnd, lastMonthStart) + 1) / 7;
    const round2 = (n) => Math.round(n * 100) / 100;
    const revenueWithAvg = {
      thisWeek:  round2(revenue.thisWeek),
      lastWeek:  round2(revenue.lastWeek),
      thisMonth: round2(revenue.thisMonth),
      lastMonth: round2(revenue.lastMonth),
      weeklyAvg: round2(revenue.lastMonth / lastMonthWeeks),
    };

    // ── Countable classes (excludes free Sat Open Gym / Sun Run Club) ───
    const countable = allClasses
      .filter((c) => !c.IsCanceled)
      .map((c) => ({
        id:        c.Id,
        name:      (c.ClassDescription?.Name || c.Name || '').trim(),
        date:      parseISO(c.StartDateTime),
        staffId:   String(c.Staff?.Id ?? ''),
        staffName: c.Staff?.Name || `${c.Staff?.FirstName || ''} ${c.Staff?.LastName || ''}`.trim() || 'Unassigned',
      }))
      .filter((c) => !isExcludedFreeClass(c.name, c.date));

    function periodCount(arr, start, end) {
      return arr.filter((c) => c.date >= start && c.date <= end).length;
    }

    const lastMonthClasses = periodCount(countable, lastMonthStart, lastMonthEnd);
    const avgClassValue = lastMonthClasses > 0 ? revenue.lastMonth / lastMonthClasses : 0;

    function classBucket(arr, start, end) {
      const count = arr.filter((c) => c.date >= start && c.date <= end).length;
      return { count, value: round2(count * avgClassValue) };
    }
    function withWeeklyAvg(buckets) {
      return {
        ...buckets,
        weeklyAvg: {
          count: Math.round((buckets.lastMonth.count / lastMonthWeeks) * 10) / 10,
          value: round2(buckets.lastMonth.value / lastMonthWeeks),
        },
      };
    }

    const overall = withWeeklyAvg({
      thisWeek:  classBucket(countable, w1Start, w1End),
      lastWeek:  classBucket(countable, w2Start, w2End),
      thisMonth: classBucket(countable, thisMonthStart, thisMonthEnd),
      lastMonth: classBucket(countable, lastMonthStart, lastMonthEnd),
    });

    const staffIds = [...new Set(countable.map((c) => c.staffId))].filter(Boolean);
    const byCoach = staffIds
      .map((staffId) => {
        const mine = countable.filter((c) => c.staffId === staffId);
        return {
          staffId,
          staffName: mine[0]?.staffName || `Staff ${staffId}`,
          ...withWeeklyAvg({
            thisWeek:  classBucket(mine, w1Start, w1End),
            lastWeek:  classBucket(mine, w2Start, w2End),
            thisMonth: classBucket(mine, thisMonthStart, thisMonthEnd),
            lastMonth: classBucket(mine, lastMonthStart, lastMonthEnd),
          }),
        };
      })
      .sort((a, b) => b.lastMonth.count - a.lastMonth.count);

    return ok({
      revenue: revenueWithAvg,
      avgClassValue: round2(avgClassValue),
      lastMonthClassCount: lastMonthClasses,
      overall,
      byCoach,
      dateRanges,
      excludedThisMonth: periodCount(
        allClasses.filter((c) => !c.IsCanceled).map((c) => ({
          name: (c.ClassDescription?.Name || c.Name || '').trim(),
          date: parseISO(c.StartDateTime),
        })).filter((c) => isExcludedFreeClass(c.name, c.date)),
        thisMonthStart, thisMonthEnd,
      ),
    });
  } catch (e) {
    console.error('mb-group-performance:', e);
    return err(e.message);
  }
};
