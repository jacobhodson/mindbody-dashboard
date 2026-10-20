import { format } from 'date-fns';
import { supabase } from '../lib/supabaseClient.js';
import { periodStartFor } from './periods.js';

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

// `date` (yyyy-MM-dd, default today) lets the Scoreboard log into a past
// week/month — it passes that period's last day (or today, if the period is
// still in progress).
//
// A negative delta (correcting an accidental +1, unchecking a linked task)
// can't just come off `date`'s row — the entry being undone was usually
// logged on an earlier day, so today has nothing to subtract from. It's
// taken off the most recent days in [floorDate, date] instead, never
// pushing a day below zero. floorDate defaults to the start of date's week
// so a correction can't quietly eat into last week's numbers.
export async function addMetricProgress(metricKey, delta, source = 'manual', date = null, floorDate = null) {
  if (!metricKey || !delta) return;
  const today = date || format(new Date(), 'yyyy-MM-dd');

  if (delta < 0) {
    const floor = floorDate || periodStartFor('weekly', new Date(`${today}T00:00:00`));
    await subtractFromRecentDays(metricKey, -delta, floor, today, source);
    window.dispatchEvent(new Event(CHANGED_EVENT));
    return;
  }

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
  } else {
    const { error } = await supabase.from('metric_actuals')
      .insert({ metric_key: metricKey, metric_date: today, value: delta, staff_id: null, source });
    if (error) throw new Error(error.message);
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

// Takes `amount` off metricKey's daily rows in [start, end], latest day
// first, never pushing a day below zero. Returns how much was taken.
async function subtractFromRecentDays(metricKey, amount, start, end, source) {
  const { data: rows, error: selErr } = await supabase
    .from('metric_actuals').select('id, value')
    .eq('metric_key', metricKey).is('staff_id', null)
    .gte('metric_date', start).lte('metric_date', end)
    .order('metric_date', { ascending: false });
  if (selErr) throw new Error(selErr.message);

  let remaining = amount;
  for (const row of rows || []) {
    if (remaining <= 0) break;
    const take = Math.min(Number(row.value), remaining);
    if (take <= 0) continue;
    const { error } = await supabase.from('metric_actuals')
      .update({ value: Number(row.value) - take, source, synced_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) throw new Error(error.message);
    remaining -= take;
  }
  return amount - remaining;
}

/**
 * Sets a metric's total for [start, end] (yyyy-MM-dd, inclusive) to
 * `newTotal` — the Scoreboard table's manager edit. metric_actuals is a
 * daily ledger that weeks/months are summed from, so this adjusts daily
 * rows rather than storing a period total: an increase goes on the
 * period's last day (or today, if still in progress); a decrease is taken
 * off the most recent days first, never pushing a day below zero. Because
 * months are summed from the same days, editing a week also moves the
 * month it sits in (and vice versa) — which is what keeps them consistent.
 */
export async function setMetricTotal(metricKey, start, end, newTotal) {
  const target = Math.max(0, Number(newTotal) || 0);
  const { data: rows, error: selErr } = await supabase
    .from('metric_actuals').select('id, value, metric_date')
    .eq('metric_key', metricKey).is('staff_id', null)
    .gte('metric_date', start).lte('metric_date', end)
    .order('metric_date', { ascending: false });
  if (selErr) throw new Error(selErr.message);

  const current = (rows || []).reduce((sum, r) => sum + Number(r.value), 0);
  const delta = target - current;
  if (!delta) return;

  if (delta > 0) {
    const today = format(new Date(), 'yyyy-MM-dd');
    await addMetricProgress(metricKey, delta, 'manual', end < today ? end : today);
    return;
  }

  await subtractFromRecentDays(metricKey, -delta, start, end, 'manual');
  window.dispatchEvent(new Event(CHANGED_EVENT));
}
