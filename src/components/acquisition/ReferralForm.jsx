import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ghlApi } from '../../utils/useAcquisition.js';

const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

/** New referral → GHL contact (tagged "referral") + opportunity in the Leads pipeline's first stage. */
export default function ReferralForm({ clients, onClose, onAdded }) {
  const [form, setForm]   = useState({ firstName: '', lastName: '', email: '', phone: '', referredBy: '', note: '' });
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.firstName.trim()) { setError('First name is required'); return; }
    if (!form.email.trim() && !form.phone.trim()) { setError('Add an email or phone so GHL can reach them'); return; }
    setBusy(true); setError(null);
    try {
      const res = await ghlApi('ghl-lead', { body: { action: 'add-referral', ...form } });
      onAdded?.(res);
      onClose();
    } catch (e2) { setError(e2.message); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="relative w-full max-w-md rounded-xl border border-gray-300 bg-white shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Add a referral</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input className={input} placeholder="First name *" value={form.firstName} onChange={set('firstName')} autoFocus />
            <input className={input} placeholder="Last name" value={form.lastName} onChange={set('lastName')} />
          </div>
          <input className={input} type="email" placeholder="Email" value={form.email} onChange={set('email')} />
          <input className={input} type="tel" placeholder="Mobile" value={form.phone} onChange={set('phone')} />
          <div>
            <input className={input} list="referral-clients" placeholder="Referred by (member name)" value={form.referredBy} onChange={set('referredBy')} />
            <datalist id="referral-clients">
              {(clients || []).map((c) => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>
          <textarea className={input} rows={3} placeholder="Note (saved to GHL)" value={form.note} onChange={set('note')} />
          <p className="text-[11px] text-gray-500">If they're already in GHL (same email or phone) the existing contact is used, and no second opportunity is made if they already have an open one.</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300">Cancel</button>
          <button disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? 'Adding…' : 'Add to pipeline'}
          </button>
        </div>
      </form>
    </div>
  );
}
