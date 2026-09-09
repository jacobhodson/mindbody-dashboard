import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Loads the full client roster (mirrors useAllStaff.js exactly) — used by
 * ClientsList and by the client-picker datalists in TaskChecklist.jsx
 * (ContactLogForm/TaskForm).
 *
 * Also exposes row-level writes for ClientsList's inline manager editing
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

  const applyUpdate = useCallback(async (clientId, patch) => {
    const { data, error } = await supabase
      .from('clients').update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', clientId).select().single();
    if (error) return null;
    patchClient(clientId, data);
    return data;
  }, [patchClient]);

  // { staffId } for a specific staff member, { group: true } for "Group
  // Program", or {} for unassigned — same shape as useClientDetail.js.
  const updateCaseload = useCallback((clientId, { staffId, group } = {}) =>
    applyUpdate(clientId, { assigned_staff_id: group ? null : (staffId || null), assigned_group: !!group }),
  [applyUpdate]);

  const updatePackage = useCallback((clientId, packageId) =>
    applyUpdate(clientId, { package_id: packageId || null }),
  [applyUpdate]);

  const updateDueDate = useCallback((clientId, dateStr) =>
    applyUpdate(clientId, { next_program_due: dateStr || null }),
  [applyUpdate]);

  // null clears the override, falling back to the Mindbody-synced `status`.
  const updateStatusOverride = useCallback((clientId, value) =>
    applyUpdate(clientId, { status_override: value || null }),
  [applyUpdate]);

  return { clientsList, loading, updateCaseload, updatePackage, updateDueDate, updateStatusOverride };
}
