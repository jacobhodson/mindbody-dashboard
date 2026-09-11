import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabaseClient.js';
import { periodStartFor, periodEndFor } from './periods.js';

function slugify(label) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Loads the `targets` table (readable by all staff, writable only by
 * managers per existing RLS — no schema change needed here). Shows
 * recurring targets (effective_to null) and once-off ones that haven't
 * expired yet (effective_to >= today) — a plain `.is('effective_to', null)`
 * filter would hide once-off targets even while they're still current.
 * Each target carries its owners (target_owners) as `target_owners: [{staff_id}]`
 * via a nested select — used to gate the "Update metric" control to
 * managers + a target's named owners.
 *
 * Two APIs live here:
 *   - createTarget/updateTarget/archiveTarget: low-level, single-row,
 *     any cadence — what TargetsPanel.jsx's simple ad-hoc goal list uses.
 *   - saveMetricTargets/archiveMetric: metric-level — creates/updates the
 *     weekly *and/or* monthly `targets` rows for one metric together,
 *     sharing one `metric_key` so their progress rolls up from the same
 *     metric_actuals ledger (useScorecard.js's/useWinTheWeek.js's actualFor
 *     already sums within whatever period a row's cadence implies — no
 *     separate rollup step needed, weekly and monthly just read the same
 *     daily rows over different windows). Used by Scoreboard.jsx/
 *     WinTheWeek.jsx's MetricTargetForm.
 */
export function useTargets(staff) {
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    if (!staff) return;
    setLoading(true);
    setError(null);
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data, error: err } = await supabase
      .from('targets').select('*, target_owners(staff_id)')
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .order('cadence');
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
    return updateTarget(id, { effective_to: format(new Date(), 'yyyy-MM-dd') })
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

  // `existingMetricKey` — pass when adding/editing a cadence for a metric
  // that already has at least one row, so the new row reuses that key
  // instead of slugifying a fresh (disconnected) one from the label.
  // `recurring` false pins effective_from/to to just the current
  // week/month per cadence (via periods.js) instead of leaving
  // effective_to null — a once-off target that naturally stops being
  // "current" once that period passes, per useTargets' load-query widening
  // above (it still shows while active, just not after).
  const saveMetricTargets = useCallback(async ({
    existingMetricKey, label, department, owners = [], recurring, weeklyValue, monthlyValue,
  }) => {
    const metricKey = existingMetricKey || slugify(label);
    const now = new Date();
    const cadencePlans = [
      weeklyValue  !== '' && weeklyValue  != null ? { cadence: 'weekly',  target_value: Number(weeklyValue) }  : null,
      monthlyValue !== '' && monthlyValue != null ? { cadence: 'monthly', target_value: Number(monthlyValue) } : null,
    ].filter(Boolean);

    const existingRows = targets.filter((t) => t.metric_key === metricKey);
    const savedRows = [];

    for (const { cadence, target_value } of cadencePlans) {
      const existingRow = existingRows.find((t) => t.cadence === cadence);
      const window = recurring
        ? { effective_from: existingRow?.effective_from || format(now, 'yyyy-MM-dd'), effective_to: null }
        : (() => {
            const start = periodStartFor(cadence, now);
            return { effective_from: start, effective_to: periodEndFor(cadence, start) };
          })();

      const saved = existingRow
        ? await updateTarget(existingRow.id, { label, target_value, department: department || null, ...window })
        : await createTarget({ metric_key: metricKey, label, cadence, scope: 'team', target_value, department: department || null, ...window });
      if (saved) savedRows.push(saved);
    }

    // Sync owners on every row for this metric to the chosen set.
    for (const row of savedRows) {
      const current = (row.target_owners || []).map((o) => o.staff_id);
      for (const id of owners) if (!current.includes(id)) await addOwner(row.id, id);
      for (const id of current) if (!owners.includes(id)) await removeOwner(row.id, id);
    }

    return savedRows;
  }, [targets, createTarget, updateTarget, addOwner, removeOwner]);

  const archiveMetric = useCallback(async (metricKey) => {
    const rows = targets.filter((t) => t.metric_key === metricKey);
    for (const row of rows) await archiveTarget(row.id);
  }, [targets, archiveTarget]);

  return {
    targets, loading, error,
    createTarget, updateTarget, archiveTarget, addOwner, removeOwner,
    saveMetricTargets, archiveMetric,
    reload: load,
  };
}

/**
 * Groups a flat `targets` array (as loaded by useTargets) into one entry
 * per metric_key, combining its weekly and/or monthly row into a single
 * card's worth of data — shared by WinTheWeek.jsx and Scoreboard.jsx, which
 * each just filter `targets` by department first (WinTheWeek: has one;
 * Scoreboard: has none) and pass the result in here.
 */
export function groupTargetsByMetric(targets) {
  const groups = {};
  for (const t of targets) {
    if (!groups[t.metric_key]) {
      groups[t.metric_key] = {
        metricKey: t.metric_key,
        label: t.label,
        department: t.department,
        weeklyTarget: null,
        monthlyTarget: null,
        owners: (t.target_owners || []).map((o) => o.staff_id),
      };
    }
    if (t.cadence === 'weekly') groups[t.metric_key].weeklyTarget = t;
    if (t.cadence === 'monthly') groups[t.metric_key].monthlyTarget = t;
  }
  return Object.values(groups);
}
