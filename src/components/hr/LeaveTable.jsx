import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowDown, ArrowUp, CheckCircle2 } from 'lucide-react';
import { typeMeta, STATUS_BY_KEY, formatRange, nextUpCompare, todayIso, LEAVE_TYPES } from '../../utils/leave.js';
import { renderFormatted } from '../../utils/richText.js';

const TYPE_ORDER = Object.fromEntries(LEAVE_TYPES.map((t, i) => [t.key, i]));
const STATUS_ORDER = { pending: 0, approved: 1, declined: 2 };

const SORTS = {
  nextUp:    { label: 'Next up',            cmp: (a, b) => nextUpCompare(a, b) },
  startDesc: { label: 'Start date (newest)', cmp: (a, b) => b.start_date.localeCompare(a.start_date) },
  startAsc:  { label: 'Start date (oldest)', cmp: (a, b) => a.start_date.localeCompare(b.start_date) },
  person:    { label: 'Team member',        cmp: (a, b, n) => (n[a.staff_id] || '').localeCompare(n[b.staff_id] || '') || a.start_date.localeCompare(b.start_date) },
  type:      { label: 'Leave type',         cmp: (a, b) => TYPE_ORDER[a.leave_type] - TYPE_ORDER[b.leave_type] || a.start_date.localeCompare(b.start_date) },
  days:      { label: 'Work days',          cmp: (a, b) => (Number(b.work_days) || 0) - (Number(a.work_days) || 0) },
  status:    { label: 'Status',             cmp: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || nextUpCompare(a, b) },
  requested: { label: 'Recently requested', cmp: (a, b) => b.created_at.localeCompare(a.created_at) },
};
// Column header → the sort it toggles (asc/desc handled by flipping).
const COL_SORT = { person: 'person', type: 'type', dates: 'startAsc', days: 'days', status: 'status', requested: 'requested' };

/** The Notion "Add Leave Here" table: every filtered request, sortable. */
export default function LeaveTable({ requests, nameById, isManager, onOpen }) {
  const [sort, setSort] = useState('nextUp');
  const [desc, setDesc] = useState(false);
  const today = todayIso();

  const rows = useMemo(() => {
    const out = [...requests].sort((a, b) => SORTS[sort].cmp(a, b, nameById));
    return desc ? out.reverse() : out;
  }, [requests, sort, desc, nameById]);

  const clickCol = (col) => {
    const s = COL_SORT[col];
    if (sort === s) setDesc((d) => !d); else { setSort(s); setDesc(false); }
  };
  const Th = ({ col, children, className = '' }) => (
    <th className={`px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap ${className}`}>
      {col ? (
        <button onClick={() => clickCol(col)} className="flex items-center gap-0.5 uppercase hover:text-gray-800">
          {children}
          {sort === COL_SORT[col] && (desc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </button>
      ) : children}
    </th>
  );

  const totalDays = rows.reduce((s, r) => s + (r.status !== 'declined' ? Number(r.work_days) || 0 : 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <span>Sort by</span>
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); setDesc(false); }}
          className="rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-800"
        >
          {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
        <button onClick={() => setDesc((d) => !d)} className="rounded-md border border-gray-200 px-2 py-1 hover:bg-gray-100">
          {desc ? 'Reversed' : 'Normal order'}
        </button>
        <span className="ml-auto text-gray-500">
          {rows.length} entr{rows.length === 1 ? 'y' : 'ies'} · {totalDays} work days
        </span>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <Th col="person">Team member</Th>
              <Th>Description</Th>
              <Th col="type">Type</Th>
              <Th col="dates">Dates</Th>
              <Th col="days" className="text-right">Days</Th>
              <Th col="status">Status</Th>
              {isManager && <Th>Balance</Th>}
              <Th>Notes</Th>
              <Th col="requested">Requested</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-gray-500">No leave matches these filters.</td></tr>
            )}
            {rows.map((r) => {
              const t = typeMeta(r.leave_type);
              const st = STATUS_BY_KEY[r.status];
              const now = r.start_date <= today && r.end_date >= today;
              const past = r.end_date < today;
              return (
                <tr key={r.id} onClick={() => onOpen(r)} className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${past ? 'text-gray-500' : 'text-gray-800'}`}>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{nameById[r.staff_id] || 'Unknown'}</td>
                  <td className="px-3 py-2 min-w-[11rem]">
                    {r.title}
                    {now && <span className="ml-1.5 rounded-full bg-emerald-600 px-1.5 py-px text-[10px] font-semibold text-white">Away now</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap"><span className={`rounded border px-1.5 py-px text-xs ${t.soft}`}>{t.short}</span></td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatRange(r)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.work_days != null ? Number(r.work_days) : '—'}</td>
                  <td className="px-3 py-2"><span className={`rounded-full border px-2 py-px text-xs ${st.pill}`}>{st.label}</span></td>
                  {isManager && (
                    <td className="px-3 py-2">{r.balance_updated && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}</td>
                  )}
                  <td className="px-3 py-2 max-w-xs truncate text-xs text-gray-600" title={r.notes || ''}>{r.notes ? renderFormatted(r.notes) : ''}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{format(parseISO(r.created_at), 'd MMM yy')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
