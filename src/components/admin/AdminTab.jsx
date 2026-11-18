import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Plus, Search, Trash2 } from 'lucide-react';
import {
  useDebitAdjustments, DEBIT_STATUSES, DEBIT_STATUS, isOpenDebit, fmtDebitDate,
} from '../../utils/useDebitAdjustments.js';
import DebitAdjustmentForm from './DebitAdjustmentForm.jsx';
import { useAllClients } from '../../utils/useAllClients.js';

const FILTERS = [
  { key: 'open',      label: 'Open',      test: isOpenDebit },
  { key: 'processed', label: 'Processed', test: (r) => r.status === 'processed' },
  { key: 'cancelled', label: 'Cancelled', test: (r) => r.status === 'cancelled' },
  { key: 'all',       label: 'All',       test: () => true },
];

const stamp = (ts) => (ts ? format(new Date(ts), 'd MMM yyyy, h:mma').replace('AM', 'am').replace('PM', 'pm') : '');

/**
 * Admin tab: the full debit adjustment log for the whole team — what's been
 * logged, by whom, and where each one's at. Office admins and managers can
 * move status; anyone can cancel their own while it's still waiting.
 */
export default function AdminTab({ staff, isManager }) {
  const { rows, loading, update, remove, reload } = useDebitAdjustments();
  const { clientsList } = useAllClients();
  const [filter, setFilter] = useState('open');
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState(null);
  const canProcess = isManager || !!staff?.is_office_admin;

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter(f.test).length])), [rows]);
  const shown = useMemo(() => {
    const test = FILTERS.find((f) => f.key === filter).test;
    const needle = q.trim().toLowerCase();
    return rows.filter(test).filter((r) => !needle
      || r.client_name.toLowerCase().includes(needle)
      || (r.submitter?.full_name || '').toLowerCase().includes(needle));
  }, [rows, filter, q]);

  const setStatus = async (r, status) => {
    setErr(null);
    const e = await update(r.id, { status });
    if (e) setErr(e);
  };
  const saveNote = async (r, admin_note) => {
    if ((admin_note || '') === (r.admin_note || '')) return;
    const e = await update(r.id, { admin_note: admin_note || null });
    if (e) setErr(e);
  };
  const del = async (r) => {
    if (!window.confirm(`Delete the debit adjustment for ${r.client_name}? This can't be undone.`)) return;
    const e = await remove(r.id);
    if (e) setErr(e);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Admin</h1>
          <p className="text-sm text-gray-500">Debit adjustments: suspensions and holidays logged by the team, and where each one's at.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500">
          <Plus className="h-4 w-4" /> Debit adjustment
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === f.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {f.label} <span className={filter === f.key ? 'text-gray-300' : 'text-gray-400'}>{counts[f.key]}</span>
            </button>
          ))}
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client or staff"
              className="w-56 rounded-lg border border-gray-300 bg-gray-50 py-1.5 pl-8 pr-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
        </div>

        {err && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}

        {loading ? (
          <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Nothing here.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                  <th className="px-5 py-2">Client</th>
                  <th className="px-3 py-2">Hold</th>
                  <th className="px-3 py-2">Logged</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Admin note</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const mine = r.submitted_by === staff?.id;
                  const st = DEBIT_STATUS[r.status];
                  return (
                    <tr key={r.id} className="border-b border-gray-100 align-top">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{r.client_name}</p>
                        <p className="text-xs capitalize text-gray-500">{r.kind}</p>
                        {r.notes && <p className="mt-0.5 max-w-xs text-xs text-gray-600">“{r.notes}”</p>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-700">
                        <p>From {fmtDebitDate(r.hold_start)}</p>
                        <p>Back {fmtDebitDate(r.return_date)}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-600">
                        <p className="text-gray-900">{r.submitter?.full_name || 'Unknown'}</p>
                        <p>{stamp(r.created_at)}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs">
                        {canProcess ? (
                          <select value={r.status} onChange={(e) => setStatus(r, e.target.value)}
                            className={`rounded-full border px-2 py-0.5 font-medium ${st.tone}`}>
                            {DEBIT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                        ) : (
                          <span className={`rounded-full border px-2 py-0.5 font-medium ${st.tone}`}>{st.label}</span>
                        )}
                        {r.status === 'processed' && (
                          <p className="mt-1 text-gray-500">by {r.processor?.full_name || 'unknown'}<br />{stamp(r.processed_at)}</p>
                        )}
                        {!canProcess && mine && r.status === 'submitted' && (
                          <button onClick={() => setStatus(r, 'cancelled')} className="mt-1 block text-gray-500 hover:text-red-600 hover:underline">Cancel request</button>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {canProcess ? (
                          <input defaultValue={r.admin_note || ''} onBlur={(e) => saveNote(r, e.target.value.trim())}
                            placeholder="Add a note" className="w-44 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-gray-700 hover:border-gray-200 focus:border-gray-300 focus:bg-gray-50 focus:outline-none" />
                        ) : (
                          <span className="text-gray-600">{r.admin_note}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {isManager && (
                          <button onClick={() => del(r)} title="Delete" aria-label="Delete" className="rounded-md p-1.5 text-gray-300 hover:bg-gray-100 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && <DebitAdjustmentForm clients={clientsList} onSubmitted={reload} onClose={() => setShowForm(false)} />}
    </div>
  );
}
