import { useState, useEffect } from 'react';
import { Link2, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Admin-only (Settings → Integrations) connection status + "Connect Xero"
 * entry point. The actual authorization has to happen in a real browser tab
 * where the owner logs into Xero and approves access — this component asks
 * /api/xero-oauth-start (admin-checked) for Xero's consent URL and sends the
 * browser there, and reports whether a connection exists via /api/xero-status.
 */
export default function XeroConnection({ isAdmin }) {
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectError, setConnectError] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/xero-status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAdmin]);

  const connect = async () => {
    setConnectError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/xero-oauth-start', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` } });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.url) window.location.href = body.url;
    else setConnectError(body.error || `HTTP ${res.status}`);
  };

  if (!isAdmin) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2.5">
        <span className="rounded-lg p-2 bg-gray-100 text-gray-500">
          <Link2 className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-gray-900">Xero</p>
          {loading ? (
            <p className="text-xs text-gray-400">Checking connection…</p>
          ) : status?.connected ? (
            <p className="text-xs text-gray-500">
              Connected to <strong className="text-gray-700">{status.tenantName}</strong>
              {status.connectedAt && ` · since ${formatDistanceToNow(new Date(status.connectedAt), { addSuffix: true })}`}
            </p>
          ) : (
            <p className="text-xs text-gray-500">Not connected yet — needed for payroll wage data (LER)</p>
          )}
          {connectError && <p className="text-xs text-red-600">{connectError}</p>}
        </div>
      </div>

      {!loading && (
        status?.connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
              <CheckCircle className="h-3.5 w-3.5" /> Connected
            </span>
            <button onClick={connect} className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800">
              Reconnect
            </button>
          </div>
        ) : (
          <button
            onClick={connect}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
          >
            Connect Xero
          </button>
        )
      )}
    </div>
  );
}
