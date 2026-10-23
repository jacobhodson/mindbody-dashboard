import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { X, Mail, Phone, ExternalLink, Send } from 'lucide-react';
import { ghlApi } from '../../utils/useAcquisition.js';
import { ChannelChip } from './LeadBoard.jsx';

const GHL_APP = 'https://app.gohighlevel.com';

function Field({ label, children }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <div className="text-sm text-gray-800 mt-0.5">{children || <span className="text-gray-400">–</span>}</div>
    </div>
  );
}

/** One lead: contact details, where it came from, and its GHL notes (read + add, live). */
export default function LeadModal({ lead, locationId, onClose }) {
  const [notes, setNotes]   = useState(null);
  const [error, setError]   = useState(null);
  const [draft, setDraft]   = useState('');
  const [saving, setSaving] = useState(false);
  const contactId = lead.contact_id;

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const loadNotes = useCallback(async () => {
    if (!contactId) { setNotes([]); return; }
    try { setNotes((await ghlApi('ghl-lead', { query: { view: 'notes', contactId } })).notes); }
    catch (e) { setError(e.message); setNotes([]); }
  }, [contactId]);
  useEffect(() => { loadNotes(); }, [loadNotes]);

  const save = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setSaving(true); setError(null);
    try {
      await ghlApi('ghl-lead', { body: { action: 'note', contactId, body: draft } });
      setDraft('');
      await loadNotes();
    } catch (e2) { setError(e2.message); }
    setSaving(false);
  };

  const c = lead.contact || {};
  const attr = c.attribution || {};
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-full max-w-xl rounded-xl border border-gray-300 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-gray-200">
          <div className="min-w-0">
            <p className="text-xs font-medium text-emerald-600 mb-1">{lead.stageName} · <span className="capitalize">{lead.status}</span></p>
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
              {c.name || lead.name || 'Unnamed lead'} <ChannelChip channel={lead.channel} />
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email">{c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-emerald-700 hover:underline break-all"><Mail className="h-3 w-3 shrink-0" />{c.email}</a>}</Field>
            <Field label="Phone">{c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-emerald-700 hover:underline"><Phone className="h-3 w-3" />{c.phone}</a>}</Field>
            <Field label="Lead came in">{lead.created_at && format(new Date(lead.created_at), 'EEE d MMM yyyy, h:mm a')}</Field>
            <Field label="Source">{lead.detail}</Field>
            {(attr.utmSource || attr.campaign || attr.medium) && (
              <Field label="Attribution">{[attr.utmSource, attr.medium, attr.campaign].filter(Boolean).join(' · ')}</Field>
            )}
            {c.tags?.length > 0 && (
              <Field label="Tags">
                <div className="flex flex-wrap gap-1">{c.tags.map((t) => <span key={t} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700">{t}</span>)}</div>
              </Field>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Notes (saved to GHL)</p>
            {contactId ? (
              <form onSubmit={save} className="space-y-2">
                <textarea
                  value={draft} onChange={(e) => setDraft(e.target.value)} rows={3}
                  placeholder="Add a note — it's saved on this contact in GHL"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex justify-end">
                  <button disabled={saving || !draft.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                    <Send className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save note'}
                  </button>
                </div>
              </form>
            ) : <p className="text-sm text-gray-500">This opportunity has no contact in GHL, so notes can't be added.</p>}
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

            <div className="mt-3 space-y-2">
              {notes === null ? <div className="h-12 animate-pulse rounded-lg bg-gray-100" />
                : notes.length === 0 ? <p className="text-xs text-gray-400">No notes yet.</p>
                : notes.map((n) => (
                  <div key={n.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <p className="text-[11px] text-gray-500 mb-1">{n.dateAdded && format(new Date(n.dateAdded), 'd MMM yyyy, h:mm a')}</p>
                    <p className="text-sm text-gray-800 whitespace-pre-line">{n.body}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-between">
          {contactId && locationId ? (
            <a href={`${GHL_APP}/v2/location/${locationId}/contacts/detail/${contactId}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
              <ExternalLink className="h-3.5 w-3.5" />Open in GHL
            </a>
          ) : <span />}
          <button onClick={onClose} className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 hover:text-gray-900">Close</button>
        </div>
      </div>
    </div>
  );
}
