import { useState } from 'react';
import { format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CheckCircle, XCircle } from 'lucide-react';
import { ROLLING_KEY, monthKeyFor, periodRange, periodLabel } from '../utils/snapshotPeriods.js';

function fmtAUD(n) { return n == null ? '–' : `$${Math.round(n).toLocaleString('en-AU')}`; }
function fmtLer(n)  { return n == null ? '–' : `${Number(n).toFixed(2)}x`; }

const sourceMark = (src) => (src === 'override' ? ' ·override' : src === 'mixed' ? ' ·part override' : '');

// "Dive into the coach themselves" — pick one coach and see their full-year
// LER trend (month by month, straight from ler_monthly), the exact figures
// underneath (with the rolling 30 days as the top row), and how they're
// tracking on their own tasks for whichever period is selected up top.
export default function TeamByCoach({ staffList, monthlyRows, rollingLatest, rollingHistory, latestAsOf, statsFor, period, year, loading }) {
  // is_coach excludes non-revenue-generating staff (e.g. a generic admin
  // login) from the coach picker and everything below it.
  const activeStaff = staffList.filter((s) => s.active !== false && s.is_coach !== false);
  const [staffId, setStaffId] = useState(null);
  const selected = activeStaff.find((s) => s.id === staffId) || activeStaff[0] || null;

  const toRow = (label, key, r) => ({
    key, label,
    ler:          r?.ler != null ? Number(r.ler) : null,
    ptRevenue:    r ? Number(r.pt_revenue) : null,
    ptSessions:   r ? r.pt_sessions : null,
    groupRevenue: r ? Number(r.group_revenue) : null,
    groupClasses: r ? r.group_classes : null,
    wages:        r?.wages != null ? Number(r.wages) : null,
    source:       r?.wages_source || null,
  });

  const monthlyTable = Array.from({ length: 12 }, (_, m) => {
    const monthDate = new Date(year, m, 1);
    const r = selected ? monthlyRows.find((x) => x.staff_id === selected.id && x.month === format(monthDate, 'yyyy-MM-dd')) : null;
    return toRow(format(monthDate, 'MMM'), monthKeyFor(monthDate), r);
  });
  const rollingRow = toRow(latestAsOf ? `Rolling 30 (to ${format(new Date(`${latestAsOf}T00:00:00`), 'd MMM')})` : 'Rolling 30 days', ROLLING_KEY, selected ? rollingLatest[selected.id] : null);

  const hasAnyData = monthlyTable.some((r) => r.ler != null || r.ptRevenue || r.groupRevenue);
  const rollingTrend = selected
    ? rollingHistory.filter((r) => r.staff_id === selected.id).map((r) => ({ label: format(new Date(`${r.as_of}T00:00:00`), 'd MMM'), ler: r.ler != null ? Number(r.ler) : null }))
    : [];

  const { start, end } = periodRange(period);
  const taskStats = selected ? statsFor(selected.id, start, end) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="font-semibold text-gray-900">{selected?.full_name || 'Coach'} — {year}</h2>
          <select
            value={selected?.id || ''}
            onChange={(e) => setStaffId(e.target.value)}
            className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
        ) : !hasAnyData ? (
          <p className="py-16 text-center text-sm text-gray-400">
            No monthly snapshots yet for {selected?.full_name || 'this coach'}.
          </p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTable} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => fmtLer(v)} />
                <Line type="monotone" dataKey="ler" name="LER" stroke="#059669" strokeWidth={2} dot connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {period === ROLLING_KEY && rollingTrend.length >= 2 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Rolling 30-day LER, day by day</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rollingTrend} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => fmtLer(v)} />
                <Line type="monotone" dataKey="ler" name="LER" stroke="#059669" strokeWidth={2} dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Exact figures — the actual database history behind the chart */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="px-5 py-2 font-medium">Period</th>
              <th className="px-3 py-2 font-medium">PT Revenue</th>
              <th className="px-3 py-2 font-medium">PT Sessions</th>
              <th className="px-3 py-2 font-medium">Group Revenue</th>
              <th className="px-3 py-2 font-medium">Group Classes</th>
              <th className="px-3 py-2 font-medium">Wages</th>
              <th className="px-3 py-2 font-medium">LER</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200/60">
            {[rollingRow, ...monthlyTable].map((r) => (
              <tr key={r.key} className={r.key === period ? 'bg-emerald-500/5' : ''}>
                <td className="px-5 py-2 font-medium text-gray-900 whitespace-nowrap">{r.label}</td>
                <td className="px-3 py-2 text-gray-600 tabular-nums">{fmtAUD(r.ptRevenue)}</td>
                <td className="px-3 py-2 text-gray-600 tabular-nums">{r.ptSessions ?? '–'}</td>
                <td className="px-3 py-2 text-gray-600 tabular-nums">{fmtAUD(r.groupRevenue)}</td>
                <td className="px-3 py-2 text-gray-600 tabular-nums">{r.groupClasses ?? '–'}</td>
                <td className="px-3 py-2 text-gray-600 tabular-nums whitespace-nowrap">
                  {fmtAUD(r.wages)}<span className="text-[10px] text-amber-600">{sourceMark(r.source)}</span>
                </td>
                <td className="px-3 py-2 text-gray-900 font-semibold tabular-nums">{fmtLer(r.ler)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Task completion for whichever period is selected up top */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Tasks — {periodLabel(period)}</h3>
        {taskStats && taskStats.expected > 0 ? (
          <>
            <p className="text-xs text-gray-500 mb-3">
              {taskStats.completed} of {taskStats.expected} completed ({Math.round(taskStats.rate * 100)}%)
            </p>
            {taskStats.missed.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Missed</p>
                {taskStats.missed.slice(0, 20).map((m, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                    {m.label}
                    <span className="text-gray-300">· {format(new Date(`${m.periodStart}T00:00:00`), 'd MMM')}</span>
                  </div>
                ))}
                {taskStats.missed.length > 20 && (
                  <p className="text-[11px] text-gray-400">+{taskStats.missed.length - 20} more</p>
                )}
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-emerald-600">
                <CheckCircle className="h-3.5 w-3.5" /> Everything ticked off in this period
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400">No individual tasks assigned in this period.</p>
        )}
      </div>
    </div>
  );
}
