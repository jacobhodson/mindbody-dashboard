import { useState, useEffect, useMemo } from 'react';
import { Users } from 'lucide-react';
import { supabase } from '../lib/supabaseClient.js';
import { summariseClientMix } from '../utils/clientMix.js';

function Tile({ label, value, sub, tone = 'text-gray-900', loading, emphasis }) {
  return (
    <div className={`rounded-lg border p-3 ${emphasis ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      {loading ? (
        <div className="mt-1.5 h-7 w-12 animate-pulse rounded bg-gray-200" />
      ) : (
        <p className={`mt-0.5 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
      )}
      {sub && !loading && <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

/**
 * Operations tab → Membership snapshot: active clients by membership type,
 * the onboarding pipeline, and the Red's List share of active clients —
 * live, from last night's contract sync plus the already-loaded Red's List
 * and onboarding data. Definitions are in src/utils/clientMix.js; the same
 * figures are snapshotted weekly into weekly_client_snapshots (Scorecard →
 * Lead Metrics).
 */
export default function ClientMixSnapshot({ clientAnalytics, onboarding, decisions, loading }) {
  const [contracts, setContracts] = useState(null);
  const [contractsError, setContractsError] = useState(null);

  useEffect(() => {
    supabase.rpc('active_member_contracts').then(({ data, error }) => {
      if (error) setContractsError(error.message);
      else setContracts(data || []);
    });
  }, []);

  const mix = useMemo(() => {
    if (!contracts) return null;
    return summariseClientMix({
      activeContracts: contracts,
      reds: clientAnalytics?.reds,
      onboarding,
      decisions,
    });
  }, [contracts, clientAnalytics, onboarding, decisions]);

  const membersLoading = !contracts && !contractsError;
  const redsLoading    = membersLoading || loading.clientAnalytics || loading.onboarding;
  const fmt = (n) => (n == null ? '–' : n.toLocaleString('en-AU'));
  const share = (n) => (mix?.active ? `${Math.round((n / mix.active) * 100)}% of active` : undefined);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-emerald-600" />
        <h2 className="font-semibold text-gray-900">Membership snapshot</h2>
      </div>
      <p className="text-xs text-gray-500 mt-0.5 mb-4">
        Clients with at least one active (not suspended or terminated) contract, as of last night's Mindbody sync.
        Each client counts once, under their highest-touch membership. Tracked weekly in Scorecard → Lead Metrics.
      </p>

      {contractsError ? (
        <p className="text-sm text-red-600">Could not load memberships: {contractsError}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Tile label="Total active" value={fmt(mix?.active)} loading={membersLoading} emphasis
            sub={mix?.other ? `incl. ${mix.other} add-on only` : undefined} />
          <Tile label="Group" value={fmt(mix?.group)} sub={share(mix?.group ?? 0)} loading={membersLoading} />
          <Tile label="Personal training" value={fmt(mix?.pt)} sub={share(mix?.pt ?? 0)} loading={membersLoading} />
          <Tile label="Online" value={fmt(mix?.online)} sub={share(mix?.online ?? 0)} loading={membersLoading} />
          <Tile label="Onboarding pipeline" value={fmt(mix?.pipeline)} loading={redsLoading}
            sub={mix ? `on a trial / intro offer${mix.newMembersOnboarding ? ` · plus ${mix.newMembersOnboarding} straight-in new members` : ''}` : undefined} />
          <Tile label="Red %" value={mix?.redPct != null ? `${mix.redPct}%` : '–'} loading={redsLoading}
            sub={mix ? `${mix.reds} of ${mix.group} group members on Red's List` : undefined} />
        </div>
      )}
    </div>
  );
}
