/**
 * Scheduled daily coach-performance snapshot — populates `ler_monthly`
 * (created 2026-09-20, empty until now) so the Team tab can read real
 * month-by-month history from the database instead of only ever showing a
 * live "this month/last month" view.
 *
 * Deliberately only ever writes the CURRENT calendar month's row per staff
 * member (upsert on (staff_id, month)). Run once a day, that's all it needs
 * to be a real snapshot mechanism: a month's row keeps getting refreshed
 * with the latest live numbers every day while it's "this month", and then
 * simply stops being touched the moment the calendar rolls over and the job
 * starts upserting the new month instead — no explicit month-end/finalize
 * step required. History before this job starts running can't be
 * reconstructed: PT/Group revenue and Xero payroll are both only ever
 * visible live for a ~2-month rolling window (same caveat already accepted
 * for ler_monthly when it was first designed).
 *
 * Same computations as mb-pt-analytics.js's coachPerformance,
 * mb-group-performance.js, and xero-wages.js, narrowed to just "this month"
 * (not also this/last week, last month, etc. — this job doesn't need any of
 * that) and inlined directly (calls Mindbody/Xero directly rather than
 * HTTP-calling the other functions) — same reasoning as
 * scheduled-daily-refresh.js: HTTP-chaining scheduled functions risks a
 * timeout chain.
 *
 * Coach matching across the three sources uses the exact same first-name
 * substring approach as LERTable.jsx (mb-pt-analytics.js/
 * mb-group-performance.js use Mindbody's full "First Last" staffName,
 * staff.full_name is first-name-only today) — see that component's own doc
 * comment for the caveat (revisit if two active coaches ever share a first
 * name).
 */
import { createClient } from '@supabase/supabase-js';
import { getStaffToken, mbGet } from './utils/mb-auth.js';
import { getXeroAuth, xeroPayrollGet, parseXeroDate } from './utils/xero-auth.js';
import { classifySession as classify } from './utils/session-classify.js';
import { subDays, format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const RATE_WINDOW_DAYS = 60;
const SIGNED_OFF = 'Completed';

const GROUP_MEMBERSHIP_KEYWORDS = ['newstrength unlimited', 'newstrength 2x week', 'newstrength single session'];
function isGroupMembership(description = '') {
  const d = description.toLowerCase();
  return GROUP_MEMBERSHIP_KEYWORDS.some((k) => d.includes(k));
}
function isExcludedFreeClass(name, date) {
  const n = (name || '').trim().toLowerCase();
  const day = format(date, 'EEEE');
  if (day === 'Saturday' && n === 'open gym') return true;
  if (day === 'Sunday' && n === 'run club') return true;
  return false;
}

async function fetchAll(path, token, params) {
  let all = [], offset = 0;
  while (true) {
    const data = await mbGet(path, token, { ...params, Limit: 200, Offset: offset });
    const key  = Object.keys(data).find((k) => Array.isArray(data[k]));
    const page = key ? data[key] : [];
    all = all.concat(page);
    if (page.length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return all;
}

// ── PT/SP: this month's signed-off session count + $ value per coach ──────
async function ptThisMonth(token, now, thisMonthStart) {
  const rateStart = subDays(now, RATE_WINDOW_DAYS);
  const [sessionTypeData, appts, rateSales] = await Promise.all([
    mbGet('/site/sessiontypes', token, { OnlineOnly: false }),
    fetchAll('/appointment/staffappointments', token, {
      StartDate: format(thisMonthStart, "yyyy-MM-dd'T'00:00:00"),
      EndDate:   format(now,            "yyyy-MM-dd'T'23:59:59"),
    }),
    fetchAll('/sale/sales', token, {
      StartSaleDateTime: format(rateStart, "yyyy-MM-dd'T'00:00:00"),
      EndSaleDateTime:   format(now,       "yyyy-MM-dd'T'23:59:59"),
    }),
  ]);

  const typeMap = {};
  for (const t of (sessionTypeData.SessionTypes || [])) typeMap[t.Id] = t.Name || '';

  const sums = { pt: 0, sp: 0 }, counts = { pt: 0, sp: 0 };
  for (const sale of rateSales) {
    for (const item of (sale.PurchasedItems || [])) {
      if (item.Returned || !(item.TotalAmount > 0)) continue;
      const type = classify(item.Description || '');
      if (type !== 'pt' && type !== 'sp') continue;
      sums[type] += item.TotalAmount;
      counts[type]++;
    }
  }
  const rates = { pt: counts.pt > 0 ? sums.pt / counts.pt : 0, sp: counts.sp > 0 ? sums.sp / counts.sp : 0 };

  const signedOff = appts
    .map((a) => ({
      type:      classify(typeMap[a.SessionTypeId] || ''),
      staffId:   String(a.StaffId ?? a.Staff?.Id ?? ''),
      staffName: `${a.Staff?.FirstName || ''} ${a.Staff?.LastName || ''}`.trim(),
      status:    a.Status,
    }))
    .filter((a) => (a.type === 'pt' || a.type === 'sp') && a.status === SIGNED_OFF && a.staffId);

  const byCoach = {};
  for (const a of signedOff) {
    if (!byCoach[a.staffId]) byCoach[a.staffId] = { staffName: a.staffName, sessions: 0, revenue: 0 };
    byCoach[a.staffId].sessions += 1;
    byCoach[a.staffId].revenue  += rates[a.type] || 0;
  }
  return byCoach; // { mindbodyStaffId: { staffName, sessions, revenue } }
}

// ── Group classes: this month's countable class count + $ value per coach ─
async function groupThisMonth(token, now, thisMonthStart, lastMonthStart, lastMonthEnd) {
  const [allSales, allClasses] = await Promise.all([
    fetchAll('/sale/sales', token, {
      StartSaleDateTime: format(lastMonthStart, "yyyy-MM-dd'T'00:00:00"),
      EndSaleDateTime:   format(now,            "yyyy-MM-dd'T'23:59:59"),
    }),
    fetchAll('/class/classes', token, {
      StartDateTime: format(lastMonthStart, "yyyy-MM-dd'T'00:00:00"),
      EndDateTime:   format(now,            "yyyy-MM-dd'T'23:59:59"),
    }),
  ]);

  let lastMonthRevenue = 0;
  for (const sale of allSales) {
    if (!sale.SaleDate) continue;
    const saleDate = parseISO(sale.SaleDate);
    if (saleDate < lastMonthStart || saleDate > lastMonthEnd) continue;
    for (const item of (sale.PurchasedItems || [])) {
      if (item.Returned || !isGroupMembership(item.Description || '')) continue;
      lastMonthRevenue += item.TotalAmount || 0;
    }
  }

  const countable = allClasses
    .filter((c) => !c.IsCanceled)
    .map((c) => ({
      name:      (c.ClassDescription?.Name || c.Name || '').trim(),
      date:      parseISO(c.StartDateTime),
      staffId:   String(c.Staff?.Id ?? ''),
      staffName: c.Staff?.Name || `${c.Staff?.FirstName || ''} ${c.Staff?.LastName || ''}`.trim() || 'Unassigned',
    }))
    .filter((c) => !isExcludedFreeClass(c.name, c.date));

  const lastMonthClasses = countable.filter((c) => c.date >= lastMonthStart && c.date <= lastMonthEnd).length;
  const avgClassValue = lastMonthClasses > 0 ? lastMonthRevenue / lastMonthClasses : 0;

  const thisMonthClasses = countable.filter((c) => c.date >= thisMonthStart && c.date <= now);
  const byCoach = {};
  for (const c of thisMonthClasses) {
    if (!c.staffId) continue;
    if (!byCoach[c.staffId]) byCoach[c.staffId] = { staffName: c.staffName, classes: 0, revenue: 0 };
    byCoach[c.staffId].classes += 1;
    byCoach[c.staffId].revenue += avgClassValue;
  }
  return byCoach; // { mindbodyStaffId: { staffName, classes, revenue } }
}

// ── Xero wages for this month, keyed by Supabase staff.id ─────────────────
async function wagesThisMonth(thisMonthStart, thisMonthEnd) {
  const { accessToken, tenantId } = await getXeroAuth();

  const { data: staffRows } = await supabase
    .from('staff').select('id, xero_employee_id').eq('is_coach', true).not('xero_employee_id', 'is', null);
  const staffByEmployeeId = {};
  for (const s of staffRows || []) staffByEmployeeId[s.xero_employee_id] = s;

  let allRuns = [], page = 1;
  while (true) {
    const data = await xeroPayrollGet(`/PayRuns?page=${page}`, accessToken, tenantId);
    const runs = data.PayRuns || [];
    allRuns = allRuns.concat(runs);
    if (runs.length < 100 || page >= 10) break;
    page++;
  }
  const relevantRuns = allRuns.filter((r) => {
    if (r.PayRunStatus !== 'POSTED') return false;
    const end = parseXeroDate(r.PayRunPeriodEndDate);
    return end && end >= thisMonthStart && end <= thisMonthEnd;
  });

  // Sequential — Xero's rate limit was tripped live by a burst of these
  // (see xero-wages.js); only ~4-5 runs per month so still fast enough.
  const wages = {};
  for (const run of relevantRuns) {
    const detail = await xeroPayrollGet(`/PayRuns/${run.PayRunID}`, accessToken, tenantId);
    for (const slip of (detail?.PayRuns?.[0]?.Payslips || [])) {
      const staff = staffByEmployeeId[slip.EmployeeID];
      if (!staff) continue;
      wages[staff.id] = (wages[staff.id] || 0) + (slip.Wages || 0);
    }
  }
  return wages; // { supabaseStaffId: wages }
}

export const handler = async () => {
  try {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd   = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd   = endOfMonth(subMonths(now, 1));
    const monthStr       = format(thisMonthStart, 'yyyy-MM-dd');

    const token = await getStaffToken();

    const [ptByCoach, groupByCoach, wagesByStaffId, staffList, overrides] = await Promise.all([
      ptThisMonth(token, now, thisMonthStart),
      groupThisMonth(token, now, thisMonthStart, lastMonthStart, lastMonthEnd),
      wagesThisMonth(thisMonthStart, thisMonthEnd).catch((e) => {
        console.warn('[scheduled-coach-snapshot] wages fetch failed, continuing without wages:', e.message);
        return {};
      }),
      // is_coach excludes non-revenue-generating staff (e.g. a generic
      // admin login) so no ler_monthly row is ever created for them.
      supabase.from('staff').select('id, full_name, active').eq('active', true).eq('is_coach', true).then(({ data }) => data || []),
      supabase.from('staff_wage_overrides').select('staff_id, effective_wage').then(({ data }) => data || []),
    ]);
    const overrideByStaffId = {};
    for (const o of overrides) overrideByStaffId[o.staff_id] = o.effective_wage;

    const ptRows    = Object.values(ptByCoach);
    const groupRows = Object.values(groupByCoach);

    const rows = staffList.map((s) => {
      const firstName  = s.full_name;
      const ptMatch    = ptRows.find((c) => c.staffName.includes(firstName));
      const groupMatch = groupRows.find((c) => c.staffName.includes(firstName));

      const ptRevenue    = Math.round((ptMatch?.revenue || 0) * 100) / 100;
      const groupRevenue = Math.round((groupMatch?.revenue || 0) * 100) / 100;
      const hasOverride  = overrideByStaffId[s.id] != null;
      const wages        = hasOverride ? Number(overrideByStaffId[s.id]) : (wagesByStaffId[s.id] ?? null);
      const ler          = wages > 0 ? Math.round(((ptRevenue + groupRevenue) / wages) * 100) / 100 : null;

      return {
        staff_id:      s.id,
        month:         monthStr,
        pt_revenue:    ptRevenue,
        pt_sessions:   ptMatch?.sessions || 0,
        group_revenue: groupRevenue,
        group_classes: groupMatch?.classes || 0,
        wages:         wages ?? null,
        wages_source:  wages == null ? null : (hasOverride ? 'override' : 'xero'),
        ler,
        updated_at:    new Date().toISOString(),
      };
    });

    const { error } = await supabase.from('ler_monthly').upsert(rows, { onConflict: 'staff_id,month' });
    if (error) throw new Error(error.message);

    console.log(`[scheduled-coach-snapshot] Upserted ${rows.length} rows for ${monthStr}`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, month: monthStr, rows: rows.length }) };
  } catch (e) {
    console.error('[scheduled-coach-snapshot] Failed:', e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
