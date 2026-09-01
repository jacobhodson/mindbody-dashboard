import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * The active staff roster — used only by the manager-only "assign to…" task
 * picker. Everyone can technically read the `staff` table (RLS), so no role
 * gate is needed here; the calling UI decides when to show it.
 */
export function useAllStaff() {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    supabase.from('staff').select('*').eq('active', true).order('full_name')
      .then(({ data, error }) => { if (!error) setStaffList(data || []); })
      .finally(() => setLoading(false));
  }, []);

  return { staffList, loading };
}
