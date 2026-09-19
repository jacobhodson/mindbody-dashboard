import { useState } from 'react';
import { isSnapshotPeriod, periodLabel } from '../utils/snapshotPeriods.js';
import PeriodTabs from './PeriodTabs.jsx';
import SnapshotPeriodTable from './SnapshotPeriodTable.jsx';

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
 * Signed-off (Status === 'Completed') PT/Semi-Private sessions — $ value
 * first, session count second (2026-09-19 rebuild: dropped hours from the
 * display entirely per feedback, and swapped the emphasis from count to
 * $ value). One period at a time via the tab bar rather than 5 columns —
 * each tab shows its own real date range (dateRanges from
 * mb-pt-analytics.js) so "this week" is never ambiguous.
 *
 * The tab bar replaced a trailing-7-day "week" that silently excluded
 * today and didn't align to the calendar — confirmed live as the cause of
 * coach counts looking wrong; mb-pt-analytics.js now uses real Mon-Sun
 * calendar weeks instead, matching mb-revenue.js.
 *
 * $ value uses a real trailing-60-day average sale price per session type
 * (rates), not an exact per-appointment trace — see mb-pt-analytics.js's
 * avgSessionRates() for why an exact trace isn't feasible against this
 * account's Mindbody data.
 */
export default function CoachPerformanceTable({ data, loading, error, isManager }) {
  const [period, setPeriod] = useState('thisWeek');
  const perf = data?.coachPerformance;
  // Rolling 30 Days / month picker are snapshot-backed and manager-only
  // (the snapshot tables are manager-only via RLS); everyone still gets the
  // live This Week / Last Week / This Month / Last Month tabs.
  const isSnapshot = !!isManager && isSnapshotPeriod(period);
  const dateRange = isSnapshot ? periodLabel(period) : perf?.dateRanges?.[period];

  if (error && !data) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-red-600">Could not load coach performance: {error}</p>
      </div>
    );
  }

  const byCoach = perf?.byCoach || [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-gray-200 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-900">Coach Performance</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Signed-off PT &amp; Semi-Private sessions{dateRange ? ` · ${dateRange}` : ''}
          </p>
        </div>
        <PeriodTabs
          livePeriods={PERIODS}
          value={period}
          onChange={setPeriod}
          showSnapshots={!!isManager}
          year={new Date().getFullYear()}
        />
      </div>

      {isSnapshot ? (
        <SnapshotPeriodTable metric="pt" period={period} />
      ) : (
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
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-900">{fmtAUD(perf?.overall?.[period]?.value)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{perf?.overall?.[period]?.count ?? '–'}</td>
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
              <tr><td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-400">No signed-off sessions in this window</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!loading && perf?.overall?.weeklyAvg && (
        <div className="px-5 py-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
          <span className="text-gray-500">Weekly average (based on last month)</span>
          <span className="font-semibold text-gray-700 tabular-nums">{fmtAUD(perf.overall.weeklyAvg.value)} · {perf.overall.weeklyAvg.count} sessions</span>
        </div>
      )}

      {perf?.rates && (
        <p className="px-5 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
          $ value based on a {perf.rates.windowDays}-day average sale price — PT {fmtAUD(perf.rates.pt)}/session ({perf.rates.sampleSize?.pt ?? 0} sales), SP {fmtAUD(perf.rates.sp)}/session ({perf.rates.sampleSize?.sp ?? 0} sales).
        </p>
      )}
      </>
      )}
    </div>
  );
}
