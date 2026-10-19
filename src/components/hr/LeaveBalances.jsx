import { useMemo } from 'react';
import { RefreshCw, Lock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useLeaveBalances } from '../../utils/useLeaveBalances.js';
import { LEAVE_TYPES, HOURS_PER_DAY, todayIso } from '../../utils/leave.js';

const fmtH = (h) => `${Number(h).toFixed(1)} h`;
const fmtD = (h) => `≈ ${(Number(h) / HOURS_PER_DAY).toFixed(1)} days`;

/**
 * Accrued leave from Xero Payroll, under the planner. Staff only ever get
 * their own row back (RLS on leave_balances); managers see everyone plus a
 * Refresh button. "Booked ahead" is approved/pending leave that hasn't
 * started yet — Xero only deducts leave once it's paid in a pay run, so the
 * balance doesn't include it.
 */
export default function LeaveBalances({ people, requests, staff, isManager }) {
  const { balances, loading, refreshing, error, refresh } = useLeaveBalances();
  const today = todayIso();

  const rows = useMemo(() => {
    const list = isManager ? people : people.filter((p) => p.id === staff?.id);
    return list.map((p) => {
      const mine = balances.filter((b) => b.staff_id === p.id);
      const byCat = {};
      for (const t of LEAVE_TYPES) byCat[t.key] = mine.filter((b) => b.category === t.key).reduce((s, b) => s + Number(b.units), 0);
      const other = mine.filter((b) => !b.category);
      const booked = {};
      for (const t of LEAVE_TYPES) {
        booked[t.key] = requests
          .filter((r) => r.staff_id === p.id && r.leave_type === t.key && r.status !== 'declined' && r.start_date > today)
          .reduce((s, r) => s + (Number(r.work_days) || 0), 0);
      }
      return { p, hasXero: mine.length > 0, byCat, other, booked };
    });
  }, [people, balances, requests, staff, isManager, today]);

  const asOf = balances.reduce((m, b) => (b.as_of > m ? b.as_of : m), '');

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-gray-900 text-sm">{isManager ? 'Leave balances' : 'My leave balance'}</h2>
        <span className="flex items-center gap-1 text-[11px] text-gray-500">
          <Lock className="h-3 w-3" /> {isManager ? 'Managers see everyone; staff only see their own' : 'Only you and managers can see this'}
        </span>
        <span className="ml-auto text-[11px] text-gray-500">
          {refreshing ? 'Updating from Xero…' : asOf ? `From Xero Payroll · updated ${formatDistanceToNow(new Date(asOf), { addSuffix: true })}` : ''}
        </span>
        {isManager && (
          <button onClick={refresh} disabled={refreshing} className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !isManager ? (
        <OwnBalance row={rows[0]} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200">
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 text-left">Team member</th>
                {LEAVE_TYPES.map((t) => (
                  <th key={t.key} className="px-3 py-2 text-right whitespace-nowrap">
                    <span className={`mr-1 inline-block h-2 w-2 rounded-full ${t.dot}`} />{t.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right whitespace-nowrap">Booked ahead</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, hasXero, byCat, other, booked }) => (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-800">{p.full_name}</td>
                  {hasXero ? LEAVE_TYPES.map((t) => (
                    <td key={t.key} className="px-3 py-2 text-right tabular-nums">
                      <span className="font-semibold text-gray-900">{fmtH(byCat[t.key])}</span>
                      <span className="ml-1.5 text-xs text-gray-500">{fmtD(byCat[t.key])}</span>
                    </td>
                  )) : (
                    <td colSpan={LEAVE_TYPES.length} className="px-3 py-2 text-right text-xs text-gray-400">
                      {p.xero_employee_id ? 'No leave accruing in Xero (casual?)' : 'Not mapped to a Xero employee (Team → Wages)'}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right text-xs text-gray-600 whitespace-nowrap">
                    {LEAVE_TYPES.filter((t) => booked[t.key]).map((t) => `${booked[t.key]}d ${t.short.toLowerCase()}`).join(' · ') || '—'}
                    {other.length > 0 && <span className="ml-2 text-gray-400" title={other.map((o) => `${o.leave_name}: ${fmtH(o.units)}`).join(', ')}>+{other.length} other</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-gray-400">
        Days are hours ÷ {HOURS_PER_DAY}. Xero only deducts leave once it's paid in a pay run, so upcoming booked leave isn't taken off yet.
      </p>
    </div>
  );
}

function OwnBalance({ row }) {
  if (!row) return <p className="text-sm text-gray-500">You're not set up in the leave planner.</p>;
  if (!row.hasXero) {
    return <p className="text-sm text-gray-500">No leave balance in Xero for you — check with a manager if you think you should be accruing leave.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {LEAVE_TYPES.map((t) => (
        <div key={t.key} className={`rounded-lg border p-3 ${t.soft}`}>
          <p className="text-xs font-medium">{t.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtH(row.byCat[t.key])}</p>
          <p className="text-xs opacity-80">
            {fmtD(row.byCat[t.key])}
            {row.booked[t.key] > 0 && ` · ${row.booked[t.key]} day${row.booked[t.key] === 1 ? '' : 's'} booked ahead`}
          </p>
        </div>
      ))}
    </div>
  );
}
