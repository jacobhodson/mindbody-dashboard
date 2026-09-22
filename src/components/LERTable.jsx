import { useState, useEffect, useCallback, Fragment } from 'react';
import { format } from 'date-fns';
import { Gauge, Lock, Settings2, ChevronUp, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabaseClient.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import { useWageOverrides } from '../utils/useWageOverrides.js';
import { useMonthlyWageOverrides } from '../utils/useMonthlyWageOverrides.js';
import { useCoachMonthlySnapshots } from '../utils/useCoachMonthlySnapshots.js';
import { useCoachRolling30 } from '../utils/useCoachRolling30.js';
import { ROLLING_KEY, monthKeyFor, monthDateOf, periodLabel, snapshotRowFor } from '../utils/snapshotPeriods.js';
import { lerTone } from '../utils/teamMetrics.js';
import PeriodTabs from './PeriodTabs.jsx';

function fmtAUD(n) {
  if (n === undefined || n === null) return '–';
  return `$${Math.round(n).toLocaleString('en-AU')}`;
}

const inputClass = 'rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900';
const saveClass  = 'rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50';
const clearClass = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50';

// Inline per-coach settings, expanded in place under a row: Xero employee
// mapping, a wage override for the period being viewed (per MONTH — pick a
// month up top; the rolling 30-day view spreads each month's override
// across its days), and a standing default wage used for any month without
// its own override. All for LER only — none of it touches real payroll.
function CoachSettingsRow({
  staffId, xeroEmployeeId, employees, standing, monthly, month, monthLabel, currentStaffId,
  setStanding, clearStanding, setMonthly, clearMonthly, onMappingSaved, onSaved,
}) {
  const [monthWage, setMonthWage]     = useState(monthly?.effectiveWage ?? '');
  const [monthNote, setMonthNote]     = useState(monthly?.note ?? '');
  const [standWage, setStandWage]     = useState(standing?.effectiveWage ?? '');
  const [standNote, setStandNote]     = useState(standing?.note ?? '');
  const [savingMap, setSavingMap]     = useState(false);
  const [savingMonth, setSavingMonth] = useState(false);
  const [savingStand, setSavingStand] = useState(false);

  const saveMapping = async (employeeId) => {
    setSavingMap(true);
    const { error } = await supabase.from('staff').update({ xero_employee_id: employeeId || null }).eq('id', staffId);
    setSavingMap(false);
    if (!error) onMappingSaved();
  };

  const saveMonth = async () => {
    setSavingMonth(true);
    if (monthWage === '') await clearMonthly(staffId, month);
    else await setMonthly(staffId, month, Number(monthWage), monthNote);
    setSavingMonth(false);
    onSaved();
  };
  const clearMonth = async () => {
    setSavingMonth(true);
    await clearMonthly(staffId, month);
    setMonthWage(''); setMonthNote('');
    setSavingMonth(false);
    onSaved();
  };

  const saveStanding = async () => {
    setSavingStand(true);
    if (standWage === '') await clearStanding(staffId);
    else await setStanding(staffId, Number(standWage), standNote, currentStaffId);
    setSavingStand(false);
    onSaved();
  };

  return (
    <tr className="bg-gray-50/40">
      <td colSpan={4} className="px-4 py-3">
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 w-28 shrink-0">Xero employee:</span>
            <select
              value={xeroEmployeeId || ''}
              onChange={(e) => saveMapping(e.target.value)}
              disabled={savingMap}
              className={`${inputClass} disabled:opacity-50`}
            >
              <option value="">Not mapped</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </div>

          {month ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-gray-500 w-28 shrink-0">Wage for {monthLabel}:</span>
              <input type="number" value={monthWage} onChange={(e) => setMonthWage(e.target.value)} placeholder="e.g. 1200" className={`${inputClass} w-24`} />
              <input type="text" value={monthNote} onChange={(e) => setMonthNote(e.target.value)} placeholder="note (optional)" className={`${inputClass} w-36`} />
              <button disabled={savingMonth} onClick={saveMonth} className={saveClass}>Save</button>
              {monthly && <button disabled={savingMonth} onClick={clearMonth} className={clearClass}>Clear</button>}
              <span className="text-gray-400">Replaces the Xero wage for this month only.</span>
            </div>
          ) : (
            <p className="text-gray-400">
              Wage overrides are set per month — pick a month above to edit one. The rolling 30 days uses each month's override, spread across its days.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-gray-500 w-28 shrink-0">Standing wage:</span>
            <input type="number" value={standWage} onChange={(e) => setStandWage(e.target.value)} placeholder="e.g. 2000" className={`${inputClass} w-24`} />
            <input type="text" value={standNote} onChange={(e) => setStandNote(e.target.value)} placeholder="note (optional)" className={`${inputClass} w-36`} />
            <button disabled={savingStand} onClick={saveStanding} className={saveClass}>Save</button>
            <span className="text-gray-400">Default monthly wage for months without their own override. LER only — doesn't touch real payroll.</span>
          </div>
        </div>
      </td>
    </tr>
  );
}

/**
 * Labour efficiency ratio (revenue ÷ wages) per coach, month by month plus
 * a rolling 30 days. Reads the nightly snapshot tables (ler_monthly /
 * coach_rolling30 — see scheduled-coach-snapshot.js) rather than stitching
 * PT, Group and Xero together live in the browser, so every month of the
 * year is selectable and matches the Team tab exactly. Refresh re-runs the
 * snapshot on demand.
 *
 * Wages: month-specific override -> standing override -> Xero Payroll.
 * Overrides and Xero employee mapping are set inline per row (the gear).
 * Changing a month's override recomputes that month immediately (RPC);
 * anything touching the rolling window or wages re-runs the snapshot in the
 * background.
 *
 * Coaches are matched across sources by first-name substring (see the
 * snapshot function) — a documented simplification, not an ID join.
 */
export default function LERTable({ isManager, currentStaffId }) {
  const year = new Date().getFullYear();
  const [period, setPeriod] = useState(monthKeyFor(new Date()));
  const [openStaffId, setOpenStaffId] = useState(null);
  const [employees, setEmployees]     = useState([]);
  const [refreshing, setRefreshing]   = useState(false);

  const { staffList, reload: reloadStaff } = useAllStaff();
  const { rows: monthlyRows, loading: monthlyLoading, reload: reloadMonthly } = useCoachMonthlySnapshots(isManager, year);
  const { latest, latestAsOf, loading: rollingLoading, reload: reloadRolling } = useCoachRolling30(isManager);
  const { overrides: standingOverrides, loading: standingLoading, setOverride: setStanding, clearOverride: clearStanding } = useWageOverrides();
  const { overrides: monthlyOverrides, loading: monthlyOvLoading, setMonthlyOverride, clearMonthlyOverride } = useMonthlyWageOverrides(isManager);

  useEffect(() => {
    if (!isManager) return;
    fetch('/api/xero-employees')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => setEmployees(d.employees || []))
      .catch(() => {});
  }, [isManager]);

  const refreshSnapshots = useCallback(async () => {
    setRefreshing(true);
    try { await fetch('/api/scheduled-coach-snapshot'); } catch { /* just reload what's there */ }
    await Promise.all([reloadMonthly(), reloadRolling()]);
    setRefreshing(false);
  }, [reloadMonthly, reloadRolling]);

  if (!isManager) return null;

  const loading = monthlyLoading || rollingLoading || standingLoading || monthlyOvLoading;
  const isRolling = period === ROLLING_KEY;
  const month = isRolling ? null : monthDateOf(period);

  const rows = !loading
    ? staffList
        // is_coach excludes staff who don't generate revenue (e.g. a
        // generic admin login) — an office role, not a coaching one, so
        // they'd otherwise show up here at $0/0.00x every month.
        .filter((s) => s.active !== false && s.is_coach !== false)
        .map((s) => {
          const r = snapshotRowFor(period, s.id, monthlyRows, latest);
          return {
            staffId: s.id, name: s.full_name, has: !!r,
            revenue: r ? Number(r.pt_revenue) + Number(r.group_revenue) : null,
            wage:    r?.wages != null ? Number(r.wages) : null,
            ler:     r?.ler != null ? Number(r.ler) : null,
            source:  r?.wages_source || null,
            updatedAt: r?.updated_at || null,
            xeroEmployeeId: s.xero_employee_id || null,
          };
        })
    : [];

  const hasData = rows.some((r) => r.has);
  const totalRevenue = rows.reduce((sum, r) => sum + (r.revenue || 0), 0);
  const totalWage    = rows.reduce((sum, r) => sum + (r.wage || 0), 0);
  const totalLer     = totalWage > 0 ? totalRevenue / totalWage : null;
  const updatedAt    = rows.reduce((max, r) => (r.updatedAt && r.updatedAt > max ? r.updatedAt : max), '');

  const onSaved = () => { reloadMonthly(); refreshSnapshots(); };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-gray-200 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-emerald-600" />
            <h2 className="font-semibold text-gray-900">Labour Efficiency Ratio</h2>
            <span className="flex items-center gap-1 rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 shrink-0">
              <Lock className="h-2.5 w-2.5" /> Manager
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            PT + Group revenue ÷ wages, per coach · {periodLabel(period)}
            {isRolling && latestAsOf ? ` (30 days to ${latestAsOf})` : ''} — click a coach to map Xero or override wages
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PeriodTabs value={period} onChange={setPeriod} showSnapshots year={year} />
          <button
            onClick={refreshSnapshots}
            disabled={refreshing}
            title={updatedAt ? `Snapshot last updated ${format(new Date(updatedAt), 'd MMM, h:mm a')}` : 'Recompute the snapshot now'}
            className="flex items-center gap-1 rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Updating…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Coach</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Revenue</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Wages</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">LER</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <tr className="bg-gray-50/60">
              <td className="px-4 py-3">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-sm font-semibold text-gray-800">Team Total</span>
                </span>
              </td>
              {loading ? (
                <td colSpan={3} className="px-4 py-3"><div className="h-4 w-full animate-pulse rounded bg-gray-200" /></td>
              ) : (
                <>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-800">{hasData ? fmtAUD(totalRevenue) : '–'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{hasData ? fmtAUD(totalWage) : '–'}</td>
                  <td className={`px-4 py-3 text-right font-bold tabular-nums ${totalLer !== null ? lerTone(totalLer) : 'text-gray-900'}`}>{totalLer !== null ? `${totalLer.toFixed(2)}x` : '–'}</td>
                </>
              )}
            </tr>

            {!loading && rows.map((r) => (
              <Fragment key={r.staffId}>
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <button
                      onClick={() => setOpenStaffId(openStaffId === r.staffId ? null : r.staffId)}
                      className="flex items-center gap-1.5 hover:text-gray-900"
                      title="Xero mapping & wage overrides"
                    >
                      {openStaffId === r.staffId ? <ChevronUp className="h-3 w-3 text-gray-400" /> : <Settings2 className="h-3 w-3 text-gray-400" />}
                      {r.name}
                      {!r.xeroEmployeeId && r.source !== 'override' && (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[10px] font-medium text-amber-600">not mapped</span>
                      )}
                      {(r.source === 'override' || r.source === 'mixed') && (
                        <span
                          className="text-[10px] text-amber-600"
                          title={monthlyOverrides[`${r.staffId}|${month}`]?.note || standingOverrides[r.staffId]?.note || 'Manual wage override'}
                        >
                          ·{r.source === 'mixed' ? 'part override' : 'override'}
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.has ? fmtAUD(r.revenue) : '–'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">{r.wage != null ? fmtAUD(r.wage) : '–'}</td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${r.ler === null ? 'text-gray-300' : lerTone(r.ler)}`}>
                    {r.ler !== null ? `${r.ler.toFixed(2)}x` : '–'}
                  </td>
                </tr>
                {openStaffId === r.staffId && (
                  <CoachSettingsRow
                    key={`${r.staffId}|${period}`}
                    staffId={r.staffId}
                    xeroEmployeeId={r.xeroEmployeeId}
                    employees={employees}
                    standing={standingOverrides[r.staffId]}
                    monthly={month ? monthlyOverrides[`${r.staffId}|${month}`] : undefined}
                    month={month}
                    monthLabel={month ? format(new Date(`${month}T00:00:00`), 'MMMM') : ''}
                    currentStaffId={currentStaffId}
                    setStanding={setStanding}
                    clearStanding={clearStanding}
                    setMonthly={setMonthlyOverride}
                    clearMonthly={clearMonthlyOverride}
                    onMappingSaved={() => { reloadStaff(); refreshSnapshots(); }}
                    onSaved={onSaved}
                  />
                )}
              </Fragment>
            ))}

            {!loading && rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">No active coaches found</td></tr>
            )}
            {!loading && rows.length > 0 && !hasData && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">No snapshot for this period yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="px-5 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
        Revenue is PT/SP + Group class $ value (see those tables). Wages are the month's override if one is set, else the standing override,
        else Xero Payroll. LER = revenue ÷ wages. Green is 3x or more, orange is 2.5x to under 3x, red is under 2.5x.
        Numbers come from the nightly snapshot{updatedAt ? ` (last updated ${format(new Date(updatedAt), 'd MMM, h:mm a')})` : ''} — hit Refresh to update now.
        {isRolling && ' Rolling 30 days spreads each pay run across its pay period, and fills the most recent unpaid days at the average daily rate, so the latest week isn\'t missing from wages.'}
      </p>
    </div>
  );
}
