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
}
