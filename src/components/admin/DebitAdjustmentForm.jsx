import { useState, useEffect, useMemo } from 'react';
import { X, Loader2, CheckCircle2, Info } from 'lucide-react';
import { DEBIT_KINDS, submitDebitAdjustment } from '../../utils/useDebitAdjustments.js';

const input = 'w-full rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';
const label = 'block text-xs font-medium text-gray-600 mb-1';

const clientName = (c) => [c.first_name, c.last_name].filter(Boolean).join(' ').trim();

/**
 * Pop-up version of the old "Debit Adjustments" Google Form. Client name is
 * a roster search (falls back to whatever's typed), plus hold dates. Whoever
 * is signed in is logged as the submitter by the database.
 */
export default function DebitAdjustmentForm({ clients = [], onClose, onSubmitted }) {
  const [f, setF] = useState({ client_name: '', client_id: null, kind: 'suspension', hold_start: '', return_date: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);
  const [showMatches, setShowMatches] = useState(false);

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const matches = useMemo(() => {
    const q = f.client_name.trim().toLowerCase();
    if (q.length < 2 || f.client_id) return [];
    return clients.filter((c) => clientName(c).toLowerCase().includes(q)
      || (c.email || '').toLowerCase().includes(q)).slice(0, 6);
  }, [clients, f.client_name, f.client_id]);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (!f.client_name.trim()) { setErr('Client name is required.'); return; }
    if (f.hold_start && f.return_date && f.return_date < f.hold_start) { setErr('The return date is before the first day of the hold.'); return; }
    setSaving(true); setErr(null);
    const error = await submitDebitAdjustment({
      client_name: f.client_name.trim(),
      client_id: f.client_id,
      kind: f.kind,
      hold_start: f.hold_start || null,
      return_date: f.return_date || null,
      notes: f.notes.trim() || null,
    });
    setSaving(false);
    if (error) { setErr(`Could not submit: ${error}`); return; }
    setDone(true);
    onSubmitted?.();
  };

  const reset = () => { setF({ client_name: '', client_id: null, kind: 'suspension', hold_start: '', return_date: '', notes: '' }); setDone(false); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-gray-900">Debit Adjustment</h2>
            <p className="text-xs text-gray-500">For filling out client debit adjustments.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>

        {done ? (
          <div className="space-y-4 px-5 py-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <div>
              <p className="font-medium text-gray-900">Submitted</p>
              <p className="text-sm text-gray-500">The office admin has been notified. You can follow it in the Admin tab.</p>
            </div>
            <div className="flex justify-center gap-2">
              <button onClick={reset} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Log another</button>
              <button onClick={onClose} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">Done</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-4">
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>Only for <strong>suspensions and holidays</strong>. Cancellations go through the cancellation link.</p>
            </div>

            <div className="relative">
              <label className={label}>Client name <span className="text-red-500">*</span></label>
              <input
                value={f.client_name}
                onChange={(e) => { setF((p) => ({ ...p, client_name: e.target.value, client_id: null })); setShowMatches(true); }}
                onFocus={() => setShowMatches(true)}
                onBlur={() => setTimeout(() => setShowMatches(false), 150)}
                placeholder="Start typing to search clients"
                className={input}
                autoFocus
              />
              {f.client_id && <p className="mt-1 text-[11px] text-emerald-700">Linked to the client's profile</p>}
              {showMatches && matches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                  {matches.map((c) => (
                    <button
                      key={c.id} type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setF((p) => ({ ...p, client_name: clientName(c), client_id: c.id })); setShowMatches(false); }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="text-gray-900">{clientName(c)}</span>
                      {c.email && <span className="ml-2 text-xs text-gray-400">{c.email}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className={label}>Type</label>
              <div className="flex gap-2">
                {DEBIT_KINDS.map((k) => (
                  <button
                    key={k.key} type="button" onClick={() => setF((p) => ({ ...p, kind: k.key }))}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${f.kind === k.key ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                  >{k.label}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>First day of hold</label>
                <input type="date" value={f.hold_start} onChange={set('hold_start')} className={input} />
              </div>
              <div>
                <label className={label}>Date returning</label>
                <input type="date" value={f.return_date} min={f.hold_start || undefined} onChange={set('return_date')} className={input} />
              </div>
            </div>

            <div>
              <label className={label}>Notes <span className="font-normal text-gray-400">(optional)</span></label>
              <textarea value={f.notes} onChange={set('notes')} rows={2} className={input} placeholder="Anything the office admin should know" />
            </div>

            {err && <p className="text-xs text-red-600">{err}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100">Cancel</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Submit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
