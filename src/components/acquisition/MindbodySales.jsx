import { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { ShoppingBag, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient.js';
import { addMindbodySale, removeMindbodySale } from '../../utils/mindbodySales.js';

const SALES_FROM = '2026-10-26'; // METRIC_FROM.sales in netlify/functions/utils/metric-sync.js
const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
const label = (c) => `${[c.first_name, c.last_name].filter(Boolean).join(' ')} (#${c.mindbody_id})`;

/**
 * Sales made directly through Mindbody, each one a Scoreboard Sale on its
 * date. Most arrive from the "Count as sale" tick on the Home allocation
 * panels; this is for anyone already allocated, and for taking a wrong one
 * back off. Someone who also has a won GHL deal is counted once, from GHL
 * (matched by syncSales(): GHL link, email or phone).
 */
export default function MindbodySales({ clients, staff, isManager }) {
  const [rows, setRows]       = useState(null);
  const [picked, setPicked]   = useState('');
  const [date, setDate]       = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('mindbody_sales')
      .select('id, mb_client_id, name, sale_date, created_by, reconciled_opportunity_id')
      .order('sale_date', { ascending: false }).order('created_at', { ascending: false });
    setRows(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const options = useMemo(() => clients.filter((c) => c.mindbody_id && (c.first_name || c.last_name)), [clients]);
  const client = options.find((c) => label(c) === picked);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); return true; }
    catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  };

  const add = async (e) => {
    e.preventDefault();
    if (client && await run(() => addMindbodySale(client.mindbody_id, date))) setPicked('');
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-gray-500" />
        <h2 className="font-semibold text-gray-900">Mindbody sales</h2>
        {rows?.length > 0 && <span className="text-xs text-gray-500">{rows.length} added</span>}
      </div>
      <p className="mb-4 text-xs text-gray-500">
        Sales made directly through Mindbody. Each adds to Sales on the Scoreboard on its date, on top of GHL deals marked won.
      </p>

      <form onSubmit={add} className="mb-4 flex flex-wrap items-center gap-2">
        <input
          list="mindbody-sale-clients" value={picked} onChange={(e) => setPicked(e.target.value)}
          placeholder="Client name…" aria-label="Client"
          className="min-w-52 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <datalist id="mindbody-sale-clients">
          {options.map((c) => <option key={c.id} value={label(c)} />)}
        </datalist>
        <input
          type="date" value={date} min={SALES_FROM} max={format(new Date(), 'yyyy-MM-dd')} required
          onChange={(e) => setDate(e.target.value)} aria-label="Sale date"
          className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button type="submit" disabled={!client || busy}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          Add sale
        </button>
      </form>
      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      {rows === null ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No Mindbody sales added yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="mr-3 whitespace-nowrap text-gray-600">{fmt(r.sale_date)}</span>
                <span className="text-gray-900">{r.name || `Client #${r.mb_client_id}`}</span>
                {r.reconciled_opportunity_id && <span className="ml-1.5 text-[10px] text-gray-400">also won in GHL, counted once</span>}
              </div>
              {(isManager || r.created_by === staff?.id) && (
                <button
                  onClick={() => { if (window.confirm(`Take ${r.name || 'this sale'} off Sales?`)) run(() => removeMindbodySale(r.id)); }}
                  disabled={busy} aria-label={`Remove sale for ${r.name || r.mb_client_id}`}
                  className="shrink-0 text-gray-400 hover:text-red-600 disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
