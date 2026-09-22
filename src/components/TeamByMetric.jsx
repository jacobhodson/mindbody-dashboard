import { useState } from 'react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer } from 'recharts';
import { TEAM_METRICS, valueForMetric, mean, lerTone, LER_KEY_TEXT } from '../utils/teamMetrics.js';
import { ROLLING_KEY, monthKeyFor, snapshotRowFor, periodRange } from '../utils/snapshotPeriods.js';

const RECENT_COLOR = '#059669'; // emerald-600, matches the app's accent
const YEAR_COLOR   = '#94a3b8'; // slate-400

const RECENT_MONTHS = 3;

// "Dive into the filter of the task" — pick one metric (LER, PT revenue,
// task completion, ...) and see every active coach at once: the year average,
// the average of the last 3 months, the rolling 30 days, and every month of
// the year side by side — no tabbing through months.
//
// Averages are over COMPLETED months only. The current month is shown in the
// table (marked in progress) but left out of the averages: a part-month of
// revenue against wages that haven't all posted yet would skew a ratio. The
// average is the plain mean of the monthly figures a coach has — a month with
// no data isn't counted as zero. "Last 3 months" is the 3 completed months
// before the current one, within the loaded year.
//
// Everything except task completion comes from the snapshot tables; task
// completion is computed from task_completions for each month's date range.
export default function TeamByMetric({ staffList, monthlyRows, rollingLatest, statsFor, year, loading }) {
  const [metricKey, setMetricKey] = useState('ler');
  const metric = TEAM_METRICS.find((m) => m.key === metricKey);

  const now = new Date();
  const lastMonthIdx = now.getFullYear() === year ? now.getMonth() : 11;
  const inProgressIdx = now.getFullYear() === year ? now.getMonth() : -1;

  // Newest first, matching the month picker's order elsewhere on the tab.
  const months = [];
  for (let m = lastMonthIdx; m >= 0; m--) {
    const date = new Date(year, m, 1);
    months.push({ idx: m, key: monthKeyFor(date), short: format(date, 'MMM'), inProgress: m === inProgressIdx });
  }
  const completed = months.filter((m) => !m.inProgress);            // newest first
  const recent    = completed.slice(0, RECENT_MONTHS);
  const spanLabel = (list) => (list.length === 0 ? '' : list.length === 1 ? list[0].short : `${list[list.length - 1].short}–${list[0].short}`);

  const valueFor = (staffId, key) => {
    if (metricKey === 'taskRate') {
      const { start, end } = periodRange(key);
      const stats = statsFor(staffId, start, end);
      return stats.rate != null ? Math.round(stats.rate * 1000) / 10 : null;
    }
    const v = valueForMetric(metricKey, snapshotRowFor(key, staffId, monthlyRows, rollingLatest));
    return v != null ? Number(v) : null;
  };

  const rows = staffList
    // is_coach excludes non-revenue-generating staff (e.g. a generic admin
    // login) from every performance view on this tab.
    .filter((s) => s.active !== false && s.is_coach !== false)
    .map((s) => {
      const byMonth = {};
      for (const m of months) byMonth[m.key] = valueFor(s.id, m.key);
      return {
        staffId: s.id,
        name: s.full_name,
        byMonth,
        rolling: valueFor(s.id, ROLLING_KEY),
        yearAvg: mean(completed.map((m) => byMonth[m.key])),
        recentAvg: mean(recent.map((m) => byMonth[m.key])),
      };
    });

  const hasData = rows.some((r) => r.yearAvg != null || r.recentAvg != null || r.rolling != null || months.some((m) => r.byMonth[m.key] != null));
  const chartData = rows.map((r) => ({ name: r.name, recent: r.recentAvg, year: r.yearAvg }));
  const recentLabel = `Last ${recent.length === 1 ? 'month' : `${recent.length} months`} avg`;

  // LER figures are colour-coded (green / orange / red); other metrics keep their normal text colour.
  const toneFor = (v, fallback) => (metricKey === 'ler' && v != null ? lerTone(v) : fallback);

  const labelProps = { position: 'top', fontSize: 10, fill: '#6b7280', formatter: (v) => (v == null ? '' : metric.format(v)) };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="font-semibold text-gray-900">
            {metric.label} across coaches <span className="font-normal text-gray-400">· averages, {year}</span>
          </h2>
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
          <p className="py-16 text-center text-sm text-gray-400">No {metric.label.toLowerCase()} data yet for {year}.</p>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 22, right: 8, left: 8, bottom: 8 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={metricKey === 'taskRate' ? [0, 100] : [0, 'auto']} />
                <Tooltip formatter={(v, name) => [metric.format(v), name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="recent" name={`${recentLabel}${recent.length ? ` (${spanLabel(recent)})` : ''}`} fill={RECENT_COLOR} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="recent" {...labelProps} />
                </Bar>
                <Bar dataKey="year" name={`Year avg${completed.length ? ` (${spanLabel(completed)})` : ''}`} fill={YEAR_COLOR} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="year" {...labelProps} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-right text-xs text-gray-500">
              <th className="px-5 py-2 font-medium text-left sticky left-0 bg-white">Coach</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap bg-emerald-500/5">
                Year avg<span className="block text-[10px] font-normal text-gray-400">{spanLabel(completed) || '–'}</span>
              </th>
              <th className="px-3 py-2 font-medium whitespace-nowrap bg-emerald-500/5">
                {recentLabel}<span className="block text-[10px] font-normal text-gray-400">{spanLabel(recent) || '–'}</span>
              </th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">
                Rolling 30<span className="block text-[10px] font-normal text-gray-400">latest</span>
              </th>
              {months.map((m) => (
                <th key={m.key} className="px-3 py-2 font-medium whitespace-nowrap">
                  {m.short}
                  {m.inProgress && <span className="block text-[10px] font-normal text-amber-600">in progress</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200/60">
            {loading ? (
              <tr><td colSpan={4 + months.length} className="px-5 py-6"><div className="h-4 w-full animate-pulse rounded bg-gray-200" /></td></tr>
            ) : rows.map((r) => (
              <tr key={r.staffId} className="text-right">
                <td className="px-5 py-2.5 font-medium text-gray-900 text-left whitespace-nowrap sticky left-0 bg-white">{r.name}</td>
                <td className={`px-3 py-2.5 font-semibold tabular-nums bg-emerald-500/5 ${toneFor(r.yearAvg, 'text-gray-900')}`}>{metric.format(r.yearAvg)}</td>
                <td className={`px-3 py-2.5 font-semibold tabular-nums bg-emerald-500/5 ${toneFor(r.recentAvg, 'text-gray-900')}`}>{metric.format(r.recentAvg)}</td>
                <td className={`px-3 py-2.5 tabular-nums ${toneFor(r.rolling, 'text-gray-600')}`}>{metric.format(r.rolling)}</td>
                {months.map((m) => (
                  <td key={m.key} className={`px-3 py-2.5 tabular-nums ${toneFor(r.byMonth[m.key], m.inProgress ? 'text-gray-400' : 'text-gray-600')} ${m.inProgress && metricKey === 'ler' ? 'opacity-60' : ''}`}>
                    {metric.format(r.byMonth[m.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-5 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
          Averages cover completed months only — the current month is shown but not counted, since it's part-way through and wages
          are still posting. Months with no data are skipped, not counted as zero.{metricKey === 'ler' && ` ${LER_KEY_TEXT}`}
        </p>
      </div>
    </div>
  );
}
