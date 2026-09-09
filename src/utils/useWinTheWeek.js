import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { periodStartFor, periodEndFor } from './periods.js';
import { addMetricProgress } from './metricActuals.js';

/**
 * Win the Week progress — always the current week, independent of the
 * Scorecard's daily/weekly/monthly toggle (matching the feature's inherent
 * weekly framing). Same sum-within-period logic as useScorecard.js's
 * actualFor, scoped to whichever `targets` rows have a `department` set
 * (Operations/Acquisition) — targets made via the older TargetsPanel.jsx
 * have no department and don't show here.
 */
export function useWinTheWeek(targets) {
  const [actuals, setActuals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const periodStart = periodStartFor('weekly');
  const periodEnd   = periodEndFor('weekly', periodStart);

  const wtwTargets = useMemo(() => targets.filter((t) => t.department), [targets]);
  const metricKeys = useMemo(() => [...new Set(wtwTargets.map((t) => t.metric_key))], [wtwTargets]);
  const metricKeysKey = metricKeys.join(',');

  const load = useCallback(async () => {
    if (!metricKeys.length) { setActuals([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('metric_actuals').select('*')
      .in('metric_key', metricKeys)
      .gte('metric_date', periodStart).lte('metric_date', periodEnd);
    if (err) setError(err.message);
    else setActuals(data || []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricKeysKey, periodStart, periodEnd]);

  useEffect(() => { load(); }, [load]);

  const actualFor = useCallback((target) => {
    const rows = actuals.filter((a) => a.metric_key === target.metric_key);
    return rows.reduce((sum, r) => sum + Number(r.value), 0);
  }, [actuals]);

  const lastUpdatedFor = useCallback((target) => {
    const rows = actuals.filter((a) => a.metric_key === target.metric_key);
    if (!rows.length) return null;
    return rows.reduce((latest, r) => (!latest || r.synced_at > latest ? r.synced_at : latest), null);
  }, [actuals]);

  const logProgress = useCallback(async (metricKey, delta) => {
    await addMetricProgress(metricKey, delta, 'manual');
    await load();
  }, [load]);

  return { wtwTargets, actualFor, lastUpdatedFor, loading, error, logProgress, reload: load };
}
