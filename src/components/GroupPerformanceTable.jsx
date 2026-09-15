import { useState } from 'react';
import { Lock } from 'lucide-react';
import { useGroupPerformance } from '../utils/useGroupPerformance.js';

function fmtAUD(n) {
  if (n === undefined || n === null) return '–';
  return `$${Math.round(n).toLocaleString('en-AU')}`;
}

const PERIODS = [
  { key: 'thisWeek',  label: 'This Week' },
  { key: 'lastWeek',  label: 'Last Week' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
];

/**
 * Group-class revenue + per-coach LER — manager-only. $ value first,
 * session count second (2026-09-19 rebuild, same swap as
 * CoachPerformanceTable.jsx), one period at a time via the tab bar
 * instead of 5 columns, each showing its own real date range
 * (dateRanges from mb-group-performance.js).
 *
 * The tab bar replaced a trailing-7-day "week" that silently excluded
 * today and didn't align to the calendar — confirmed live as the cause of
 * coach counts looking wrong; mb-group-performance.js now uses real
 * Mon-Sun calendar weeks instead, matching mb-revenue.js/mb-pt-analytics.js.
 */
export default function GroupPerformanceTable({ isManager }) {
  const { data, loading, error } = useGroupPerformance(isManager);
  const [period, setPeriod] = useState('thisWeek');

  if (!isManager) return null;

  if (error && !data) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-red-600">Could not load group performance: {error}</p>
      </div>
    );
  }

  const dateRange = data?.dateRanges?.[period];
  const byCoach = data?.byCoach || [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-gray-200 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-900">Group Class Performance</h2>
            <span className="flex items-center gap-1 rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 shrink-0">
              <Lock className="h-2.5 w-2.5" /> Manager
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Group membership revenue &amp; per-coach LER{dateRange ? ` · ${dateRange}` : ''}
          </p>
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

      {/* Revenue for the selected period */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-baseline gap-3 flex-wrap">
        <span className="text-2xl font-bold tabular-nums text-gray-900">
          {loading ? '–' : fmtAUD(data?.revenue?.[period])}
        </span>
        <span className="text-xs text-gray-500">group membership revenue{dateRange ? ` (${dateRange})` : ''}</span>
      </div>

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
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-900">{fmtAUD(data?.overall?.[period]?.value)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{data?.overall?.[period]?.count ?? '–'}</td>
                </>
              )}
            </tr>

            {!loading && byCoach.map((coach) => (
              <tr key={coach.staffId}>
                <td className="px-4 py-3 text-sm text-gray-700">{coach.staffName}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-800">{fmtAUD(coach[period]?.value)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-500">{coach[period]?.count ?? '–'}</td>
              </tr>
            ))}

            {!loading && byCoach.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-400">No group classes in this window</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!loading && data?.overall?.weeklyAvg && (
        <div className="px-5 py-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
          <span className="text-gray-500">Weekly average (based on last month)</span>
          <span className="font-semibold text-gray-700 tabular-nums">{fmtAUD(data.overall.weeklyAvg.value)} · {data.overall.weeklyAvg.count} sessions · revenue {fmtAUD(data?.revenue?.weeklyAvg)}</span>
        </div>
      )}

      {!loading && data && (
        <p className="px-5 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
          Average value per class: {fmtAUD(data.avgClassValue)} (last month's group-membership revenue ÷ {data.lastMonthClassCount} countable classes).
          Excludes free Saturday Open Gym and Sunday Run Club sessions ({data.excludedThisMonth} this month) — no revenue, no coaching required.
          Counts "Newstrength Unlimited", "Newstrength 2x week", and single-session drop-ins as group revenue.
        </p>
      )}
    </div>
  );
}
