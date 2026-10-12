import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { Wallet, RefreshCw, Settings2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient.js';
import { useMonthlyWageOverrides } from '../utils/useMonthlyWageOverrides.js';
import { useWageOverrides } from '../utils/useWageOverrides.js';
import { monthKeyFor } from '../utils/snapshotPeriods.js';
import { lerTone } from '../utils/teamMetrics.js';

function fmtAUD(n) { return n == null ? '–' : `$${Math.round(n).toLocaleString('en-AU')}`; }
function fmtLer(n) { return n == null ? '–' : `${Number(n).toFixed(2)}x`; }

const inputClass = 'rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900';
const saveClass  = 'rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50';
const clearClass = 'rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50';

// Editor for one coach-month, shown under the grid when a cell is selected.
function WageEditor({ coach, monthDate, row, monthly, standing, onSave, onClear, onClose }) {
  const [wage, setWage]     = useState(monthly?.effectiveWage ?? '');
  const [note, setNote]     = useState(monthly?.note ?? '');
  const [saving, setSaving] = useState(false);

  const monthName = format(new Date(`${monthDate}T00:00:00`), 'MMMM yyyy');
  const xero = row?.xero_wages != null ? Number(row.xero_wages) : null;
  const previewWage = wage !== '' ? Number(wage) : (standing ? Number(standing.effectiveWage) : xero);
  const revenue = row ? Number(row.pt_revenue) + Number(row.group_revenue) : null;
  const previewLer = revenue != null && previewWage > 0 ? revenue / previewWage : null;

  const save = async () => {
    setSaving(true);
    if (wage === '') await onClear(coach.id, monthDate);
    else await onSave(coach.id, monthDate, Number(wage), note);
    setSaving(false);
  };
  const clear = async () => {
    setSaving(true);
    await onClear(coach.id, monthDate);
    setSaving(false);
  };

  return (
    <div className="border-t border-gray-200 bg-gray-50/60 px-5 py-4 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold text-gray-900">{coach.full_name} — {monthName}</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">Close</button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-500">
        <span>Xero payroll: <span className="font-medium text-gray-700">{fmtAUD(xero)}</span></span>
        <span>
          Standing wage: <span className="font-medium text-gray-700">{standing ? fmtAUD(standing.effectiveWage) : 'none'}</span>
        </span>
        <span>Revenue: <span className="font-medium text-gray-700">{fmtAUD(revenue)}</span></span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-gray-500">Wage for this month</label>
        <input
          type="number" min="0" value={wage} onChange={(e) => setWage(e.target.value)}
          placeholder={xero != null ? String(Math.round(xero)) : 'e.g. 1200'}
          className={`${inputClass} w-28`}
        />
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (e.g. covering floor shifts)" className={`${inputClass} w-64`} />
        <button disabled={saving} onClick={save} className={saveClass}>{saving ? 'Saving…' : 'Save'}</button>
        {monthly && <button disabled={saving} onClick={clear} className={clearClass}>Clear override</button>}
      </div>

      <p className="text-gray-400">
        {previewLer != null && <>LER at this wage: <span className={`font-semibold ${lerTone(previewLer)}`}>{fmtLer(previewLer)}</span>. </>}
        Replaces the Xero wage for this month only, and flows into the LER everywhere on this tab.
        {monthly ? ' Clearing it reverts to the standing wage if there is one, otherwise Xero.' : ''}
      </p>
    </div>
  );
}

// Per-coach settings, shown under the grid when a coach's name is clicked:
// Xero employee mapping and the standing wage (the default for any month
// without its own override). Moved here from the old Finance-tab LER table
// (2026-10-13) — this is now the only place to change either.
function CoachSettings({ coach, employees, takenIds, standing, onSaveMapping, onSaveStanding, onClearStanding, onClose }) {
  const [standWage, setStandWage] = useState(standing?.effectiveWage ?? '');
  const [standNote, setStandNote] = useState(standing?.note ?? '');
  const [savingMap, setSavingMap]     = useState(false);
  const [savingStand, setSavingStand] = useState(false);

  const saveMapping = async (employeeId) => {
    setSavingMap(true);
    await onSaveMapping(coach.id, employeeId);
    setSavingMap(false);
  };
  const saveStanding = async () => {
    setSavingStand(true);
    if (standWage === '') await onClearStanding(coach.id);
    else await onSaveStanding(coach.id, Number(standWage), standNote);
    setSavingStand(false);
  };
  const clearStanding = async () => {
    setSavingStand(true);
    await onClearStanding(coach.id);
    setStandWage(''); setStandNote('');
    setSavingStand(false);
  };

  // Employees already mapped to another coach are hidden, except this coach's own.
  const available = employees.filter((e) => e.id === coach.xero_employee_id || !takenIds.has(e.id));

  return (
    <div className="border-t border-gray-200 bg-gray-50/60 px-5 py-4 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold text-gray-900">{coach.full_name} — settings</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">Close</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-gray-500 w-28 shrink-0">Xero employee</label>
        <select
          value={coach.xero_employee_id || ''}
          onChange={(e) => saveMapping(e.target.value)}
          disabled={savingMap}
          className={`${inputClass} disabled:opacity-50`}
        >
          <option value="">Not mapped</option>
          {available.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
        {employees.length === 0 && <span className="text-gray-400">Loading Xero employees… (check Xero is connected on the Finance tab)</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-gray-500 w-28 shrink-0">Standing wage</label>
        <input type="number" min="0" value={standWage} onChange={(e) => setStandWage(e.target.value)} placeholder="e.g. 2000" className={`${inputClass} w-28`} />
        <input type="text" value={standNote} onChange={(e) => setStandNote(e.target.value)} placeholder="note (optional)" className={`${inputClass} w-64`} />
        <button disabled={savingStand} onClick={saveStanding} className={saveClass}>{savingStand ? 'Saving…' : 'Save'}</button>
        {standing && <button disabled={savingStand} onClick={clearStanding} className={clearClass}>Clear</button>}
      </div>

      <p className="text-gray-400">
        The standing wage is the default monthly wage for any month without its own override, instead of Xero payroll.
        LER only — neither setting touches real payroll.
      </p>
    </div>
  );
}

// Wages, month by month, one table for every coach. Each figure is the wage
// that LER actually uses — a month override if set, else the coach's standing
// wage, else Xero payroll. Click any cell to override that coach's wage for
// that month (bonus, unpaid leave, a 5-pay-run month, or a period when the
// coach was covering face-to-face seats and their wage should reflect that).
//
// Click a coach's name for their Xero mapping and standing wage.
//
// Saving goes through the set_monthly_wage_override() RPC, which recomputes
// that month's ler_monthly row, so By Coach / By Metric update straight away.
// The nightly snapshot is re-run afterwards so the Rolling 30 Days figures
// pick the change up too (and so a mapping/standing-wage change recomputes
// every month).
export default function TeamWages({ staffList, reloadStaff, monthlyRows, reloadMonthly, reloadRolling, year, loading, isManager, currentStaffId }) {
  const [selected, setSelected] = useState(null); // { staffId, monthDate }
  const [settingsFor, setSettingsFor] = useState(null); // staffId
  const [employees, setEmployees]     = useState([]);
  const [refreshing, setRefreshing]   = useState(false);
  const { overrides: monthlyOverrides, loading: ovLoading, setMonthlyOverride, clearMonthlyOverride } = useMonthlyWageOverrides(isManager);
  const { overrides: standingOverrides, loading: standingLoading, setOverride: setStanding, clearOverride: clearStanding } = useWageOverrides();

  useEffect(() => {
    if (!isManager) return;
    fetch('/api/xero-employees')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => setEmployees(d.employees || []))
      .catch(() => {});
  }, [isManager]);

  const now = new Date();
  const lastMonthIdx = now.getFullYear() === year ? now.getMonth() : 11;
  const months = [];
  for (let m = lastMonthIdx; m >= 0; m--) {
    const date = new Date(year, m, 1);
    months.push({ key: monthKeyFor(date), monthDate: format(date, 'yyyy-MM-dd'), short: format(date, 'MMM') });
  }

  const coaches = staffList.filter((s) => s.active !== false && s.is_coach !== false);

  // The RPC already recomputed the month's ler_monthly rows; re-running the
  // snapshot in the background brings the rolling-30 figures in line too.
  const afterChange = useCallback(async () => {
    setRefreshing(true);
    await reloadMonthly();
    try { await fetch('/api/scheduled-coach-snapshot'); } catch { /* the RPC already updated the month */ }
    await Promise.all([reloadMonthly(), reloadRolling()]);
    setRefreshing(false);
  }, [reloadMonthly, reloadRolling]);

  const save = async (staffId, month, wage, note) => {
    if (await setMonthlyOverride(staffId, month, wage, note)) afterChange();
  };
  const clear = async (staffId, month) => {
    if (await clearMonthlyOverride(staffId, month)) afterChange();
  };

  const saveMapping = async (staffId, employeeId) => {
    const { error } = await supabase.from('staff').update({ xero_employee_id: employeeId || null }).eq('id', staffId);
    if (!error) { await reloadStaff(); afterChange(); }
  };
  const saveStanding = async (staffId, wage, note) => {
    if (await setStanding(staffId, wage, note, currentStaffId)) afterChange();
  };
  const clearStandingFor = async (staffId) => {
    if (await clearStanding(staffId)) afterChange();
  };

  const takenIds = new Set(staffList.map((s) => s.xero_employee_id).filter(Boolean));
  const settingsCoach = settingsFor ? coaches.find((c) => c.id === settingsFor) : null;
  const updatedAt = monthlyRows.reduce((max, r) => (r.updated_at && r.updated_at > max ? r.updated_at : max), '');

  const rowFor = (staffId, monthDate) => monthlyRows.find((r) => r.staff_id === staffId && r.month === monthDate);
  const selCoach = selected ? coaches.find((c) => c.id === selected.staffId) : null;
  const busy = loading || ovLoading || standingLoading;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-gray-200 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-600" />
            <h2 className="font-semibold text-gray-900">Wages by month — {year}</h2>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            The wage LER uses for each coach and month. Click a figure to override it — for 4 vs 5 pay-run months, or when someone
            has stepped into a face-to-face seat. Click a coach's name to map them to Xero or set a standing wage.
          </p>
        </div>
        <button
          onClick={afterChange}
          disabled={refreshing}
          title={updatedAt ? `Snapshot last updated ${format(new Date(updatedAt), 'd MMM, h:mm a')}` : 'Recompute the snapshot now'}
          className="flex items-center gap-1 rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Updating…' : 'Refresh'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-right text-xs text-gray-500">
              <th className="px-5 py-2 font-medium text-left sticky left-0 bg-white">Coach</th>
              {months.map((m) => <th key={m.key} className="px-3 py-2 font-medium whitespace-nowrap">{m.short}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200/60">
            {busy ? (
              <tr><td colSpan={1 + months.length} className="px-5 py-6"><div className="h-4 w-full animate-pulse rounded bg-gray-200" /></td></tr>
            ) : coaches.map((c) => (
              <tr key={c.id} className="text-right">
                <td className="px-5 py-2 font-medium text-gray-900 text-left whitespace-nowrap sticky left-0 bg-white">
                  <button
                    onClick={() => { setSelected(null); setSettingsFor(settingsFor === c.id ? null : c.id); }}
                    className={`inline-flex items-center gap-1 hover:text-emerald-700 ${settingsFor === c.id ? 'text-emerald-700' : ''}`}
                  >
                    {c.full_name}
                    <Settings2 className="h-3 w-3 text-gray-400" />
                  </button>
                  {!c.xero_employee_id && !standingOverrides[c.id] && <span className="ml-1.5 text-[10px] font-normal text-red-500">not mapped</span>}
                  {standingOverrides[c.id] && <span className="ml-1.5 text-[10px] font-normal text-amber-600" title={standingOverrides[c.id].note || 'Standing wage override'}>standing {fmtAUD(standingOverrides[c.id].effectiveWage)}</span>}
                </td>
                {months.map((m) => {
                  const row = rowFor(c.id, m.monthDate);
                  const monthly = monthlyOverrides[`${c.id}|${m.monthDate}`];
                  const isSel = selected?.staffId === c.id && selected?.monthDate === m.monthDate;
                  const wage = row?.wages != null ? Number(row.wages) : null;
                  const standingApplied = !monthly && row?.wages_source === 'override';
                  return (
                    <td key={m.key} className="px-1.5 py-1">
                      <button
                        onClick={() => { setSettingsFor(null); setSelected(isSel ? null : { staffId: c.id, monthDate: m.monthDate }); }}
                        title={monthly?.note || (row?.xero_wages != null ? `Xero payroll ${fmtAUD(Number(row.xero_wages))}` : 'Click to set a wage')}
                        className={`w-full rounded-md px-1.5 py-1 tabular-nums transition-colors hover:bg-emerald-500/10 ${
                          isSel ? 'bg-emerald-500/10 ring-1 ring-emerald-500' : ''
                        } ${monthly ? 'text-amber-700 font-semibold' : standingApplied ? 'text-amber-700' : 'text-gray-600'}`}
                      >
                        {fmtAUD(wage)}
                        {monthly && <span className="block text-[10px] font-normal text-amber-600">override</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            {!busy && coaches.length === 0 && (
              <tr><td colSpan={1 + months.length} className="px-5 py-6 text-center text-sm text-gray-400">No active coaches found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selCoach && (
        <WageEditor
          key={`${selected.staffId}|${selected.monthDate}|${monthlyOverrides[`${selected.staffId}|${selected.monthDate}`]?.effectiveWage ?? ''}`}
          coach={selCoach}
          monthDate={selected.monthDate}
          row={rowFor(selected.staffId, selected.monthDate)}
          monthly={monthlyOverrides[`${selected.staffId}|${selected.monthDate}`]}
          standing={standingOverrides[selected.staffId]}
          onSave={save}
          onClear={clear}
          onClose={() => setSelected(null)}
        />
      )}

      {settingsCoach && (
        <CoachSettings
          key={`${settingsCoach.id}|${standingOverrides[settingsCoach.id]?.effectiveWage ?? ''}`}
          coach={settingsCoach}
          employees={employees}
          takenIds={takenIds}
          standing={standingOverrides[settingsCoach.id]}
          onSaveMapping={saveMapping}
          onSaveStanding={saveStanding}
          onClearStanding={clearStandingFor}
          onClose={() => setSettingsFor(null)}
        />
      )}

      <p className="px-5 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
        Amber = a manual override (a month override, or the coach's standing wage). Otherwise the figure is Xero payroll, counting each
        pay run in the month its pay period ends. Overrides only change the wage used for LER — they never touch real payroll.
      </p>
    </div>
  );
}
