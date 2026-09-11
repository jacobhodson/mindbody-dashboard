import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { periodStartFor, periodEndFor } from './periods.js';
import { addMetricProgress } from './metricActuals.js';

/**
 * Computes progress for a set of `targets` rows against EACH row's own
 * cadence's current period (this week for a weekly row, this month for a
 * monthly row) — shared by WinTheWeek.jsx and Scoreboard.jsx. Two rows
 * sharing one metric_key (a metric's weekly + monthly pair, see
 * useTargets.js's saveMetricTargets) each read the same underlying daily
 * metric_actuals rows, just summed over different windows — that's the
 * whole "weekly total rolls into the monthly one" mechanism, no separate
 * rollup step needed.
 */
export function useMetricProgress(rows) {
  const [actuals, setActuals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const cadences = [...new Set(rows.map((t) => t.cadence))];
  const ranges = cadences.map((cadence) => {
    const start = periodStartFor(cadence);
    return { cadence, start, end: periodEndFor(cadence, start) };
  });
  const metricKeys    = [...new Set(rows.map((t) => t.metric_key))];
  const metricKeysKey = metricKeys.join(',');
  const earliestStart = ranges.length ? ranges.reduce((min, r) => (r.start < min ? r.start : min), ranges[0].start) : null;
  const latestEnd      = ranges.length ? ranges.reduce((max, r) => (r.end > max ? r.end : max), ranges[0].end) : null;

  const load = useCallback(async () => {
    if (!metricKeys.length) { setActuals([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('metric_actuals').select('*')
      .in('metric_key', metricKeys)
      .gte('metric_date', earliestStart).lte('metric_date', latestEnd);
    if (err) setError(err.message);
    else setActuals(data || []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricKeysKey, earliestStart, latestEnd]);

  useEffect(() => { load(); }, [load]);

  const rangeFor = (cadence) => ranges.find((r) => r.cadence === cadence);

  const actualFor = useCallback((target) => {
    const range = rangeFor(target.cadence);
    if (!range) return 0;
    return actuals
      .filter((a) => a.metric_key === target.metric_key && a.metric_date >= range.start && a.metric_date <= range.end)
      .reduce((sum, r) => sum + Number(r.value), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actuals, ranges.map((r) => `${r.cadence}:${r.start}:${r.end}`).join(',')]);

  const lastUpdatedFor = useCallback((target) => {
    const range = rangeFor(target.cadence);
    if (!range) return null;
    const matching = actuals.filter((a) => a.metric_key === target.metric_key && a.metric_date >= range.start && a.metric_date <= range.end);
    if (!matching.length) return null;
    return matching.reduce((latest, r) => (!latest || r.synced_at > latest ? r.synced_at : latest), null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actuals, ranges.map((r) => `${r.cadence}:${r.start}:${r.end}`).join(',')]);

  const logProgress = useCallback(async (metricKey, delta) => {
    await addMetricProgress(metricKey, delta, 'manual');
    await load();
  }, [load]);

  return { actualFor, lastUpdatedFor, logProgress, loading, error, reload: load };
}
