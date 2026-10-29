import { useState, useEffect } from 'react';
import { Database, Workflow, CheckCircle, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '../../lib/supabaseClient.js';
import XeroConnection from '../XeroConnection.jsx';
import { Panel } from './settingsUi.jsx';

/**
 * Admin (owner) only. Xero connects here; Mindbody and GoHighLevel keys are
 * still Netlify environment variables, so for now those two just show their
 * latest sync. When the dashboard serves other gyms, each gym's keys get
 * entered here (write-only — saved server-side, never shown back).
 */
export default function IntegrationsSettings() {
  const [mb, setMb]   = useState(undefined);
  const [ghl, setGhl] = useState(undefined);

  useEffect(() => {
    supabase.from('mb_sync_log').select('finished_at, started_at, ok, mode')
      .order('started_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setMb(data || null));
    supabase.from('ghl_sync_log').select('finished_at, started_at, ok')
      .order('started_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setGhl(data || null));
  }, []);

  return (
    <div className="space-y-6">
      <Panel title="Integrations" description="Connections to the systems this dashboard reads from. Only admins can see or change these.">
        <div className="space-y-3">
          <SyncRow Icon={Database} name="Mindbody" purpose="Clients, visits, classes, sales — mirrored every few minutes" log={mb} />
          <XeroConnection isAdmin />
          <SyncRow Icon={Workflow} name="GoHighLevel" purpose="Leads pipeline, sales and cancellations" log={ghl} />
        </div>
        <p className="mt-4 text-xs text-gray-500">
          Mindbody and GoHighLevel keys are currently set on the server (Netlify environment variables), not here.
        </p>
      </Panel>
    </div>
  );
}

function SyncRow({ Icon, name, purpose, log }) {
  const when = log?.finished_at || log?.started_at;
  // Mirrors run every 5–15 minutes; over 2 hours quiet means something's stuck.
  const stale = when && Date.now() - new Date(when).getTime() > 2 * 60 * 60 * 1000;
  const healthy = log && log.ok !== false && !stale;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2.5">
        <span className="rounded-lg p-2 bg-gray-100 text-gray-500"><Icon className="h-4 w-4" /></span>
        <div>
          <p className="text-sm font-semibold text-gray-900">{name}</p>
          <p className="text-xs text-gray-500">
            {purpose}
            {log === undefined ? ' · checking…' : when ? ` · last sync ${formatDistanceToNow(new Date(when), { addSuffix: true })}` : ' · no syncs recorded'}
          </p>
        </div>
      </div>
      {log !== undefined && (healthy ? (
        <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
          <CheckCircle className="h-3.5 w-3.5" /> Connected
        </span>
      ) : (
        <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" /> {log?.ok === false ? 'Last sync failed' : 'Not syncing'}
        </span>
      ))}
    </div>
  );
}
