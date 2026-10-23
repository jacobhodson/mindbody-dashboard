import { useMemo, useState } from 'react';
import { startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths, subDays, format } from 'date-fns';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { CHANNELS } from '../../utils/leadSource.js';

const ORDER = ['meta', 'organic', 'referral'];
const wk = { weekStartsOn: 1 };

const PERIODS = [
  { key: 'thisWeek',  label: 'This Week',  range: (n) => [startOfWeek(n, wk), n] },
  { key: 'lastWeek',  label: 'Last Week',  range: (n) => [startOfWeek(subWeeks(n, 1), wk), endOfWeek(subWeeks(n, 1), wk)] },
  { key: 'thisMonth', label: 'This Month', range: (n) => [startOfMonth(n), n] },
  { key: 'lastMonth', label: 'Last Month', range: (n) => [startOfMonth(subMonths(n, 1)), endOfMonth(subMonths(n, 1))] },
  { key: '90d',       label: 'Last 90 Days', range: (n) => [subDays(n, 89), n] },
];

const btn = (active) => `px-3 py-1.5 font-medium transition-colors ${
  active ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
}`;

function countBy(leads) {
  const c = { total: leads.length, meta: 0, organic: 0, referral: 0 };
  for (const l of leads) c[l.channel]++;
  return c;
}

function Tile({ label, value, total, channel }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="flex items-center gap-2 text-sm text-gray-600 mb-2">
        {channel && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CHANNELS[channel].bar }} />}
        {label}
      </p>
      <p className="text-3xl font-bold tabular-nums text-gray-900">{value}</p>
      {channel && <p className="text-xs text-gray-500 mt-1">{pct}% of leads</p>}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-gray-900 mb-1">Week of {label} · {total} leads</p>
      {[...payload].reverse().map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-gray-700">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {CHANNELS[p.dataKey].label}: <span className="tabular-nums font-medium">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Lead counts = opportunities created in the Leads pipeline in the period
 * (any status — a lead that's since been won or lost still came in then).
 */
export default function LeadCounts({ leads, loading }) {
  const [period, setPeriod] = useState('thisWeek');

  const counts = useMemo(() => {
    const [from, to] = PERIODS.find((p) => p.key === period).range(new Date());
    return countBy(leads.filter((l) => {
      const d = l.created_at && new Date(l.created_at);
      return d && d >= from && d <= to;
    }));
  }, [leads, period]);

  const weekly = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const start = startOfWeek(subWeeks(now, 11 - i), wk);
      const end = endOfWeek(start, wk);
      const c = countBy(leads.filter((l) => { const d = l.created_at && new Date(l.created_at); return d && d >= start && d <= end; }));
      return { week: format(start, 'd MMM'), meta: c.meta, organic: c.organic, referral: c.referral };
    });
  }, [leads]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Leads</h2>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
          {PERIODS.map((p) => <button key={p.key} onClick={() => setPeriod(p.key)} className={btn(period === p.key)}>{p.label}</button>)}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-200" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Total leads" value={counts.total} />
          {ORDER.map((ch) => <Tile key={ch} label={CHANNELS[ch].label} value={counts[ch]} total={counts.total} channel={ch} />)}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-medium text-gray-700 mb-3">New leads per week, last 12 weeks</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#d1d5db' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Legend formatter={(k) => <span className="text-xs text-gray-700">{CHANNELS[k].label}</span>} iconType="circle" iconSize={8} />
              {ORDER.map((ch, i) => (
                <Bar key={ch} dataKey={ch} stackId="a" fill={CHANNELS[ch].bar} stroke="#fff" strokeWidth={2}
                  radius={i === ORDER.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
