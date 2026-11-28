import { useState, useEffect, useCallback } from 'react';
import { format, startOfWeek } from 'date-fns';
import { supabase } from '../lib/supabaseClient.js';

/** Monday (yyyy-MM-dd) of the week containing `date`. */
export const mondayOf = (date = new Date()) => format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');

/**
 * A staff member's weekly 1-1s (table one_on_ones — one row per person per
 * Monday), newest first. A week's row is created the first time someone
 * writes a note or adds a to-do for it, not on open, so empty weeks don't
 * pile up. Managers only for now (RLS); every row carries staff_id so a
 * "staff read their own" policy can be added later without schema changes.
 */
export function useOneOnOnes(staffId) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    if (!staffId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('one_on_ones').select('*').eq('staff_id', staffId).order('week_start', { ascending: false });
    if (err) setError(err.message);
    else { setRows(data || []); setError(null); }
    setLoading(false);
  }, [staffId]);

  useEffect(() => { load(); }, [load]);

  /** Returns the row for that Monday, creating it if needed. */
  const ensureWeek = useCallback(async (weekStart) => {
    const existing = rows.find((r) => r.week_start === weekStart);
    if (existing) return existing;
    const { data, error: err } = await supabase
      .from('one_on_ones')
      .upsert({ staff_id: staffId, week_start: weekStart }, { onConflict: 'staff_id,week_start', ignoreDuplicates: false })
      .select().single();
    if (err) { setError(err.message); return null; }
    setRows((prev) => [data, ...prev.filter((r) => r.id !== data.id)].sort((a, b) => b.week_start.localeCompare(a.week_start)));
    return data;
  }, [rows, staffId]);

  const saveNotes = useCallback(async (weekStart, notes) => {
    const row = await ensureWeek(weekStart);
    if (!row) return null;
    const { data, error: err } = await supabase
      .from('one_on_ones').update({ notes: notes?.trim() || null }).eq('id', row.id).select().single();
    if (err) { setError(err.message); return null; }
    setRows((prev) => prev.map((r) => (r.id === data.id ? data : r)));
    return data;
  }, [ensureWeek]);

  const removeWeek = useCallback(async (id) => {
    const { error: err } = await supabase.from('one_on_ones').delete().eq('id', id);
    if (err) { setError(err.message); return false; }
    setRows((prev) => prev.filter((r) => r.id !== id));
    return true;
  }, []);

  return { rows, loading, error, ensureWeek, saveNotes, removeWeek, reload: load };
}
