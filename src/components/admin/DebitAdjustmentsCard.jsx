import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { CalendarClock, Check, Loader2, PlayCircle } from 'lucide-react';
import { useDebitAdjustments, DEBIT_STATUS, fmtDebitDate } from '../../utils/useDebitAdjustments.js';
import HomeCard from '../HomeCard.jsx';

/**
 * Home card for whoever holds the Office admin duty (staff.is_office_admin):
 * every open debit adjustment, oldest first, with a tick to mark it done
 * once it's been actioned in Mindbody. Full history lives in the Admin tab.
 */
export default function DebitAdjustmentsCard({ enabled, refreshKey, onOpenAdmin }) {
  const { rows, update, reload } = useDebitAdjustments({ openOnly: true, enabled });
  // Re-fetch in place after someone submits from Home (no remount).
  useEffect(() => { if (enabled && refreshKey) reload(); }, [enabled, refreshKey, reload]);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  if (!enabled || rows.length === 0) return null;

  const setStatus = async (r, status) => {
    setBusy(r.id); setErr(null);
    const e = await update(r.id, { status });
    if (e) setErr(e);
    setBusy(null);
  };

  const ordered = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <HomeCard id="debit_adjustments" tone="violet" icon={CalendarClock} title="Debit Adjustments to Process" count={rows.length}
      actions={<button onClick={onOpenAdmin} className="shrink-0 text-xs font-medium text-violet-700 hover:underline">View all</button>}>
      <p className="mb-4 text-xs text-gray-500">Suspensions and holidays logged by the team. Tick each one once it's done in Mindbody.</p>
      {err && <p className="mb-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-red-700">{err}</p>}
      <div className="space-y-2">
        {ordered.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">
                {r.client_name}
                <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium capitalize text-gray-600">{r.kind}</span>
                {r.status === 'in_progress' && (
                  <span className={`ml-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${DEBIT_STATUS.in_progress.tone}`}>In progress</span>
                )}
              </p>
              <p className="text-xs text-gray-500">{fmtDebitDate(r.hold_start)} → {fmtDebitDate(r.return_date)}</p>
              <p className="text-xs text-gray-400">
                Logged by {r.submitter?.full_name || 'unknown'} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
              </p>
              {r.notes && <p className="mt-0.5 text-xs text-gray-600">“{r.notes}”</p>}
            </div>
            <div className="flex shrink-0 gap-1.5">
              {r.status === 'submitted' && (
                <button disabled={busy === r.id} onClick={() => setStatus(r, 'in_progress')}
                  className="flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-500/20 disabled:opacity-50">
                  <PlayCircle className="h-3.5 w-3.5" /> Started
                </button>
              )}
              <button disabled={busy === r.id} onClick={() => setStatus(r, 'processed')}
                className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50">
                {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Processed
              </button>
            </div>
          </div>
        ))}
      </div>
    </HomeCard>
  );
}
