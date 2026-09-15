/**
 * GET /api/xero-wages
 *
 * Sums Xero Payroll wages per mapped staff member for this month and last
 * month — the same two periods mb-pt-analytics.js/mb-group-performance.js's
 * coachPerformance already covers, so LERTable.jsx can combine all three
 * into an actual labour efficiency ratio.
 *
 * Payroll runs weekly (confirmed live), so a calendar month is covered by
 * ~4-5 separate PayRuns — this sums every POSTED run whose period END date
 * falls in the requested month. The PayRuns list endpoint doesn't include
 * per-employee Payslips, so each relevant run needs its own detail fetch.
 */
import { createClient } from '@supabase/supabase-js';
import { getXeroAuth, xeroPayrollGet, parseXeroDate } from './utils/xero-auth.js';
import { ok, err, CORS } from './utils/mb-auth.js';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchAllPayRuns(accessToken, tenantId) {
  let all = [], page = 1;
  while (true) {
    const data = await xeroPayrollGet(`/PayRuns?page=${page}`, accessToken, tenantId);
    const runs = data.PayRuns || [];
    all = all.concat(runs);
    if (runs.length < 100 || page >= 10) break; // Xero paginates Payroll at 100/page; 10 pages is ~19yrs of weekly runs
    page++;
  }
  return all;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const { accessToken, tenantId } = await getXeroAuth();
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd   = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd   = endOfMonth(subMonths(now, 1));

    const { data: staffRows, error: staffErr } = await supabase
      .from('staff').select('id, full_name, xero_employee_id').not('xero_employee_id', 'is', null);
    if (staffErr) throw new Error(staffErr.message);

    const staffByEmployeeId = {};
    for (const s of staffRows || []) staffByEmployeeId[s.xero_employee_id] = s;

    const allRuns = await fetchAllPayRuns(accessToken, tenantId);
    const relevantRuns = allRuns.filter((r) => {
      if (r.PayRunStatus !== 'POSTED') return false;
      const end = parseXeroDate(r.PayRunPeriodEndDate);
      return end && end >= lastMonthStart && end <= thisMonthEnd;
    });

    const details = await Promise.all(
      relevantRuns.map((r) => xeroPayrollGet(`/PayRuns/${r.PayRunID}`, accessToken, tenantId)),
    );

    const wages = {};
    for (const s of staffRows || []) wages[s.id] = { thisMonth: 0, lastMonth: 0 };

    relevantRuns.forEach((run, i) => {
      const end = parseXeroDate(run.PayRunPeriodEndDate);
      const bucket = end <= lastMonthEnd ? 'lastMonth' : 'thisMonth';
      const detail = details[i]?.PayRuns?.[0];
      for (const slip of (detail?.Payslips || [])) {
        const staff = staffByEmployeeId[slip.EmployeeID];
        if (!staff) continue; // not mapped — see XeroEmployeeMapping.jsx
        wages[staff.id][bucket] += slip.Wages || 0;
      }
    });

    const round2 = (n) => Math.round(n * 100) / 100;
    const byStaff = (staffRows || []).map((s) => ({
      staffId:   s.id,
      staffName: s.full_name,
      thisMonth: round2(wages[s.id].thisMonth),
      lastMonth: round2(wages[s.id].lastMonth),
    }));

    return ok({ byStaff, payRunsChecked: relevantRuns.length });
  } catch (e) {
    console.error('xero-wages:', e);
    return err(e.message);
  }
};
