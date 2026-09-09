import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Loads the `targets` table (readable by all staff, writable only by
 * managers per existing RLS from the original migration — no schema change
 * needed here). Only shows currently-active targets (effective_to is null).
 * Each target carries its owners (target_owners) as `target_owners: [{staff_id}]`
 * via a nested select — used by WinTheWeek.jsx to gate the "Update metric"
 * control to managers + a target's named owners.
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
      .from('targets').select('*, target_owners(staff_id)').is('effective_to', null).order('cadence');
    if (err) setError(err.message);
    else setTargets(data || []);
    setLoading(false);
  }, [staff]);

  useEffect(() => { load(); }, [load]);

  const createTarget = useCallback(async (row) => {
    const { data, error: err } = await supabase.from('targets').insert(row).select('*, target_owners(staff_id)').single();
    if (err) { setError(err.message); return null; }
    setTargets((prev) => [...prev, data]);
    return data;
  }, []);

  const updateTarget = useCallback(async (id, patch) => {
    const { data, error: err } = await supabase.from('targets').update(patch).eq('id', id).select('*, target_owners(staff_id)').single();
    if (err) { setError(err.message); return null; }
    setTargets((prev) => prev.map((t) => (t.id === id ? data : t)));
    return data;
  }, []);

  // Archive rather than delete, matching the existing target-lifecycle
  // convention (a target's history stays queryable by past scorecards).
  const archiveTarget = useCallback(async (id) => {
    return updateTarget(id, { effective_to: new Date().toISOString().slice(0, 10) })
      .then((data) => { if (data) setTargets((prev) => prev.filter((t) => t.id !== id)); return data; });
  }, [updateTarget]);

  const addOwner = useCallback(async (targetId, staffId) => {
    const { error: err } = await supabase.from('target_owners').insert({ target_id: targetId, staff_id: staffId });
    if (err) { setError(err.message); return false; }
    setTargets((prev) => prev.map((t) => (t.id === targetId ? { ...t, target_owners: [...t.target_owners, { staff_id: staffId }] } : t)));
    return true;
  }, []);

  const removeOwner = useCallback(async (targetId, staffId) => {
    const { error: err } = await supabase.from('target_owners').delete().eq('target_id', targetId).eq('staff_id', staffId);
    if (err) { setError(err.message); return false; }
    setTargets((prev) => prev.map((t) => (t.id === targetId ? { ...t, target_owners: t.target_owners.filter((o) => o.staff_id !== staffId) } : t)));
    return true;
  }, []);

  return { targets, loading, error, createTarget, updateTarget, archiveTarget, addOwner, removeOwner, reload: load };
}
