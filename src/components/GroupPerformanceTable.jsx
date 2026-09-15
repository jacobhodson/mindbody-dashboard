import { Lock } from 'lucide-react';
import { useGroupPerformance } from '../utils/useGroupPerformance.js';

function fmtAUD(n) {
  if (n === undefined || n === null) return '–';
  return `$${Math.round(n).toLocaleString('en-AU')}`;
}

function RevenueStat({ label, value, loading }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      {loading ? (
        <div className="h-6 w-16 mt-1 animate-pulse rounded bg-gray-200" />
      ) : (
        <p className="text-lg font-bold tabular-nums text-gray-900">{fmtAUD(value)}</p>
      )}
    </div>
  );
}

function CellStack({ bucket, loading }) {
  if (loading || !bucket) {
    return (
      <td className="px-4 py-3 text-center">
        <div className="h-4 w-8 mx-auto animate-pulse rounded bg-gray-200 mb-1" />
        <div className="h-3 w-14 mx-auto animate-pulse rounded bg-gray-100" />
      </td>
    );
  }
  return (
    <td className="px-4 py-3 text-center">
      <p className="text-sm font-semibold text-gray-800 tabular-nums">{bucket.count}</p>
      <p className="text-[10px] text-gray-500 tabular-nums">{fmtAUD(bucket.value)}</p>
    </td>
  );
}

const PERIODS = [
  { key: 'thisWeek',  label: 'This Week' },
  { key: 'lastWeek',  label: 'Last Week' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'weeklyAvg', label: 'Weekly Avg' },
];

/**
 * Group-class revenue + per-coach LER — manager-only (Dashboard.jsx gates
 * rendering this at all on isManager, same convention as every other
 * manager-only control in the app). Mirrors CoachPerformanceTable.jsx's
 * shape for PT/SP, but the $ basis is a single average value per class
 * (this month's countable classes ÷ last month's group-membership revenue)
 * rather than a per-session-type rate — see mb-group-performance.js for
 * why group memberships (weekly/fortnightly/monthly billing) don't have a
 * clean per-class price the way a PT credit does.
 */
export default function GroupPerformanceTable({ isManager }) {
  const { data, loading, error } = useGroupPerformance(isManager);

  if (!isManager) return null;

  if (error && !data) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-red-600">Could not load group performance: {error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-gray-200 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-gray-900">Group Class Performance</h2>
          <p className="text-xs text-gray-500 mt-0.5">Group membership revenue and per-coach LER — managers only</p>
        </div>
        <span className="flex items-center gap-1 rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 shrink-0">
          <Lock className="h-2.5 w-2.5" /> Manager
        </span>
      </div>

      {/* Revenue summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 p-5 border-b border-gray-100">
        <RevenueStat label="This Week"    value={data?.revenue?.thisWeek}  loading={loading} />
        <RevenueStat label="Last Week"    value={data?.revenue?.lastWeek}  loading={loading} />
        <RevenueStat label="This Month"   value={data?.revenue?.thisMonth} loading={loading} />
        <RevenueStat label="Last Month"   value={data?.revenue?.lastMonth} loading={loading} />
        <RevenueStat label="Weekly Avg"   value={data?.revenue?.weeklyAvg} loading={loading} />
      </div>

      {/* Per-coach table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Coach</th>
              {PERIODS.map((p) => (
                <th key={p.key} className="px-4 py-2.5 text-center text-xs font-medium text-gray-500">{p.label}</th>
              ))}
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
              {PERIODS.map((p) => (
                <CellStack key={p.key} bucket={data?.overall?.[p.key]} loading={loading} />
              ))}
            </tr>

            {!loading && (data?.byCoach || []).map((coach) => (
              <tr key={coach.staffId}>
                <td className="px-4 py-3 text-sm text-gray-700">{coach.staffName}</td>
                {PERIODS.map((p) => (
                  <CellStack key={p.key} bucket={coach[p.key]} loading={false} />
                ))}
              </tr>
            ))}

            {!loading && (data?.byCoach || []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400">No group classes in this window</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!loading && data && (
        <p className="px-5 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
          Average value per class: {fmtAUD(data.avgClassValue)} (last month's group-membership revenue ÷ {data.lastMonthClassCount} countable classes).
          Excludes free Saturday Open Gym and Sunday Run Club sessions ({data.excludedThisMonth} this month) — no revenue, no coaching required.
          Counts "Newstrength Unlimited" and "Newstrength 2x week" as group memberships; ask if single-session drop-ins or Fat Loss Group should be included too.
        </p>
      )}
    </div>
  );
}
