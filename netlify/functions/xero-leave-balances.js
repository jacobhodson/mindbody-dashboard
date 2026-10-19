/**
 * POST /api/xero-leave-balances   (Authorization: Bearer <Supabase access token>)
 *
 * Refreshes `leave_balances` from Xero Payroll — each mapped staff member's
 * accrued leave (Xero's Employee.LeaveBalances, in hours: "Annual Leave" and
 * "Personal/Carer's Leave" for this org). The response carries no balances
 * at all: the HR tab reads them straight from the table, where RLS limits
 * each person to their own row unless they're a manager.
 *
 * Any signed-in staff member can trigger it (opening HR when the snapshot is
 * stale), but it's throttled to once per 15 minutes unless a manager passes
 * ?force=1. One Xero call per mapped person, sequential (see xeroPayrollGet's
 * rate-limit note).
 */
import { createClient } from '@supabase/supabase-js';
import { getXeroAuth, xeroPayrollGet } from './utils/xero-auth.js';
import { ok, err, CORS } from './utils/mb-auth.js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const THROTTLE_MS = 15 * 60 * 1000;

export function leaveCategory(name = '') {
  if (/annual/i.test(name)) return 'annual';
  if (/personal|carer|sick/i.test(name)) return 'personal';
  return null; // e.g. long service leave — kept, just not one of the two planner categories
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }, body: '' };
  }

  try {
    const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return err('Sign in required', 401);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return err('Sign in required', 401);
    const { data: me } = await supabase.from('staff').select('id, role, active').eq('auth_user_id', userData.user.id).maybeSingle();
    if (!me?.active) return err('Not an active staff member', 403);
    const isManager = me.role === 'manager' || me.role === 'admin';
    const force = isManager && event.queryStringParameters?.force === '1';

    const { data: latest } = await supabase.from('leave_balances').select('as_of').order('as_of', { ascending: false }).limit(1).maybeSingle();
    if (!force && latest && Date.now() - new Date(latest.as_of).getTime() < THROTTLE_MS) {
      return ok({ skipped: true, as_of: latest.as_of });
    }

    return ok(await refreshLeaveBalances());
  } catch (e) {
    console.error('xero-leave-balances:', e);
    return err(e.message);
  }
};

/** Pull every mapped person's balances from Xero into leave_balances. */
export async function refreshLeaveBalances() {
  const { data: staff, error: staffErr } = await supabase
    .from('staff').select('id, xero_employee_id').eq('active', true).not('xero_employee_id', 'is', null);
  if (staffErr) throw new Error(staffErr.message);

  const { accessToken, tenantId } = await getXeroAuth();
  const asOf = new Date().toISOString();
  const rows = [];
  const failed = [];
  for (const s of staff) {
    try {
      const data = await xeroPayrollGet(`/Employees/${s.xero_employee_id}`, accessToken, tenantId);
      for (const b of data.Employees?.[0]?.LeaveBalances || []) {
        rows.push({
          staff_id: s.id,
          leave_type_id: b.LeaveTypeID,
          leave_name: b.LeaveName,
          category: leaveCategory(b.LeaveName),
          units: Number(b.NumberOfUnits) || 0,
          unit_type: b.TypeOfUnits || 'Hours',
          as_of: asOf,
        });
      }
    } catch (e) {
      console.error('xero-leave-balances employee', s.id, e.message);
      failed.push(s.id);
    }
  }

  if (rows.length) {
    const { error: upErr } = await supabase.from('leave_balances').upsert(rows, { onConflict: 'staff_id,leave_type_id' });
    if (upErr) throw new Error(upErr.message);
  }
  // Drop leave types Xero no longer reports for people we did fetch.
  const fetched = staff.map((s) => s.id).filter((id) => !failed.includes(id));
  if (fetched.length) {
    await supabase.from('leave_balances').delete().in('staff_id', fetched).lt('as_of', asOf);
  }

  return { refreshed: rows.length, people: fetched.length, failed: failed.length, as_of: asOf };
}
