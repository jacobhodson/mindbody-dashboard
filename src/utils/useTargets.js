import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Loads the `targets` table (readable by all staff, writable only by
 * managers per existing RLS from the original migration — no schema change
 * needed here). Only shows currently-active targets (effective_to is null).
 */
export function useTargets(staff) {
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    if (!staff) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('targets').select('*').is('effective_to', null).order('cadence');
    if (err) setError(err.message);
    else setTargets(data || []);
    setLoading(false);
  }, [staff]);

  useEffect(() => { load(); }, [load]);

  const createTarget = useCallback(async (row) => {
    const { data, error: err } = await supabase.from('targets').insert(row).select().single();
    if (err) { setError(err.message); return null; }
    setTargets((prev) => [...prev, data]);
    return data;
  }, []);

  const updateTarget = useCallback(async (id, patch) => {
    const { data, error: err } = await supabase.from('targets').update(patch).eq('id', id).select().single();
    if (err) { setError(err.message); return null; }
    setTargets((prev) => prev.map((t) => (t.id === id ? data : t)));
    return data;
  }, []);

  return { targets, loading, error, createTarget, updateTarget, reload: load };
}
