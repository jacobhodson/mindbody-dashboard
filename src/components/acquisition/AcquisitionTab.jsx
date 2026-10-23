import { useState, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { RefreshCw, UserPlus, PlugZap, AlertTriangle } from 'lucide-react';
import { useAcquisition } from '../../utils/useAcquisition.js';
import { useAllClients } from '../../utils/useAllClients.js';
import LeadCounts from './LeadCounts.jsx';
import LeadBoard from './LeadBoard.jsx';
import LeadModal from './LeadModal.jsx';
import MindbodyLeadQueue from './MindbodyLeadQueue.jsx';
import ReferralForm from './ReferralForm.jsx';

/**
 * Acquisition (Business group): the GHL "📈 Leads Pipeline" mirrored from
 * GoHighLevel — lead counts split Meta / Organic / Referral, the pipeline
 * board (cards open to GHL notes), new Mindbody accounts missing from GHL,
 * and adding referrals.
 */
export default function AcquisitionTab() {
  const acq = useAcquisition();
  const { clientsList } = useAllClients();
  const [openLead, setOpenLead]     = useState(null);
  const [showReferral, setReferral] = useState(false);
  const [syncError, setSyncError]   = useState(null);
  const [queueKey, setQueueKey]     = useState(0);

  const memberNames = useMemo(() => clientsList
    .map((c) => ({ id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(' ') }))
    .filter((c) => c.name), [clientsList]);

  const sync = async () => {
    setSyncError(null);
    try { await acq.syncNow(); setQueueKey((k) => k + 1); }
    catch (e) { setSyncError(e.message); }
  };

  const connected = !!acq.pipeline;
  const failedSync = acq.lastSync && acq.lastSync.ok === false;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Acquisition</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {acq.lastSync?.finished_at
              ? `GHL synced ${formatDistanceToNow(new Date(acq.lastSync.finished_at))} ago · updates every 15 min`
              : 'Not synced with GHL yet'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setReferral(true)} disabled={!connected}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            <UserPlus className="h-3.5 w-3.5" />Add referral
          </button>
          <button onClick={sync} disabled={acq.syncing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${acq.syncing ? 'animate-spin' : ''}`} />Sync now
          </button>
        </div>
      </div>

      {(syncError || failedSync || acq.error) && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{syncError || acq.error || `Last GHL sync failed: ${acq.lastSync.detail?.error || 'unknown error'}`}</span>
        </div>
      )}

      {!acq.loading && !connected ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <PlugZap className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-3 text-sm font-medium text-gray-800">GHL isn't connected yet</p>
          <p className="mt-1 text-xs text-gray-500 max-w-md mx-auto">
            Once GHL_TOKEN and GHL_LOCATION_ID are set in Netlify, press Sync now and the Leads Pipeline appears here.
          </p>
        </div>
      ) : (
        <>
          <LeadCounts leads={acq.leads} loading={acq.loading} />
          {connected && <LeadBoard pipeline={acq.pipeline} leads={acq.leads} onOpen={setOpenLead} />}
        </>
      )}

      <MindbodyLeadQueue key={queueKey} connected={connected} onAdded={acq.reload} />

      {openLead && <LeadModal lead={openLead} locationId={acq.pipeline?.location_id} onClose={() => setOpenLead(null)} />}
      {showReferral && <ReferralForm clients={memberNames} onClose={() => setReferral(false)} onAdded={acq.reload} />}
    </div>
  );
}
