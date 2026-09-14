import { useState, useEffect, useCallback, useMemo } from 'react';
import { startOfDay } from 'date-fns';
import { supabase } from '../lib/supabaseClient.js';
import { simplifiedStatus } from './clientStatus.js';
import { isStarter } from './starters.js';

/**
 * useUnallocatedClients — powers the Home "New Clients to Allocate" panel.
 *
 * A new Mindbody client already lands in `clients` automatically (the daily
 * scheduled-client-sync.js roster sync upserts on mindbody_id, ActiveOnly:
 * false), with assigned_staff_id/assigned_group left untouched (never in
 * the sync payload — same protection as status_override/package_id). This
 * hook is a live query over that same table for "Active, created in the
 * last 30 days (isStarter — same boundary ClientsList's 'No package' badge
 * uses), still unassigned" — no separate tracking table, so a client drops
 * off the list the instant anyone allocates them, and any pre-existing
 * backlog from before this feature shipped shows up immediately too rather
 * than needing a one-off backfill.
 *
 * Deliberately NOT scoped to "all unassigned active clients" — most of the
 * roster predates caseload tracking and was never assigned; that's not
 * "new clients needing action", it's historical data with no useful signal
 * here (confirmed live: ~234 active clients have no caseload today; ~13 of
 * those are actual starters).
 */
export function useUnallocatedClients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => startOfDay(new Date()), []);

  const load = useCallback(() => {
    setLoading(true);
    return supabase
      .from('clients')
      .select('*')
      .is('assigned_staff_id', null)
      .eq('assigned_group', false) // not-null boolean, default false — see 20260909000000
      .order('creation_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) { setLoading(false); return; }
        const filtered = (data || []).filter((c) => isStarter(c, today) && simplifiedStatus(c) === 'Active');
        setClients(filtered);
        setLoading(false);
      });
  }, [today]);

  useEffect(() => { load(); }, [load]);

  // { staffId } for a specific staff member, { group: true } for "Group
  // Program" — same payload shape as useAllClients.js/useClientDetail.js's
  // updateCaseload, but via the assign_client_caseload() RPC so any
  // signed-in staff can call it, not just managers (see its migration for
  // why this needs a security-definer function rather than a looser RLS
  // policy). Removes the client from the local list optimistically —
  // that's the only feedback this panel needs, no need to refetch.
  const allocate = useCallback(async (clientId, { staffId, group } = {}) => {
    const { error } = await supabase.rpc('assign_client_caseload', {
      p_client_id: clientId,
      p_staff_id:  group ? null : (staffId || null),
      p_group:     !!group,
    });
    if (error) return false;
    setClients((prev) => prev.filter((c) => c.id !== clientId));
    return true;
  }, []);

  return { clients, loading, allocate };
}
