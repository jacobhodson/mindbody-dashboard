import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * The active staff roster — used by the manager-only "assign to…" task
 * picker, and by LERTable.jsx (whose `reload` re-reads a staff row's
 * xero_employee_id right after CoachSettingsRow saves a mapping change).
 * Everyone can technically read the `staff` table (RLS), so no role gate
 * is needed here; the calling UI decides when to show it.
 */
export function useAllStaff() {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading]     = useState(true);

  const load = useCallback(() => {
    return supabase.from('staff').select('*').eq('active', true).order('full_name')
      .then(({ data, error }) => { if (!error) setStaffList(data || []); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return { staffList, loading, reload: load };
}
