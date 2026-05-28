import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

function CardShell({ children, loading, error }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-semibold text-white">Attendance Patterns</h2>
          <p className="text-xs text-gray-500 mt-0.5">Daily visits · last 14 days</p>
        </div>
        <TrendingUp className="h-4 w-4 text-gray-600" />
      </div>
      {loading && <div className="h-48 animate-pulse rounded-lg bg-gray-800" />}
      {error && !loading && <p className="text-sm text-red-400">Could not load: {error}</p>}
      {!loading && !error && children}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-semibold text-emerald-400">{payload[0].value} visits</p>
    </div>
  );
};

export default function AttendanceChart({ data, loading, error }) {
  const daily = data?.daily || [];
  const stats = data?.stats || {};
  const today = daily[daily.length - 1];

  return (
    <CardShell loading={loading} error={error}>
      {/* Mini stats row */}
      <div className="flex gap-6 mb-6">
        {[
          { label: 'This week', value: stats.total7 },
          { label: 'Daily avg', value: stats.avgDaily },
          { label: 'Peak day', value: stats.peakDay },
          { label: 'Peak visits', value: stats.peakVisits },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-lg font-bold text-white tabular-nums">{value ?? '–'}</p>
          </div>
        ))}
      </div>

      {/* Main area chart */}
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="visitGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#10B981" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1F2937" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#6B7280', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={1}
          />
          <YAxis
            tick={{ fill: '#6B7280', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#374151' }} />
          {today && (
            <ReferenceLine
              x={today.label}
              stroke="#374151"
              strokeDasharray="4 4"
              label={{ value: 'today', position: 'insideTopRight', fill: '#4B5563', fontSize: 10 }}
            />
          )}
          <Area
            type="monotone"
            dataKey="visits"
            stroke="#10B981"
            strokeWidth={2}
            fill="url(#visitGrad)"
            dot={false}
            activeDot={{ r: 4, fill: '#10B981', stroke: '#065F46' }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Day-of-week breakdown */}
      {data?.byDow?.length > 0 && (
        <div className="mt-6">
          <p className="text-xs text-gray-500 mb-3">By day of week (last 14 days total)</p>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={data.byDow} margin={{ top: 0, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="day" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1F2937' }} />
              <Bar dataKey="visits" fill="#059669" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </CardShell>
  );
}
