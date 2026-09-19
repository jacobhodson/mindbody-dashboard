import { useState } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TEAM_METRICS, valueForMetric } from '../utils/teamMetrics.js';

const BAR_COLOR = '#059669'; // emerald-600, matches the app's accent

// "Dive into the filter of the task" — pick one metric (LER, PT revenue,
// task completion, ...) and compare every active coach for the selected
// month, side by side. Reads ler_monthly for everything except task
// completion, which comes from useTeamTaskStats.js instead (not a
// snapshotted table — task_completions is already historical on its own).
export default function TeamByMetric({ staffList, snapshotRows, statsFor, year, monthIndex, loading }) {
  const [metricKey, setMetricKey] = useState('ler');
  const metric = TEAM_METRICS.find((m) => m.key === metricKey);

  const monthDate  = new Date(year, monthIndex, 1);
  const monthStr   = format(monthDate, 'yyyy-MM-dd');
  const monthStart = startOfMonth(monthDate);
  const monthEnd   = endOfMonth(monthDate);

  const rows = staffList
    .filter((s) => s.active !== false)
    .map((s) => {
      let value;
      if (metricKey === 'taskRate') {
        const stats = statsFor(s.id, monthStart, monthEnd);
        value = stats.rate != null ? Math.round(stats.rate * 1000) / 10 : null;
      } else {
        const snapshot = snapshotRows.find((r) => r.staff_id === s.id && r.month === monthStr);
        value = valueForMetric(metricKey, snapshot);
      }
      return { staffId: s.id, name: s.full_name, value };
    });

  const hasData = rows.some((r) => r.value != null);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="font-semibold text-gray-900">{metric.label} across coaches</h2>
          <select
            value={metricKey}
            onChange={(e) => setMetricKey(e.target.value)}
            className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {TEAM_METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
        ) : !hasData ? (
          <p className="py-16 text-center text-sm text-gray-400">
            No {metric.label.toLowerCase()} data for {format(monthDate, 'MMMM yyyy')} yet.
          </p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => metric.format(v)} />
                <Bar dataKey="value" fill={BAR_COLOR} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="px-5 py-2 font-medium">Coach</th>
              <th className="px-3 py-2 font-medium">{metric.label}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200/60">
            {rows.map((r) => (
              <tr key={r.staffId}>
                <td className="px-5 py-2.5 font-medium text-gray-900">{r.name}</td>
                <td className="px-3 py-2.5 text-gray-600 tabular-nums">{metric.format(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
