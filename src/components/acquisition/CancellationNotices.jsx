import { useState, useEffect } from 'react';
import { UserMinus } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient.js';

const DAYS = 90;
const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
const SOURCE = {
  ghl:       { label: 'GHL form',  tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  dashboard: { label: 'Mindbody',  tone: 'bg-amber-50 text-amber-700 border-amber-200' },
};

/**
 * Cancellation notices from the last DAYS days — each one is a Scoreboard
 * Churn on its notice date. "GHL form" = the member's cancellation form
 * (tag "cancellation notice given"); "Mindbody" = a manager counted a
 * Mindbody termination that had no form (TerminationReviewCard on Home).
 */
export default function CancellationNotices() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    const since = new Date(Date.now() - DAYS * 86400_000).toISOString().slice(0, 10);
    supabase.from('cancellations')
      .select('id, notice_date, source, name, reason, mb_client_id')
      .is('duplicate_of', null).gte('notice_date', since)
      .order('notice_date', { ascending: false }).order('created_at', { ascending: false })
      .then(({ data }) => setRows(data || []));
  }, []);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <UserMinus className="h-4 w-4 text-gray-500" />
        <h2 className="font-semibold text-gray-900">Cancellation notices</h2>
        {rows?.length > 0 && <span className="text-xs text-gray-500">{rows.length} in the last {DAYS} days</span>}
      </div>
      <p className="mb-4 text-xs text-gray-500">Each one counts as churn on the Scoreboard on the day the notice was given.</p>
      {rows === null ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No cancellation notices yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Member</th>
                <th className="py-2 pr-3 font-medium">From</th>
                <th className="py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = SOURCE[r.source] || SOURCE.ghl;
                return (
                  <tr key={r.id} className="border-b border-gray-100 last:border-0 align-top">
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-600">{fmt(r.notice_date)}</td>
                    <td className="py-2 pr-3 text-gray-900">
                      {r.name || 'Unknown'}
                      {!r.mb_client_id && <span className="ml-1.5 text-[10px] text-gray-400">not matched to Mindbody</span>}
                    </td>
                    <td className="py-2 pr-3"><span className={`rounded border px-1.5 py-px text-xs ${s.tone}`}>{s.label}</span></td>
                    <td className="py-2 text-gray-600">{r.reason || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
