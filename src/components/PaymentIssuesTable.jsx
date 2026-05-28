import { useState } from 'react';
import { CreditCard, Wallet, AlertTriangle } from 'lucide-react';

function fmtAUD(n) {
  return `$${Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_COLORS = {
  Declined: 'bg-red-500/10 text-red-400',
  Failed:   'bg-red-500/10 text-red-400',
  Error:    'bg-red-500/10 text-red-400',
  Voided:   'bg-gray-500/10 text-gray-400',
};

export default function PaymentIssuesTable({ data, loading, error }) {
  const [tab, setTab] = useState('failed');

  const failed    = data?.failedPayments || [];
  const onAccount = data?.onAccount || [];
  const summary   = data?.summary || {};

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <h2 className="font-semibold text-white">Payment Issues</h2>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {summary.failedCount > 0 && (
            <span className="text-red-400 font-medium">
              {summary.failedCount} failed · {fmtAUD(summary.totalFailedAmount)}
            </span>
          )}
          {summary.onAccountCount > 0 && (
            <span className="text-orange-400 font-medium">
              {summary.onAccountCount} on account · {fmtAUD(summary.totalOnAccountAmount)}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {[
          { key: 'failed',    label: 'Failed Payments', icon: CreditCard, count: failed.length },
          { key: 'onAccount', label: 'On Account',      icon: Wallet,     count: onAccount.length },
        ].map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm border-b-2 transition-colors ${
              tab === key
                ? 'border-emerald-500 text-emerald-400 bg-gray-800/40'
                : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/20'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {!loading && count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                key === 'failed' ? 'bg-red-500/10 text-red-400' : 'bg-orange-500/10 text-orange-400'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="overflow-x-auto">
        {loading && (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-800" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="p-5 text-sm text-red-400">Could not load: {error}</p>
        )}

        {/* ── Failed payments table ── */}
        {!loading && !error && tab === 'failed' && (
          <>
            {failed.length === 0 ? (
              <div className="py-12 text-center">
                <CreditCard className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No failed payments in the last 30 days</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-xs text-gray-500">
                    <th className="px-5 py-3 text-left font-medium">Client</th>
                    <th className="px-5 py-3 text-left font-medium">Description</th>
                    <th className="px-5 py-3 text-right font-medium">Amount</th>
                    <th className="px-5 py-3 text-left font-medium">Date</th>
                    <th className="px-5 py-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {failed.map((p, i) => (
                    <tr
                      key={p.id || i}
                      className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="px-5 py-3 font-medium text-gray-200 whitespace-nowrap">
                        {p.clientName}
                      </td>
                      <td className="px-5 py-3 text-gray-400 max-w-[200px] truncate">
                        {p.description}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-medium text-red-400 whitespace-nowrap">
                        {fmtAUD(p.amount)}
                      </td>
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{p.date}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status] || 'bg-gray-700/40 text-gray-400'}`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* ── On-account table ── */}
        {!loading && !error && tab === 'onAccount' && (
          <>
            {onAccount.length === 0 ? (
              <div className="py-12 text-center">
                <Wallet className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No outstanding account balances</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-xs text-gray-500">
                    <th className="px-5 py-3 text-left font-medium">Client</th>
                    <th className="px-5 py-3 text-left font-medium">Email / Phone</th>
                    <th className="px-5 py-3 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {onAccount.map((b, i) => (
                    <tr
                      key={b.clientId || i}
                      className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="px-5 py-3 font-medium text-gray-200 whitespace-nowrap">
                        {b.clientName}
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">
                        {b.email || b.phone || '–'}
                      </td>
                      <td className={`px-5 py-3 text-right font-mono font-bold whitespace-nowrap ${
                        b.balance > 100 ? 'text-red-400' : b.balance > 50 ? 'text-orange-400' : 'text-yellow-400'
                      }`}>
                        {fmtAUD(b.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
