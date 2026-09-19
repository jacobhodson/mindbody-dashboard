import { useState, useEffect, useCallback, useMemo } from 'react';
import { subDays, format } from 'date-fns';
import { supabase } from '../lib/supabaseClient.js';

const HISTORY_DAYS = 120;

/**
 * Reads coach_rolling30 — one row per coach per day, each holding that
 * coach's trailing-30-day revenue/sessions/wages/LER as of that date
 * (scheduled-coach-snapshot.js writes it nightly). Manager-only via RLS.
 *
 * `latest` is the most recent as_of's rows keyed by staff_id — what every
 * "Rolling 30 Days" view shows. `history` is every fetched row, for the
 * rolling-30 trend line on the Team tab (it only fills in from whenever the
 * job started running, one point per day).
 */
export function useCoachRolling30(isManager) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    return supabase
      .from('coach_rolling30')
      .select('*')
      .gte('as_of', format(subDays(new Date(), HISTORY_DAYS), 'yyyy-MM-dd'))
      .order('as_of', { ascending: true })
      .then(({ data, error }) => { if (!error) setHistory(data || []); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isManager) { setLoading(false); return; }
    load();
  }, [isManager, load]);

  const { latest, latestAsOf } = useMemo(() => {
    const asOf = history.length ? history[history.length - 1].as_of : null;
    const map = {};
    for (const r of history) if (r.as_of === asOf) map[r.staff_id] = r;
    return { latest: map, latestAsOf: asOf };
  }, [history]);

  return { latest, latestAsOf, history, loading, reload: load };
}
