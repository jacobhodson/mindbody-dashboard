import { useState, useEffect, useCallback } from 'react';
import { UserMinus, Check, Repeat } from 'lucide-react';
import { supabase } from '../lib/supabaseClient.js';
import { ghlApi } from '../utils/useAcquisition.js';

const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

// Home notice (managers): Mindbody contract terminations with no GHL
// cancellation notice to explain them — members who ghosted us, or a
// contract swapped for a new one. "Churn" counts it on the Scoreboard and
// tags them "cancellation notice given" in GHL; "Not churn" just clears it.
// Rows come from refresh_churn_review() (20261026000000_churn_cancellations.sql).
export default function TerminationReviewCard({ isManager, onViewClient }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('contract_terminations')
      .select('id, mb_client_id, name, termination_date, contracts, other_contract, signal')
      .eq('status', 'pending').order('termination_date');
    setRows(data || []);
  }, []);

  useEffect(() => { if (isManager) load(); }, [isManager, load]);

  const decide = async (row, decision) => {
    setBusy(row.id);
    setMessage(null);
    try {
      const res = await ghlApi('ghl-lead', { body: { action: 'termination', id: row.id, decision } });
      if (res.note) setMessage(`${row.name || 'Client'}: ${res.note}`);
      setRows((rs) => rs.filter((r) => r.id !== row.id));
    } catch (e) {
      setMessage(e.message);
      load();
    } finally {
      setBusy(null);
    }
  };

  if (!isManager || (rows.length === 0 && !message)) return null;

  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50/40 p-5">
      <div className="mb-1 flex items-center gap-2">
        <UserMinus className="h-4 w-4 text-amber-600" />
        <h2 className="font-semibold text-gray-900">Terminations to Review</h2>
        {rows.length > 0 && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{rows.length}</span>
        )}
      </div>
      <p className="mb-4 text-xs text-gray-500">
        Terminated in Mindbody with no cancellation form in GHL. Churn counts it on the Scoreboard and tags them in GHL; a contract change isn't churn.
      </p>
      {message && <p className="mb-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-amber-800">{message}</p>}
      <div className="space-y-2">
        {rows.map((r) => {
          const contracts = (r.contracts || []).map((c) => c.name).filter(Boolean).join(', ');
          return (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
              <button onClick={() => onViewClient?.(r.mb_client_id)} className="min-w-0 text-left">
                <p className="truncate text-sm font-medium text-gray-900 hover:underline">{r.name || `Client ${r.mb_client_id}`}</p>
                <p className="text-xs text-gray-500">
                  {contracts || 'Contract'} · {r.signal === 'status' ? 'marked Terminated' : 'terminated'} {fmt(r.termination_date)}
                </p>
                {r.other_contract
                  ? <p className="text-xs text-sky-700">Still has: {r.other_contract} — probably a contract change</p>
                  : <p className="text-xs text-amber-700">No other contract in Mindbody</p>}
              </button>
              <div className="flex shrink-0 gap-1.5">
                <button disabled={busy === r.id} onClick={() => decide(r, 'churn')}
                  className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-500/20 disabled:opacity-50">
                  <Check className="h-3.5 w-3.5" /> Churn
                </button>
                <button disabled={busy === r.id} onClick={() => decide(r, 'not_churn')}
                  className="flex items-center gap-1 rounded-lg border border-gray-300 bg-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-300 disabled:opacity-50">
                  <Repeat className="h-3.5 w-3.5" /> Not churn
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
