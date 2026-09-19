import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Reads ler_monthly — the per-coach-per-calendar-month snapshot
 * scheduled-coach-snapshot.js populates daily (see that function and
 * 20260923000000_ler_monthly_snapshot_columns.sql). Manager-only via RLS.
 *
 * Loads the whole year in one query rather than one per month — cheap at
 * this scale (12 rows x a handful of coaches) — so switching months on the
 * Team tab is instant, no per-month fetch.
 *
 * A month with no row yet (before the snapshot job first ran, or a future
 * month) just isn't in `rows` — callers should treat that as "no data yet",
 * not zero.
 */
export function useCoachMonthlySnapshots(isManager, year) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    return supabase
      .from('ler_monthly')
      .select('*')
      .gte('month', `${year}-01-01`)
      .lte('month', `${year}-12-31`)
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); return; }
        setError(null);
        setRows(data || []);
      })
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(() => {
    if (!isManager) { setLoading(false); return; }
    load();
  }, [isManager, load]);

  return { rows, loading, error, reload: load };
}
