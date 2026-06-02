import { useState } from 'react';
import { X, Mail, Phone, CheckCircle, Loader2 } from 'lucide-react';

export default function ContactModal({ client, onClose, onContacted }) {
  const [note, setNote]     = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | done | error

  async function handleMark() {
    setStatus('loading');
    try {
      // Fire-and-forget — endpoint is a stub; tracking is session-only
      fetch('/api/mb-contact-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, note: note || undefined }),
      }).catch(() => {});

      setStatus('done');
      setTimeout(() => { onContacted(client.id); onClose(); }, 800);
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl p-6">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-lg font-semibold text-white mb-1">Contact client</h3>
        <p className="text-sm text-gray-400 mb-5">{client.name || 'Unknown client'}</p>

        {/* Contact action buttons */}
        <div className="flex gap-3 mb-5">
          {client.email && (
            <a
              href={`mailto:${client.email}?subject=We%20miss%20you!&body=Hi%20${encodeURIComponent(client.name?.split(' ')[0] || '')}%2C%0A%0AIt%27s%20been%20a%20while%20since%20we%27ve%20seen%20you.%20We%27d%20love%20to%20have%20you%20back!`}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2.5 text-sm font-medium text-white transition-colors"
            >
              <Mail className="h-4 w-4" />
              Email
            </a>
          )}
          {client.phone && (
            <a
              href={`tel:${client.phone}`}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2.5 text-sm font-medium text-white transition-colors"
            >
              <Phone className="h-4 w-4" />
              Call
            </a>
          )}
        </div>

        {/* Contact details */}
        <div className="rounded-lg bg-gray-800 px-4 py-3 mb-5 space-y-1.5 text-sm">
          {client.email && (
            <div className="flex items-center gap-2 text-gray-300">
              <Mail className="h-3.5 w-3.5 text-gray-500 shrink-0" />
              <span className="truncate">{client.email}</span>
            </div>
          )}
          {client.phone && (
            <div className="flex items-center gap-2 text-gray-300">
              <Phone className="h-3.5 w-3.5 text-gray-500 shrink-0" />
              <span>{client.phone}</span>
            </div>
          )}
          {!client.email && !client.phone && (
            <p className="text-gray-500">No contact details on file</p>
          )}
        </div>

        {/* Session note (not saved externally) */}
        <label className="block text-xs text-gray-400 mb-1.5">
          Note <span className="text-gray-600">(session only)</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="e.g. Left voicemail, sending promo email…"
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-emerald-500 focus:outline-none resize-none mb-4"
        />

        <button
          onClick={handleMark}
          disabled={status === 'loading' || status === 'done'}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-60 px-4 py-2.5 text-sm font-medium text-white transition-colors"
        >
          {status === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
          {status === 'done'    && <CheckCircle className="h-4 w-4 text-emerald-400" />}
          {status === 'done' ? 'Marked as contacted!' : 'Mark as contacted'}
        </button>

        {status === 'error' && (
          <p className="mt-2 text-xs text-red-400 text-center">Something went wrong — try again.</p>
        )}
      </div>
    </div>
  );
}
