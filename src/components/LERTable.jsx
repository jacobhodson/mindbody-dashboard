import { useState, useEffect } from 'react';
import { Gauge, Lock } from 'lucide-react';
import { useGroupPerformance } from '../utils/useGroupPerformance.js';
import { useWageOverrides } from '../utils/useWageOverrides.js';
import { useAllStaff } from '../utils/useAllStaff.js';

function fmtAUD(n) {
  if (n === undefined || n === null) return '–';
  return `$${Math.round(n).toLocaleString('en-AU')}`;
}

const PERIODS = [
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
];

/**
 * Labour efficiency ratio (revenue ÷ wages) per coach — the piece that
 * stitches together three previously-separate data sources:
 *   - PT/SP revenue: mb-pt-analytics.js's coachPerformance (passed in as
 *     `ptData`, already fetched app-wide — not re-fetched here)
 *   - Group class revenue: mb-group-performance.js via useGroupPerformance
 *   - Wages: xero-wages.js (Xero Payroll), with staff_wage_overrides
 *     substituted in for anyone who has one set (e.g. a profit-share
 *     salary that doesn't reflect coaching value — see WageOverridesPanel.jsx)
 *
 * Only this/last month — Xero payroll runs weekly, PT/Group revenue is
 * only ever computed live for a ~2-month window, so this is as far back
 * as a real LER can go right now. Rolling 3/6/12-month averages need
 * ler_monthly to actually accumulate history first (not built yet — see
 * the project memory).
 *
 * Matches a coach across the three sources by first-name substring
 * (mb-pt-analytics.js/mb-group-performance.js use Mindbody's full
 * "First Last" staffName; this app's own `staff.full_name` values happen
 * to all be first-name-only today) — a real, documented simplification,
 * not a robust ID join. Revisit if two active coaches ever share a first
 * name, or fold in a proper mindbody_staff_id mapping (mirroring
 * xero_employee_id) if this gets fragile.
 */
export default function LERTable({ isManager, ptData }) {
  const { staffList } = useAllStaff();
  const { data: groupData, loading: groupLoading } = useGroupPerformance(isManager);
  const { overrides, loading: overridesLoading } = useWageOverrides();
  const [wages, setWages]         = useState(null);
  const [wagesLoading, setWagesLoading] = useState(true);
  const [wagesError, setWagesError]     = useState(null);
  const [period, setPeriod]       = useState('thisMonth');

  useEffect(() => {
    if (!isManager) { setWagesLoading(false); return; }
    setWagesLoading(true);
    fetch('/api/xero-wages')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setWages)
      .catch((e) => setWagesError(e.message))
      .finally(() => setWagesLoading(false));
  }, [isManager]);

  if (!isManager) return null;

  const loading = groupLoading || wagesLoading || overridesLoading;

  if (wagesError) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-red-600">Could not load LER: {wagesError}</p>
        <p className="text-xs text-gray-400 mt-1">Check Xero is connected and staff are mapped above.</p>
      </div>
    );
  }

  const ptByCoach    = ptData?.coachPerformance?.byCoach || [];
  const groupByCoach = groupData?.byCoach || [];

  const rows = !loading
    ? staffList
        .filter((s) => s.active !== false)
        .map((s) => {
          const firstName  = s.full_name;
          const ptMatch    = ptByCoach.find((c) => c.staffName.includes(firstName));
          const groupMatch = groupByCoach.find((c) => c.staffName.includes(firstName));
          const wageRow    = wages?.byStaff?.find((w) => w.staffId === s.id);
          const override   = overrides[s.id];

          const ptRevenue    = ptMatch?.[period]?.value || 0;
          const groupRevenue = groupMatch?.[period]?.value || 0;
          const revenue      = ptRevenue + groupRevenue;
          const wage          = override ? Number(override.effectiveWage) : (wageRow?.[period] ?? null);
          const ler           = wage > 0 ? revenue / wage : null;

          return { staffId: s.id, name: firstName, revenue, wage, ler, isOverride: !!override, mapped: !!wageRow || !!override };
        })
        .filter((r) => r.mapped || r.revenue > 0)
    : [];

  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);
  const totalWage     = rows.reduce((sum, r) => sum + (r.wage || 0), 0);
  const totalLer       = totalWage > 0 ? totalRevenue / totalWage : null;

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
          <p className="text-xs text-gray-500 mt-0.5">PT + Group revenue ÷ Xero wages, per coach</p>
        </div>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                period === p.key ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {p.label}
            </button>
          ))}
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
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-800">{fmtAUD(totalRevenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmtAUD(totalWage)}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-900">{totalLer !== null ? `${totalLer.toFixed(1)}x` : '–'}</td>
                </>
              )}
            </tr>

            {!loading && rows.map((r) => (
              <tr key={r.staffId}>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {r.name}
                  {r.isOverride && <span className="ml-1.5 text-[10px] text-amber-600" title={overrides[r.staffId]?.note || 'Manual wage override'}>·override</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmtAUD(r.revenue)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-500">{r.wage != null ? fmtAUD(r.wage) : '–'}</td>
                <td className={`px-4 py-3 text-right font-semibold tabular-nums ${r.ler === null ? 'text-gray-300' : r.ler >= 3 ? 'text-emerald-600' : r.ler >= 2 ? 'text-amber-600' : 'text-red-600'}`}>
                  {r.ler !== null ? `${r.ler.toFixed(1)}x` : '–'}
                </td>
              </tr>
            ))}

            {!loading && rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">No coaches mapped to Xero yet — see Xero Payroll Mapping above</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="px-5 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
        Revenue is PT/SP + Group class $ value from earlier in this tab. Wages come from Xero Payroll (or a manual override where set).
        LER = revenue ÷ wages — 3x+ is generally healthy, under 2x is worth a look. Only this/last month for now; rolling 3/6/12-month
        averages need a few months of history to accumulate first.
      </p>
    </div>
  );
}
