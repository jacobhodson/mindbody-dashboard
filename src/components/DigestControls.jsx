import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Mail, X, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient.js';
import { useAllStaff } from '../utils/useAllStaff.js';

async function authedFetch(url) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token || ''}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

/**
 * Footer of the notification bell: your own weekly-digest on/off switch
 * (digest_preferences, no row = on), and for managers a preview of anyone's
 * digest plus "email me this preview".
 */
export default function DigestControls({ staff, isManager }) {
  const [on, setOn] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!staff?.id) return;
    supabase.from('digest_preferences').select('weekly_digest').eq('staff_id', staff.id).maybeSingle()
      .then(({ data }) => { setOn(data ? data.weekly_digest : true); setLoaded(true); });
  }, [staff?.id]);

  const toggle = async () => {
    const next = !on;
    setOn(next);
    const { error } = await supabase.from('digest_preferences')
      .upsert({ staff_id: staff.id, weekly_digest: next, updated_at: new Date().toISOString() });
    if (error) setOn(!next);
  };

  return (
    <div className="flex items-center gap-2 border-t border-gray-100 bg-gray-50 px-4 py-2.5 text-xs text-gray-600">
      <Mail className="h-3.5 w-3.5 text-gray-400" />
      <span>Weekly email (Sun 6pm)</span>
      <button
        onClick={toggle}
        disabled={!loaded}
        role="switch"
        aria-checked={on}
        className={`relative h-4 w-7 rounded-full transition-colors ${on ? 'bg-emerald-600' : 'bg-gray-300'}`}
        title={on ? 'On — click to stop the weekly email' : 'Off — click to get the weekly email'}
      >
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
      </button>
      {isManager && (
        <button onClick={() => setPreviewOpen(true)} className="ml-auto text-emerald-700 hover:underline">Preview</button>
      )}
      {/* Portal: the header's backdrop-blur would otherwise trap a fixed modal inside it. */}
      {previewOpen && createPortal(<DigestPreview staff={staff} onClose={() => setPreviewOpen(false)} />, document.body)}
    </div>
  );
}

function DigestPreview({ staff, onClose }) {
  const { staffList } = useAllStaff();
  const [forId, setForId] = useState(staff.id);
  const [mail, setMail] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | sending | sent | error
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setStatus('loading');
    authedFetch(`/api/weekly-digest?mode=preview&for=${forId}`)
      .then((b) => { setMail(b); setStatus('ready'); })
      .catch((e) => { setMsg(e.message); setStatus('error'); });
  }, [forId]);

  const sendToMe = async () => {
    setStatus('sending');
    try {
      const b = await authedFetch(`/api/weekly-digest?mode=preview&for=${forId}&send=1`);
      setMsg(`Sent to ${b.to}`); setStatus('sent');
    } catch (e) { setMsg(e.message); setStatus('error'); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onMouseDown={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3 text-sm">
          <span className="font-semibold text-gray-900">Weekly digest preview</span>
          <select value={forId} onChange={(e) => setForId(e.target.value)} className="rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-xs">
            {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
          <button
            onClick={sendToMe}
            disabled={status === 'loading' || status === 'sending'}
            className="ml-auto flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {status === 'sending' && <Loader2 className="h-3 w-3 animate-spin" />} Email this to me
          </button>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X className="h-5 w-5" /></button>
        </div>
        {mail && <p className="border-b border-gray-100 px-4 py-2 text-xs text-gray-500">Subject: <span className="text-gray-800">{mail.subject}</span></p>}
        {(status === 'sent' || status === 'error') && (
          <p className={`px-4 py-2 text-xs ${status === 'sent' ? 'text-emerald-700' : 'text-red-600'}`}>{msg}</p>
        )}
        {status === 'loading' ? (
          <p className="p-6 text-sm text-gray-500">Building preview…</p>
        ) : mail ? (
          <iframe title="Digest preview" srcDoc={mail.html} sandbox="" className="flex-1 w-full bg-gray-100" />
        ) : null}
      </div>
    </div>
  );
}
