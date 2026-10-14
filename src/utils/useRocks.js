import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * All rocks (quarterly projects). RLS: everyone reads, managers create/
 * delete, managers or the rock's owner update — the UI mirrors that via
 * canEditRock() so nobody sees controls that would just be rejected.
 */
export function useRocks() {
  const [rocks, setRocks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('rocks').select('*')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at');
    if (err) setError(err.message);
    else { setRocks(data || []); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createRock = useCallback(async (fields) => {
    const { data, error: err } = await supabase.from('rocks').insert(fields).select().single();
    if (err) { setError(err.message); return null; }
    setRocks((prev) => [...prev, data]);
    return data;
  }, []);

  const updateRock = useCallback(async (id, patch) => {
    const { data, error: err } = await supabase.from('rocks').update(patch).eq('id', id).select().single();
    if (err) { setError(err.message); return null; }
    setRocks((prev) => prev.map((r) => (r.id === id ? data : r)));
    return data;
  }, []);

  const deleteRock = useCallback(async (id) => {
    const { error: err } = await supabase.from('rocks').delete().eq('id', id);
    if (err) { setError(err.message); return false; }
    setRocks((prev) => prev.filter((r) => r.id !== id));
    return true;
  }, []);

  return { rocks, loading, error, createRock, updateRock, deleteRock, reload: load };
}

export function canEditRock(rock, staff, isManager) {
  return isManager || (!!staff && rock.owner_staff_id === staff.id);
}
