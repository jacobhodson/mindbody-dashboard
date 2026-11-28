import { useState, useRef } from 'react';
import { Upload, ExternalLink, Download, Trash2, Loader2, FileText } from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';
import { useStaffDocuments } from '../../utils/useStaffDocuments.js';

const inputClass = 'rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';

function fmtSize(n) {
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Documents linked to one staff member — upload with a title and optional
 * expiry date, then open/download through short-lived signed URLs from the
 * private staff-documents bucket. Expired = red, within 30 days = amber.
 */
export default function StaffDocuments({ person }) {
  const api = useStaffDocuments(person.id);
  const [file, setFile]       = useState(null);
  const [title, setTitle]     = useState('');
  const [expires, setExpires] = useState('');
  const [busy, setBusy]       = useState(false);
  const fileRef = useRef(null);

  const today = format(new Date(), 'yyyy-MM-dd');
  const soon  = format(addDays(new Date(), 30), 'yyyy-MM-dd');

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    const created = await api.upload(file, { title, expires_on: expires });
    setBusy(false);
    if (created) {
      setFile(null); setTitle(''); setExpires('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Open the tab synchronously (so pop-up blockers allow it), then point it
  // at the signed URL once we have one.
  const open = async (doc, download = false) => {
    const win = download ? null : window.open('', '_blank');
    const url = await api.signedUrl(doc, { download });
    if (!url) { win?.close(); return; }
    if (win) win.location.href = url;
    else window.location.href = url;
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-gray-300 p-3">
        <label className="flex flex-col gap-1 text-[11px] font-medium text-gray-500">
          File
          <input
            ref={fileRef}
            type="file"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
              if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''));
            }}
            className="text-xs text-gray-700 file:mr-2 file:rounded-md file:border-0 file:bg-gray-100 file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-200"
          />
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[11px] font-medium text-gray-500">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. First aid certificate" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium text-gray-500">
          Expires (optional)
          <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={inputClass} />
        </label>
        <button
          type="submit"
          disabled={!file || busy}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload
        </button>
      </form>

      {api.error && <p className="text-xs text-red-600">{api.error}</p>}

      {api.loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : api.docs.length === 0 ? (
        <p className="text-xs text-gray-500">No documents for {person.full_name} yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
          {api.docs.map((d) => {
            const tone = !d.expires_on ? '' : d.expires_on < today ? 'border-red-200 bg-red-50 text-red-700'
              : d.expires_on <= soon ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-700';
            return (
              <li key={d.id} className="group flex flex-wrap items-center gap-3 px-3.5 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{d.title}</p>
                  <p className="truncate text-[11px] text-gray-500">
                    {d.file_name}{d.size_bytes ? ` · ${fmtSize(d.size_bytes)}` : ''} · added {format(parseISO(d.created_at), 'd MMM yyyy')}
                  </p>
                </div>
                <label className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone || 'border-gray-200 text-gray-500'}`}>
                  {d.expires_on ? (d.expires_on < today ? 'Expired' : 'Expires') : 'No expiry'}
                  <input
                    type="date"
                    value={d.expires_on || ''}
                    onChange={(e) => api.update(d.id, { expires_on: e.target.value || null })}
                    aria-label={`Expiry date for ${d.title}`}
                    className="w-[7.5rem] bg-transparent text-[11px] focus:outline-none"
                  />
                </label>
                <div className="flex items-center gap-1">
                  <button onClick={() => open(d)} title="Open" className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900">
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button onClick={() => open(d, true)} title="Download" className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900">
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => { if (window.confirm(`Delete "${d.title}"? The file is removed permanently.`)) api.remove(d); }}
                    title="Delete"
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
