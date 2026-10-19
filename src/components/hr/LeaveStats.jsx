import { useMemo } from 'react';
import { LEAVE_TYPES } from '../../utils/leave.js';

/**
 * Days taken per person by leave type for the chosen period (the Notion
 * "Stats" view). Counts a request's work days in full if it overlaps the
 * period at all; declined requests never count, pending ones are shown
 * separately so they don't inflate the approved totals.
 */
export default function LeaveStats({ requests, people, periodLabel, onOpen }) {
  const rows = useMemo(() => people.map((p) => {
    const mine = requests.filter((r) => r.staff_id === p.id && r.status !== 'declined');
    const byType = {};
    let approved = 0; let pending = 0;
    for (const r of mine) {
      const d = Number(r.work_days) || 0;
      if (r.status === 'approved') { byType[r.leave_type] = (byType[r.leave_type] || 0) + d; approved += d; }
      else pending += d;
    }
    return { p, byType, approved, pending, count: mine.length };
  }), [people, requests]);

  const totals = LEAVE_TYPES.map((t) => rows.reduce((s, r) => s + (r.byType[t.key] || 0), 0));
  const fmt = (n) => (n ? Number(n.toFixed(1)) : '—');

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        Approved work days by type for <span className="font-medium text-gray-700">{periodLabel}</span>. A request that crosses the period edge counts in full.
      </p>
      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 text-left">Team member</th>
              {LEAVE_TYPES.map((t) => (
                <th key={t.key} className="px-3 py-2 text-right whitespace-nowrap">
                  <span className={`mr-1 inline-block h-2 w-2 rounded-full ${t.dot}`} />{t.short}
                </th>
              ))}
              <th className="px-3 py-2 text-right">Approved</th>
              <th className="px-3 py-2 text-right">Pending</th>
              <th className="px-3 py-2 text-right">Entries</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, byType, approved, pending, count }) => (
              <tr key={p.id} className="border-b border-gray-100">
                <td className="px-3 py-2 font-medium text-gray-800">{p.full_name}</td>
                {LEAVE_TYPES.map((t) => <td key={t.key} className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(byType[t.key])}</td>)}
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{fmt(approved)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-700">{fmt(pending)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">{count || '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-800">
            <tr>
              <td className="px-3 py-2">Team</td>
              {totals.map((n, i) => <td key={LEAVE_TYPES[i].key} className="px-3 py-2 text-right tabular-nums">{fmt(n)}</td>)}
              <td className="px-3 py-2 text-right tabular-nums">{fmt(rows.reduce((s, r) => s + r.approved, 0))}</td>
              <td className="px-3 py-2 text-right tabular-nums text-amber-700">{fmt(rows.reduce((s, r) => s + r.pending, 0))}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-500">{rows.reduce((s, r) => s + r.count, 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[11px] text-gray-400">Entries with no work days set count as 0 — open them from the Table view to fill it in.</p>
    </div>
  );
}
