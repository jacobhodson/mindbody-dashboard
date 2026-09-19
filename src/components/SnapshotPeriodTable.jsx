import { useAllStaff } from '../utils/useAllStaff.js';
import { useCoachMonthlySnapshots } from '../utils/useCoachMonthlySnapshots.js';
import { useCoachRolling30 } from '../utils/useCoachRolling30.js';
import { ROLLING_KEY, snapshotRowFor, periodLabel } from '../utils/snapshotPeriods.js';

function fmtAUD(n) {
  if (n === undefined || n === null) return '–';
  return `$${Math.round(n).toLocaleString('en-AU')}`;
}

const FIELDS = {
  group: { value: 'group_revenue', count: 'group_classes', empty: 'No group class data for this period yet' },
  pt:    { value: 'pt_revenue',    count: 'pt_sessions',   empty: 'No PT/SP data for this period yet' },
};

/**
 * The table body the Group and PT performance tables switch to when a
 * snapshot period (Rolling 30 Days, or a specific month) is selected —
 * reads the nightly snapshot rows (ler_monthly / coach_rolling30) instead of
 * the live endpoint, so every month of the year is selectable and the
 * rolling-30 figure matches the LER table and Team tab exactly. Manager-only
 * (RLS on both tables) — callers only offer these periods to managers.
 */
export default function SnapshotPeriodTable({ metric, period }) {
  const f = FIELDS[metric];
  const year = period === ROLLING_KEY ? new Date().getFullYear() : Number(period.slice(2, 6));
  const { staffList, loading: staffLoading } = useAllStaff();
  const { rows: monthlyRows, loading: monthlyLoading } = useCoachMonthlySnapshots(true, year);
  const { latest, latestAsOf, loading: rollingLoading } = useCoachRolling30(true);

  const loading = staffLoading || monthlyLoading || rollingLoading;

  const rows = staffList
    .filter((s) => s.active !== false && s.is_coach !== false)
    .map((s) => {
      const r = snapshotRowFor(period, s.id, monthlyRows, latest);
      return { staffId: s.id, name: s.full_name, has: !!r, value: r ? Number(r[f.value]) : null, count: r ? r[f.count] : null };
    })
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));

  const hasData = rows.some((r) => r.has);
  const totalValue = rows.reduce((sum, r) => sum + (r.value || 0), 0);
  const totalCount = rows.reduce((sum, r) => sum + (r.count || 0), 0);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Coach</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">$ Value</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Sessions</th>
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
                <>
                  <td className="px-4 py-3 text-right"><div className="h-4 w-14 ml-auto animate-pulse rounded bg-gray-200" /></td>
                  <td className="px-4 py-3 text-right"><div className="h-4 w-8 ml-auto animate-pulse rounded bg-gray-200" /></td>
                </>
              ) : (
                <>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-900">{hasData ? fmtAUD(totalValue) : '–'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{hasData ? totalCount : '–'}</td>
                </>
              )}
            </tr>
            {!loading && rows.map((r) => (
              <tr key={r.staffId}>
                <td className="px-4 py-3 text-sm text-gray-700">{r.name}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-800">{r.has ? fmtAUD(r.value) : '–'}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-500">{r.has ? r.count : '–'}</td>
              </tr>
            ))}
            {!loading && !hasData && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-400">{f.empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
        {periodLabel(period)} — from the nightly snapshot
        {period === ROLLING_KEY && latestAsOf ? ` (30 days to ${latestAsOf})` : ''}, so it matches the LER table and Team tab.
        {metric === 'group'
          ? ' $ value = countable classes × the previous month\'s average value per class.'
          : ' $ value = signed-off sessions × the trailing 60-day average sale price.'}
      </p>
    </>
  );
}
