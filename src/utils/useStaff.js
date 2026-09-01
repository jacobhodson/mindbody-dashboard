import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Fetches the signed-in user's staff row once, high in the tree (App.jsx),
 * and is passed down from there — not re-derived per component. `isManager`
 * is the one canonical check every manager-gated UI (Targets panel,
 * create-task form, and eventually the onboarding task editor) should use.
 */
export function useStaff(user) {
  const [staff, setStaff]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    if (!user) { setStaff(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('staff').select('*').eq('auth_user_id', user.id).single();
    if (err) setError(err.message);
    else setStaff(data);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const isManager = staff?.role === 'manager' || staff?.role === 'admin';

  return { staff, loading, error, isManager, reload: load };
}
