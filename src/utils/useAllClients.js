import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Loads the full client roster (mirrors useAllStaff.js exactly) — used by
 * ClientsList and by the client-picker datalists in TaskChecklist.jsx
 * (ContactLogForm/TaskForm).
 *
 * Also exposes row-level writes for ClientsList's inline editing (any staff)
 * (caseload/package/next-programme-due/status override) — same fields and
 * payload shapes as useClientDetail.js's single-client versions, just
 * parameterized by clientId and patching the list in place instead of a
 * single loaded client, so the table stays responsive without a refetch.
 */
export function useAllClients() {
  const [clientsList, setClientsList] = useState([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    supabase.from('clients').select('*').order('last_name')
      .then(({ data, error }) => { if (!error) setClientsList(data || []); })
      .finally(() => setLoading(false));
  }, []);

  const patchClient = useCallback((clientId, patch) => {
    setClientsList((prev) => prev.map((c) => (c.id === clientId ? { ...c, ...patch } : c)));
  }, []);

  // Package/next-programme-due/status override each go through a one-column
  // SECURITY DEFINER RPC (see 20260930000020_coach_client_field_rpcs.sql) so
  // coaches can edit them too, not just managers — same reasoning as
  // assign_client_caseload() below.
  const callFieldRpc = useCallback(async (clientId, fn, args, patch) => {
    const { error } = await supabase.rpc(fn, { p_client_id: clientId, ...args });
    if (error) return null;
    patchClient(clientId, patch);
    return patch;
  }, [patchClient]);

  // { staffId } for a specific staff member, { group: true } for "Group
  // Program", or {} for unassigned — same shape as useClientDetail.js. Goes
  // through the assign_client_caseload() RPC rather than a direct table
  // update — it's the one field-group any signed-in staff can write (not
  // just managers, see that migration), so useUnallocatedClients.js's Home
  // panel can share this exact write path instead of a second one.
  const updateCaseload = useCallback(async (clientId, { staffId, group } = {}) => {
    const patch = { assigned_staff_id: group ? null : (staffId || null), assigned_group: !!group };
    const { error } = await supabase.rpc('assign_client_caseload', {
      p_client_id: clientId,
      p_staff_id:  patch.assigned_staff_id,
      p_group:     patch.assigned_group,
    });
    if (error) return null;
    patchClient(clientId, patch);
    return patch;
  }, [patchClient]);

  const updatePackage = useCallback((clientId, packageId) =>
    callFieldRpc(clientId, 'set_client_package', { p_package_id: packageId || null }, { package_id: packageId || null }),
  [callFieldRpc]);

  const updateDueDate = useCallback((clientId, dateStr) =>
    callFieldRpc(clientId, 'set_client_next_program_due', { p_due: dateStr || null }, { next_program_due: dateStr || null }),
  [callFieldRpc]);

  // null clears the override, falling back to the Mindbody-synced `status`.
  const updateStatusOverride = useCallback((clientId, value) =>
    callFieldRpc(clientId, 'set_client_status_override', { p_status: value || null }, { status_override: value || null }),
  [callFieldRpc]);

  return { clientsList, loading, updateCaseload, updatePackage, updateDueDate, updateStatusOverride };
}
