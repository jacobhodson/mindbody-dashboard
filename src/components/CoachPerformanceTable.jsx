function fmtAUD(n) {
  if (n === undefined || n === null) return '–';
  return `$${Math.round(n).toLocaleString('en-AU')}`;
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
      <p className="text-[10px] text-gray-500 tabular-nums">{bucket.hours}h · {fmtAUD(bucket.value)}</p>
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
 * Signed-off (Status === 'Completed') PT/Semi-Private sessions, hours, and
 * $ value — overall and per coach. "Weekly Avg" is last month's total
 * divided by the weeks in it (a full month, unlike the still-in-progress
 * "this month"), matching mb-pt-analytics.js's coachPerformance shape.
 *
 * $ value uses a real trailing-60-day average sale price per session type
 * (rates), not an exact per-appointment trace — see mb-pt-analytics.js's
 * avgSessionRates() for why an exact trace isn't feasible against this
 * account's Mindbody data.
 */
export default function CoachPerformanceTable({ data, loading, error }) {
  const perf = data?.coachPerformance;

  if (error && !data) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-red-600">Could not load coach performance: {error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">Coach Performance</h2>
        <p className="text-xs text-gray-500 mt-0.5">Signed-off PT &amp; Semi-Private sessions — count · hours · $ value</p>
      </div>
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
                <CellStack key={p.key} bucket={perf?.overall?.[p.key]} loading={loading} />
              ))}
            </tr>

            {!loading && (perf?.byCoach || []).map((coach) => (
              <tr key={coach.staffId}>
                <td className="px-4 py-3 text-sm text-gray-700">{coach.staffName}</td>
                {PERIODS.map((p) => (
                  <CellStack key={p.key} bucket={coach[p.key]} loading={false} />
                ))}
              </tr>
            ))}

            {!loading && (perf?.byCoach || []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400">No signed-off sessions in this window</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {perf?.rates && (
        <p className="px-5 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
          $ value based on a {perf.rates.windowDays}-day average sale price — PT {fmtAUD(perf.rates.pt)}/session ({perf.rates.sampleSize?.pt ?? 0} sales), SP {fmtAUD(perf.rates.sp)}/session ({perf.rates.sampleSize?.sp ?? 0} sales).
        </p>
      )}
    </div>
  );
}
