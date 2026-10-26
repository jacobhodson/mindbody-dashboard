/**
 * Scoreboard metrics recomputed from synced data (GHL Sales/Leads, churn from
 * cancellation notices). Each is rewritten in full from its cutover day on,
 * so anything removed upstream drops off again. Manual logging for these
 * keys is blocked in the UI (src/utils/autoMetrics.js).
 */

export const sydneyDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date(iso));

// Owner's calls: the sync replaces manual logging from the Monday of the
// week each went live; earlier days keep the hand-logged numbers.
export const METRIC_FROM = {
  sales: '2026-10-26', // GHL Leads pipeline opportunities marked won, on the day won
  leads: '2026-10-26', // GHL Leads pipeline opportunities created, any status
  churn: '2026-10-26', // cancellation notices (GHL form tag, or a manager-confirmed Mindbody termination)
};

export async function selectAll(build) {
  let all = [], from = 0;
  while (true) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    all = all.concat(data);
    if (data.length < 1000) return all;
    from += 1000;
  }
}

/**
 * Writes one team-level (staff_id null) metric_actuals row per day from the
 * metric's cutover on — `days` is one YYYY-MM-DD (Sydney) per counted event —
 * zeroing days that no longer have any.
 */
export async function writeDailyMetric(supabase, metricKey, days, source) {
  const from = METRIC_FROM[metricKey];
  const counts = {};
  for (const day of days) {
    if (day && day >= from) counts[day] = (counts[day] || 0) + 1;
  }

  // Check-then-write, same as metricActuals.js — the staff_id-null
  // uniqueness is a partial index PostgREST can't upsert against.
  const existing = await selectAll(() => supabase.from('metric_actuals').select('id, metric_date, value')
    .eq('metric_key', metricKey).is('staff_id', null).gte('metric_date', from).order('metric_date'));
  const byDate = Object.fromEntries(existing.map((r) => [r.metric_date, r]));
  const now = new Date().toISOString();
  let changed = 0;
  for (const day of new Set([...Object.keys(counts), ...Object.keys(byDate)])) {
    const value = counts[day] || 0;
    const row = byDate[day];
    if (row && Number(row.value) === value) continue;
    const { error } = row
      ? await supabase.from('metric_actuals').update({ value, source, synced_at: now }).eq('id', row.id)
      : await supabase.from('metric_actuals').insert({ metric_key: metricKey, metric_date: day, value, staff_id: null, source });
    if (error) throw new Error(`metric_actuals (${metricKey}): ${error.message}`);
    changed++;
  }
  return { sinceCutover: Object.values(counts).reduce((a, b) => a + b, 0), daysChanged: changed };
}

/** Scoreboard Churn = cancellation notices that aren't repeats of an earlier one. */
export async function syncChurn(supabase) {
  const rows = await selectAll(() => supabase.from('cancellations').select('id, notice_date')
    .is('duplicate_of', null).gte('notice_date', METRIC_FROM.churn).order('id'));
  return writeDailyMetric(supabase, 'churn', rows.map((r) => r.notice_date), 'ghl');
}

/** Detects new Mindbody terminations, matches notices to clients, reconciles. */
export async function refreshChurnReview(supabase) {
  const { data, error } = await supabase.rpc('refresh_churn_review');
  if (error) throw new Error(`refresh_churn_review: ${error.message}`);
  return data;
}

// A second notice for the same person within this many days — GHL retrying,
// the tag being re-added, or a manager having already counted them from a
// Mindbody termination (which tags them in GHL, firing the webhook) — is
// stored as a duplicate and not counted.
const REPEAT_DAYS = 60;

export async function recordNotice(supabase, { noticeDate, source, ghlContactId, mbClientId, name, email, phone, reason, payload, terminationId, createdBy }) {
  const since = new Date(new Date(`${noticeDate}T00:00:00Z`).getTime() - REPEAT_DAYS * 86400_000).toISOString().slice(0, 10);
  let prior = null;
  for (const [col, val] of [['ghl_contact_id', ghlContactId], ['mb_client_id', mbClientId], ['email', email]]) {
    if (!val || prior) continue;
    const { data } = await supabase.from('cancellations').select('id')
      .eq(col, val).is('duplicate_of', null).gte('notice_date', since).order('notice_date').limit(1);
    prior = data?.[0] || null;
  }
  const { data, error } = await supabase.from('cancellations').insert({
    notice_date: noticeDate, source,
    ghl_contact_id: ghlContactId || null, mb_client_id: mbClientId || null,
    name: name || null, email: email ? email.toLowerCase() : null, phone: phone || null,
    reason: reason || null, payload: payload || null,
    termination_id: terminationId || null, duplicate_of: prior?.id || null, created_by: createdBy || null,
  }).select('id, duplicate_of').single();
  if (error) throw new Error(`cancellations insert: ${error.message}`);
  return data;
}
