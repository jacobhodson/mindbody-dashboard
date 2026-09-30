import { format } from 'date-fns';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Adds `delta` to today's metric_actuals row for metricKey (creating it if
 * missing) — shared by the "Update metric" button (source='manual') and
 * task-linked auto-increments (source='task') in useTeamTasks.js. Manual
 * check-then-write, same pattern as scheduled-daily-refresh.js's
 * upsertMetrics — metric_actuals' uniqueness for staff_id-null rows is a
 * *partial* index (20260901000004_metric_actuals_uniqueness_fix.sql), which
 * PostgREST can't target as a native upsert onConflict arbiter.
 */
// Fired after every write below. Progress is logged from one component (a
// task checklist, an "Update metric" button) but shown in others (Win the
// Week / Scoreboard cards, the Scorecard), each holding its own copy of the
// rows — without this, a logged task only appeared on the targets after a
// page reload. Readers subscribe via onMetricActualsChanged().
const CHANGED_EVENT = 'metric-actuals-changed';

export function onMetricActualsChanged(callback) {
  window.addEventListener(CHANGED_EVENT, callback);
  return () => window.removeEventListener(CHANGED_EVENT, callback);
}

export async function addMetricProgress(metricKey, delta, source = 'manual') {
  if (!metricKey || !delta) return;
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: existing, error: selErr } = await supabase
    .from('metric_actuals').select('id, value')
    .eq('metric_key', metricKey).eq('metric_date', today)
    .is('staff_id', null).maybeSingle();
  if (selErr) throw new Error(selErr.message);

  if (existing) {
    // synced_at defaults to now() only on insert — bump it by hand here so
    // "last updated" reflects this write, not the row's original creation.
    const { error } = await supabase.from('metric_actuals')
      .update({ value: Number(existing.value) + delta, source, synced_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else if (delta > 0) {
    // Nothing to subtract from yet if delta is negative — skip rather than
    // create a phantom negative row.
    const { error } = await supabase.from('metric_actuals')
      .insert({ metric_key: metricKey, metric_date: today, value: delta, staff_id: null, source });
    if (error) throw new Error(error.message);
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}
