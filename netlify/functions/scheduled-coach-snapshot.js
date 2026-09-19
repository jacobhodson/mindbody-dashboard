/**
 * Coach-performance snapshots — populates `ler_monthly` (one row per coach
 * per calendar month) and `coach_rolling30` (one row per coach per day, the
 * trailing-30-day equivalent) so the Team tab, LER table, and Group/PT
 * tables can read real history from the database instead of only ever
 * showing a live this-month/last-month view.
 *
 * Default run (the nightly pg_cron call, no params): refreshes the CURRENT
 * month's ler_monthly row per coach plus today's coach_rolling30 row. A
 * month's row keeps being refreshed with the latest numbers every day
 * while it's "this month", then simply stops being touched once the
 * calendar rolls over — no explicit month-end step needed.
 *
 * `?months=2026-01,2026-02,...` recomputes those specific months instead
 * (ler_monthly only) — used to backfill history. Earlier notes claimed
 * earlier months couldn't be reconstructed; that was wrong — Mindbody's
 * appointments/sales/classes endpoints take arbitrary date ranges and
 * Xero payroll goes back ~2 years. The live endpoints just never fetched
 * further than ~2 months. A backfilled month is computed the same way the
 * nightly run would have computed it on that month's last day (see
 * metricsForMonth), so backfilled and organically-captured months are
 * comparable.
 *
 * Definitions (same as mb-pt-analytics.js's coachPerformance /
 * mb-group-performance.js, which remain the live per-week views):
 *  - PT/SP revenue: signed-off (Status Completed) sessions x the average
 *    PT/SP sale price over the 60 days ending on the as-of date.
 *  - Group revenue: countable class count x the PREVIOUS calendar month's
 *    average value per class (that month's group-membership revenue /
 *    its countable classes).
 *  - Wages: month-specific override -> standing override -> Xero payroll
 *    (posted pay runs whose period ENDS in the month). Rolling-30 wages
 *    are built day by day: each pay run's wages spread evenly over its
 *    pay period, override months spread evenly over the month. Pay runs
 *    are posted after the fact, so the most recent days usually have no
 *    run yet — those days are filled at the average daily rate of the
 *    covered days, rather than leaving the window short on wages (which
 *    would inflate LER).
 *
 * Calls Mindbody/Xero directly rather than HTTP-calling the other
 * functions (same reasoning as scheduled-daily-refresh.js — a chain of
 * HTTP calls between scheduled functions risks a timeout chain).
 *
 * Coach matching across sources: first-name substring against staff
 * full_name, same as LERTable.jsx always did (revisit if two coaches ever
 * share a first name).
 */
import { createClient } from '@supabase/supabase-js';
import { getStaffToken, mbGet } from './utils/mb-auth.js';
import { getXeroAuth, xeroPayrollGet, parseXeroDate } from './utils/xero-auth.js';
import { classifySession as classify } from './utils/session-classify.js';
import {
  subDays, subMonths, format, parseISO,
  startOfMonth, endOfMonth, startOfDay, getDaysInMonth,
  differenceInCalendarDays, eachDayOfInterval,
} from 'date-fns';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const RATE_WINDOW_DAYS = 60;
const ROLLING_DAYS = 30;
const SIGNED_OFF = 'Completed';

const GROUP_MEMBERSHIP_KEYWORDS = ['newstrength unlimited', 'newstrength 2x week', 'newstrength single session'];
const isGroupMembership = (description = '') => {
  const d = description.toLowerCase();
  return GROUP_MEMBERSHIP_KEYWORDS.some((k) => d.includes(k));
};
function isExcludedFreeClass(name, date) {
  const n = (name || '').trim().toLowerCase();
  const day = format(date, 'EEEE');
  if (day === 'Saturday' && n === 'open gym') return true;
  if (day === 'Sunday' && n === 'run club') return true;
  return false;
}

const ymd   = (d) => format(d, 'yyyy-MM-dd');
const round2 = (n) => Math.round(n * 100) / 100;

async function fetchAll(path, token, params) {
  let all = [], offset = 0;
  while (true) {
    const data = await mbGet(path, token, { ...params, Limit: 200, Offset: offset });
    const key  = Object.keys(data).find((k) => Array.isArray(data[k]));
    const page = key ? data[key] : [];
    all = all.concat(page);
    if (page.length < 200 || offset >= 9800) break;
    offset += 200;
  }
  return all;
}

// ── Mindbody: one fetch of everything a set of periods needs ──────────────
async function buildBundle(token, start, end) {
  const s = format(start, "yyyy-MM-dd'T'00:00:00");
  const e = format(end,   "yyyy-MM-dd'T'23:59:59");
  const [sessionTypeData, appts, sales, classes] = await Promise.all([
    mbGet('/site/sessiontypes', token, { OnlineOnly: false }),
    fetchAll('/appointment/staffappointments', token, { StartDate: s, EndDate: e }),
    fetchAll('/sale/sales', token, { StartSaleDateTime: s, EndSaleDateTime: e }),
    fetchAll('/class/classes', token, { StartDateTime: s, EndDateTime: e }),
  ]);
  const typeMap = {};
  for (const t of (sessionTypeData.SessionTypes || [])) typeMap[t.Id] = t.Name || '';

  return {
    sales: sales
      .filter((x) => x.SaleDate)
      .map((x) => ({ date: parseISO(x.SaleDate), items: x.PurchasedItems || [] })),
    signedOff: appts
      .map((a) => ({
        type:      classify(typeMap[a.SessionTypeId] || ''),
        staffId:   String(a.StaffId ?? a.Staff?.Id ?? ''),
        staffName: `${a.Staff?.FirstName || ''} ${a.Staff?.LastName || ''}`.trim(),
        status:    a.Status,
        date:      parseISO(a.StartDateTime),
      }))
      .filter((a) => (a.type === 'pt' || a.type === 'sp') && a.status === SIGNED_OFF && a.staffId),
    classes: classes
      .filter((c) => !c.IsCanceled)
      .map((c) => ({
        name:      (c.ClassDescription?.Name || c.Name || '').trim(),
        date:      parseISO(c.StartDateTime),
        staffId:   String(c.Staff?.Id ?? ''),
        staffName: c.Staff?.Name || `${c.Staff?.FirstName || ''} ${c.Staff?.LastName || ''}`.trim() || 'Unassigned',
      }))
      .filter((c) => !isExcludedFreeClass(c.name, c.date)),
  };
}

const inRange = (d, s, e) => d >= s && d <= e;

// Average PT / SP sale price over the RATE_WINDOW_DAYS ending on asOf.
function ratesAsOf(bundle, asOf) {
  const from = startOfDay(subDays(asOf, RATE_WINDOW_DAYS));
  const sums = { pt: 0, sp: 0 }, counts = { pt: 0, sp: 0 };
  for (const sale of bundle.sales) {
    if (!inRange(sale.date, from, asOf)) continue;
    for (const item of sale.items) {
      if (item.Returned || !(item.TotalAmount > 0)) continue;
      const type = classify(item.Description || '');
      if (type !== 'pt' && type !== 'sp') continue;
      sums[type] += item.TotalAmount;
      counts[type]++;
    }
  }
  return { pt: counts.pt > 0 ? sums.pt / counts.pt : 0, sp: counts.sp > 0 ? sums.sp / counts.sp : 0 };
}

// Average value of one countable group class in the calendar month starting
// at monthStart: that month's group-membership revenue / its class count.
function avgClassValueForMonth(bundle, monthStart) {
  const monthEnd = endOfMonth(monthStart);
  let revenue = 0;
  for (const sale of bundle.sales) {
    if (!inRange(sale.date, monthStart, monthEnd)) continue;
    for (const item of sale.items) {
      if (item.Returned || !isGroupMembership(item.Description || '')) continue;
      revenue += item.TotalAmount || 0;
    }
  }
  const count = bundle.classes.filter((c) => inRange(c.date, monthStart, monthEnd)).length;
  return count > 0 ? revenue / count : 0;
}

function ptByCoachIn(bundle, start, end, rates) {
  const out = {};
  for (const a of bundle.signedOff) {
    if (!inRange(a.date, start, end)) continue;
    if (!out[a.staffId]) out[a.staffId] = { staffName: a.staffName, sessions: 0, revenue: 0 };
    out[a.staffId].sessions += 1;
    out[a.staffId].revenue  += rates[a.type] || 0;
  }
  return Object.values(out);
}

function groupByCoachIn(bundle, start, end, avgClassValue) {
  const out = {};
  for (const c of bundle.classes) {
    if (!c.staffId || !inRange(c.date, start, end)) continue;
    if (!out[c.staffId]) out[c.staffId] = { staffName: c.staffName, classes: 0, revenue: 0 };
    out[c.staffId].classes += 1;
    out[c.staffId].revenue += avgClassValue;
  }
  return Object.values(out);
}

// ── Xero: posted pay runs overlapping [windowStart, windowEnd] ────────────
async function loadPayRuns(windowStart, windowEnd) {
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

  const ws = ymd(windowStart), we = ymd(windowEnd);
  const relevant = allRuns
    .filter((r) => r.PayRunStatus === 'POSTED')
    .map((r) => ({ id: r.PayRunID, start: parseXeroDate(r.PayRunPeriodStartDate), end: parseXeroDate(r.PayRunPeriodEndDate) }))
    .filter((r) => r.start && r.end)
    .map((r) => ({ ...r, start: ymd(r.start), end: ymd(r.end) }))
    .filter((r) => r.end >= ws && r.start <= we);

  // Sequential — Xero's rate limit was tripped live by a burst of these
  // (see xero-wages.js); a handful of runs per window, still fast enough.
  const runs = [];
  for (const r of relevant) {
    const detail = await xeroPayrollGet(`/PayRuns/${r.id}`, accessToken, tenantId);
    const byStaff = {};
    for (const slip of (detail?.PayRuns?.[0]?.Payslips || [])) {
      const staff = staffByEmployeeId[slip.EmployeeID];
      if (!staff) continue;
      byStaff[staff.id] = (byStaff[staff.id] || 0) + (slip.Wages || 0);
    }
    runs.push({ start: r.start, end: r.end, days: differenceInCalendarDays(parseISO(r.end), parseISO(r.start)) + 1, byStaff });
  }
  return runs;
}

// Xero wages for a calendar month: runs whose period ENDS in it (same
// bucketing xero-wages.js uses).
function xeroWagesForMonth(runs, monthStart) {
  const ms = ymd(monthStart), me = ymd(endOfMonth(monthStart));
  const out = {};
  for (const r of runs) {
    if (r.end < ms || r.end > me) continue;
    for (const [staffId, w] of Object.entries(r.byStaff)) out[staffId] = (out[staffId] || 0) + w;
  }
  return out;
}

// Rolling-window wages for one coach, day by day — see file header.
function rollingWages(staffId, dayStrs, runs, overrideFor) {
  let total = 0, overrideDays = 0, overrideSum = 0, xeroDays = 0, xeroSum = 0, gaps = 0;
  for (const ds of dayStrs) {
    const ovr = overrideFor(staffId, `${ds.slice(0, 7)}-01`);
    if (ovr != null) {
      const perDay = ovr / getDaysInMonth(parseISO(ds));
      total += perDay; overrideSum += perDay; overrideDays++;
      continue;
    }
    let covered = false, v = 0;
    for (const r of runs) {
      if (ds < r.start || ds > r.end || r.byStaff[staffId] == null) continue;
      v += r.byStaff[staffId] / r.days;
      covered = true;
    }
    if (covered) { total += v; xeroSum += v; xeroDays++; } else gaps++;
  }
  if (xeroDays === 0 && overrideDays === 0) return { wages: null, source: null };

  const fillRate = xeroDays > 0 ? xeroSum / xeroDays : overrideSum / overrideDays;
  total += fillRate * gaps;
  const source = overrideDays === 0 ? 'xero' : (overrideDays === dayStrs.length ? 'override' : 'mixed');
  return { wages: round2(total), source };
}

// ── Row builders ───────────────────────────────────────────────────────────
function matchCoach(rows, firstName) {
  return rows.find((c) => c.staffName.includes(firstName));
}

function buildMonthRows({ staffList, bundle, runs, overrideFor, monthStart, asOf }) {
  const monthEnd = endOfMonth(monthStart);
  const end      = asOf < monthEnd ? asOf : monthEnd;
  const rates    = ratesAsOf(bundle, end);
  const avgClass = avgClassValueForMonth(bundle, startOfMonth(subMonths(monthStart, 1)));
  const ptRows    = ptByCoachIn(bundle, monthStart, end, rates);
  const groupRows = groupByCoachIn(bundle, monthStart, end, avgClass);
  const xeroByStaff = xeroWagesForMonth(runs, monthStart);
  const monthStr = ymd(monthStart);

  return staffList.map((s) => {
    const pt = matchCoach(ptRows, s.full_name);
    const gr = matchCoach(groupRows, s.full_name);
    const ptRevenue    = round2(pt?.revenue || 0);
    const groupRevenue = round2(gr?.revenue || 0);
    const ovr   = overrideFor(s.id, monthStr);
    const xero  = xeroByStaff[s.id] != null ? round2(xeroByStaff[s.id]) : null;
    const wages = ovr ?? xero;
    return {
      staff_id:      s.id,
      month:         monthStr,
      pt_revenue:    ptRevenue,
      pt_sessions:   pt?.sessions || 0,
      group_revenue: groupRevenue,
      group_classes: gr?.classes || 0,
      xero_wages:    xero,
      wages,
      wages_source:  wages == null ? null : (ovr != null ? 'override' : 'xero'),
      ler:           wages > 0 ? round2((ptRevenue + groupRevenue) / wages) : null,
      updated_at:    new Date().toISOString(),
    };
  });
}

function buildRollingRows({ staffList, bundle, runs, overrideFor, now }) {
  const start   = startOfDay(subDays(now, ROLLING_DAYS - 1));
  const rates   = ratesAsOf(bundle, now);
  const avgClass = avgClassValueForMonth(bundle, startOfMonth(subMonths(now, 1)));
  const ptRows    = ptByCoachIn(bundle, start, now, rates);
  const groupRows = groupByCoachIn(bundle, start, now, avgClass);
  const dayStrs   = eachDayOfInterval({ start, end: now }).map(ymd);

  return staffList.map((s) => {
    const pt = matchCoach(ptRows, s.full_name);
    const gr = matchCoach(groupRows, s.full_name);
    const ptRevenue    = round2(pt?.revenue || 0);
    const groupRevenue = round2(gr?.revenue || 0);
    const { wages, source } = rollingWages(s.id, dayStrs, runs, overrideFor);
    return {
      staff_id:      s.id,
      as_of:         ymd(now),
      pt_revenue:    ptRevenue,
      pt_sessions:   pt?.sessions || 0,
      group_revenue: groupRevenue,
      group_classes: gr?.classes || 0,
      wages,
      wages_source:  source,
      ler:           wages > 0 ? round2((ptRevenue + groupRevenue) / wages) : null,
      updated_at:    new Date().toISOString(),
    };
  });
}

async function loadStaffAndOverrides() {
  const [staffList, standing, monthly] = await Promise.all([
    // is_coach excludes non-revenue-generating staff (e.g. a generic admin
    // login) so no row is ever created for them.
    supabase.from('staff').select('id, full_name').eq('active', true).eq('is_coach', true).then(({ data }) => data || []),
    supabase.from('staff_wage_overrides').select('staff_id, effective_wage').then(({ data }) => data || []),
    supabase.from('staff_wage_overrides_monthly').select('staff_id, month, effective_wage').then(({ data }) => data || []),
  ]);
  const standingBy = {}, monthlyBy = {};
  for (const o of standing) standingBy[o.staff_id] = Number(o.effective_wage);
  for (const o of monthly)  monthlyBy[`${o.staff_id}|${o.month}`] = Number(o.effective_wage);
  // month-specific -> standing -> none
  const overrideFor = (staffId, monthStr) => monthlyBy[`${staffId}|${monthStr}`] ?? standingBy[staffId] ?? null;
  return { staffList, overrideFor };
}

async function safeRuns(windowStart, windowEnd) {
  try { return await loadPayRuns(windowStart, windowEnd); }
  catch (e) {
    console.warn('[scheduled-coach-snapshot] Xero pay runs failed, continuing without wages:', e.message);
    return [];
  }
}

// ── Modes ──────────────────────────────────────────────────────────────────
async function runNightly(token, now) {
  const monthStart = startOfMonth(now);
  const rollStart  = startOfDay(subDays(now, ROLLING_DAYS - 1));
  const prevStart  = startOfMonth(subMonths(now, 1));
  const bundleStart = [prevStart, subDays(now, RATE_WINDOW_DAYS), rollStart].reduce((a, b) => (a < b ? a : b));

  const [{ staffList, overrideFor }, bundle, runs] = await Promise.all([
    loadStaffAndOverrides(),
    buildBundle(token, bundleStart, now),
    safeRuns(rollStart < monthStart ? rollStart : monthStart, endOfMonth(now)),
  ]);

  const monthRows   = buildMonthRows({ staffList, bundle, runs, overrideFor, monthStart, asOf: now });
  const rollingRows = buildRollingRows({ staffList, bundle, runs, overrideFor, now });

  const [m, r] = await Promise.all([
    supabase.from('ler_monthly').upsert(monthRows, { onConflict: 'staff_id,month' }),
    supabase.from('coach_rolling30').upsert(rollingRows, { onConflict: 'staff_id,as_of' }),
  ]);
  if (m.error) throw new Error(`ler_monthly: ${m.error.message}`);
  if (r.error) throw new Error(`coach_rolling30: ${r.error.message}`);
  return { mode: 'nightly', month: ymd(monthStart), monthRows: monthRows.length, rollingRows: rollingRows.length };
}

async function runMonths(token, now, monthStrs) {
  const { staffList, overrideFor } = await loadStaffAndOverrides();
  const done = [];
  for (const ms of monthStrs) {
    const monthStart = startOfMonth(parseISO(`${ms}-01`));
    const asOf       = endOfMonth(monthStart) < now ? endOfMonth(monthStart) : now;
    const prevStart  = startOfMonth(subMonths(monthStart, 1));
    const bundleStart = [prevStart, subDays(asOf, RATE_WINDOW_DAYS)].reduce((a, b) => (a < b ? a : b));

    const [bundle, runs] = await Promise.all([
      buildBundle(token, bundleStart, asOf),
      safeRuns(monthStart, endOfMonth(monthStart)),
    ]);
    const rows = buildMonthRows({ staffList, bundle, runs, overrideFor, monthStart, asOf });
    const { error } = await supabase.from('ler_monthly').upsert(rows, { onConflict: 'staff_id,month' });
    if (error) throw new Error(`ler_monthly ${ms}: ${error.message}`);
    done.push({ month: ymd(monthStart), rows: rows.length });
    console.log(`[scheduled-coach-snapshot] Backfilled ${ymd(monthStart)}`);
  }
  return { mode: 'months', done };
}

export const handler = async (event) => {
  try {
    const now = new Date();
    const token = await getStaffToken();
    const months = event?.queryStringParameters?.months;
    const result = months
      ? await runMonths(token, now, months.split(',').map((m) => m.trim()).filter(Boolean))
      : await runNightly(token, now);
    console.log('[scheduled-coach-snapshot]', JSON.stringify(result));
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...result }) };
  } catch (e) {
    console.error('[scheduled-coach-snapshot] Failed:', e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
