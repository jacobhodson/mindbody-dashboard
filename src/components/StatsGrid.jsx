import { Activity, UserX, AlertCircle, Wallet } from 'lucide-react';

function fmt(n, prefix = '') {
  if (n === undefined || n === null) return '–';
  if (prefix === '$') return `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n.toLocaleString();
}

function Card({ icon: Icon, label, value, sub, color, loading }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm text-gray-400">{label}</p>
        <span className={`rounded-lg p-2 ${color}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3">
        {loading ? (
          <div className="h-8 w-24 animate-pulse rounded-md bg-gray-800" />
        ) : (
          <p className="text-3xl font-bold tabular-nums text-white">{value}</p>
        )}
        {sub && !loading && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
      </div>
    </div>
  );
}

export default function StatsGrid({ attendance, clientAnalytics, payments, loading }) {
  const visitTotal   = attendance?.stats?.total7;
  const avgDaily     = attendance?.stats?.avgDaily;
  const inactiveCount = clientAnalytics?.summary?.inactiveCount;
  const failedCount  = payments?.summary?.failedCount;
  const failedAmt    = payments?.summary?.totalFailedAmount;
  const acctCount    = payments?.summary?.onAccountCount;
  const acctAmt      = payments?.summary?.totalOnAccountAmount;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card
        icon={Activity}
        label="Visits this week"
        value={fmt(visitTotal)}
        sub={avgDaily !== undefined ? `avg ${fmt(avgDaily)}/day` : undefined}
        color="bg-emerald-500/10 text-emerald-400"
        loading={loading.attendance}
      />
      <Card
        icon={UserX}
        label="Inactive clients"
        value={fmt(inactiveCount)}
        sub="visited last week, not this week"
        color={inactiveCount > 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}
        loading={loading.clientAnalytics}
      />
      <Card
        icon={AlertCircle}
        label="Failed payments"
        value={fmt(failedCount)}
        sub={failedAmt !== undefined ? `${fmt(failedAmt, '$')} total` : undefined}
        color={failedCount > 0 ? 'bg-red-500/10 text-red-400' : 'bg-gray-700/40 text-gray-400'}
        loading={loading.payments}
      />
      <Card
        icon={Wallet}
        label="On account"
        value={fmt(acctCount)}
        sub={acctAmt !== undefined ? `${fmt(acctAmt, '$')} outstanding` : undefined}
        color={acctAmt > 0 ? 'bg-orange-500/10 text-orange-400' : 'bg-gray-700/40 text-gray-400'}
        loading={loading.payments}
      />
    </div>
  );
}
