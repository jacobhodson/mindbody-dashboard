import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { UserPlus, EyeOff } from 'lucide-react';
import { ghlApi } from '../../utils/useAcquisition.js';

/**
 * New Mindbody accounts (3 session passes, open week passes, …) with no
 * matching GHL contact by email or phone. "Add to pipeline" creates the
 * contact + an opportunity in the Leads pipeline's first stage, counted as
 * an organic lead. "Skip" hides one that isn't a real lead (staff, a
 * returning member under a new account, a test).
 */
export default function MindbodyLeadQueue({ connected, onAdded }) {
  const [data, setData]   = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy]   = useState({});

  const load = useCallback(async () => {
    try { setData(await ghlApi('ghl-lead', { query: { view: 'mb-queue' } })); setError(null); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => {
    setBusy((b) => ({ ...b, [id]: action }));
    setError(null);
    try {
      await ghlApi('ghl-lead', { body: { action, mbClientId: id } });
      setData((d) => ({ ...d, clients: d.clients.filter((c) => c.id !== id) }));
      if (action === 'add-mindbody') onAdded?.();
    } catch (e) { setError(e.message); }
    setBusy((b) => { const { [id]: _, ...rest } = b; return rest; });
  };

  const clients = data?.clients || [];
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-base font-semibold text-gray-900">New Mindbody accounts not in GHL</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Signed up in Mindbody in the last {data?.lookbackDays ?? 60} days with no GHL contact by email or phone. Add them to count as organic leads.
          {data?.unchecked > 0 && ` ${data.unchecked} still to be checked against GHL on the next sync.`}
        </p>
      </div>
      {error && <p className="px-4 pt-3 text-xs text-red-600">{error}</p>}
      {!data ? (
        <div className="p-4"><div className="h-16 animate-pulse rounded-lg bg-gray-100" /></div>
      ) : clients.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-400">
          {connected ? 'Every new Mindbody account is already in GHL.' : 'Shows up once GHL is connected and the first sync has run.'}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {clients.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{c.name || `Client #${c.id}`}</p>
                <p className="text-xs text-gray-500">
                  Joined {c.created ? format(new Date(`${c.created}T00:00:00`), 'd MMM') : '–'}
                  {c.firstPurchase?.items?.length > 0 && <> · bought <span className="font-medium text-gray-700">{c.firstPurchase.items.join(', ')}</span></>}
                  {c.email && <> · {c.email}</>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => act(c.id, 'dismiss')} disabled={!!busy[c.id]}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50">
                  <EyeOff className="h-3.5 w-3.5" />Skip
                </button>
                <button onClick={() => act(c.id, 'add-mindbody')} disabled={!!busy[c.id] || !connected}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                  <UserPlus className="h-3.5 w-3.5" />{busy[c.id] === 'add-mindbody' ? 'Adding…' : 'Add to pipeline'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
