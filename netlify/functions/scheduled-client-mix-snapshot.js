/**
 * Weekly client-mix snapshot -> weekly_client_snapshots (one row per Mon–Sun
 * week): Group / PT / Online / Total active clients, the onboarding
 * pipeline, and the Red's List share of active clients — Scorecard's Lead
 * Metrics. Definitions live in src/utils/clientMix.js, shared with the
 * Operations tab's live snapshot.
 *
 * Runs nightly (pg_cron, 2:35am Sydney — see
 * 20261013010000_client_mix_snapshots.sql) and re-upserts the week that
 * contains YESTERDAY (Sydney), so Monday's run writes the previous week's
 * final, Sunday-night figures and then moves on — no separate weekly job,
 * and a missed night just means the row holds the night before's figures.
 *
 * Red's List and the onboarding pipeline come from the same handlers the
 * dashboard calls (mb-client-analytics / mb-onboarding, both reading the
 * Supabase mirror — no Mindbody calls), invoked in-process rather than over
 * HTTP, same reasoning as scheduled-coach-snapshot.js.
 *
 * Also writes tonight's Red's List membership to reds_daily (one row per
 * client id, snapshot_date = today Sydney) — the list as Red's List shows it
 * on load, i.e. minus onboarding clients. mb-client-analytics reads it for
 * the Fringe Clients "Back from Red" flag. The day's rows are replaced, so a
 * re-run the same day reflects the latest list.
 */
import { createClient } from '@supabase/supabase-js';
import { startOfWeek, parseISO, subDays, format } from 'date-fns';
import { handler as analyticsHandler } from './mb-client-analytics.js';
import { handler as onboardingHandler } from './mb-onboarding.js';
import { summariseClientMix, allOnboardingClients, onboardingClientIds } from '../../src/utils/clientMix.js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sydneyDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(d); // yyyy-MM-dd

async function callHandler(handler, name) {
  const res = await handler({ httpMethod: 'GET', queryStringParameters: {} });
  if (res.statusCode !== 200) throw new Error(`${name} returned ${res.statusCode}: ${res.body?.slice(0, 200)}`);
  return JSON.parse(res.body);
}

export const handler = async () => {
  try {
    const now = new Date();
    const yesterday = sydneyDate(subDays(now, 1));
    const weekStart = format(startOfWeek(parseISO(yesterday), { weekStartsOn: 1 }), 'yyyy-MM-dd');

    const [contractsRes, decisionsRes, analytics, onboarding] = await Promise.all([
      supabase.rpc('active_member_contracts'),
      supabase.from('onboarding_rollover_decisions').select('mindbody_client_id, decision'),
      callHandler(analyticsHandler, 'mb-client-analytics'),
      callHandler(onboardingHandler, 'mb-onboarding'),
    ]);
    if (contractsRes.error) throw new Error(`active_member_contracts: ${contractsRes.error.message}`);
    if (decisionsRes.error) throw new Error(`decisions: ${decisionsRes.error.message}`);

    const decisions = {};
    for (const d of decisionsRes.data || []) decisions[d.mindbody_client_id] = { decision: d.decision };

    const mix = summariseClientMix({
      activeContracts: contractsRes.data,
      reds: analytics.reds,
      onboarding,
      decisions,
    });

    const row = {
      week_start:       weekStart,
      group_clients:    mix.group,
      pt_clients:       mix.pt,
      online_clients:   mix.online,
      other_clients:    mix.other,
      active_clients:   mix.active,
      pipeline_clients: mix.pipeline,
      red_clients:      mix.reds,
      red_pct:          mix.redPct,
      captured_on:      sydneyDate(now),
      updated_at:       now.toISOString(),
    };
    const { error } = await supabase.from('weekly_client_snapshots').upsert(row, { onConflict: 'week_start' });
    if (error) throw new Error(`weekly_client_snapshots: ${error.message}`);

    // ── Red's List daily history ──────────────────────────────────────────
    const today = sydneyDate(now);
    if ((analytics.summary?.redsCount ?? 0) > (analytics.reds || []).length) {
      console.warn(`[scheduled-client-mix-snapshot] reds truncated: ${analytics.reds.length} of ${analytics.summary.redsCount}`);
    }
    const hiddenFromReds = onboardingClientIds(allOnboardingClients(onboarding), decisions);
    const redRows = [...new Map(
      (analytics.reds || [])
        .filter((c) => !hiddenFromReds.has(String(c.id)))
        .map((c) => [String(c.id), { snapshot_date: today, client_id: String(c.id), long_lapsed: Boolean(c.longLapsed) }]),
    ).values()];
    const { error: delErr } = await supabase.from('reds_daily').delete().eq('snapshot_date', today);
    if (delErr) throw new Error(`reds_daily delete: ${delErr.message}`);
    if (redRows.length) {
      const { error: redsErr } = await supabase.from('reds_daily').insert(redRows);
      if (redsErr) throw new Error(`reds_daily: ${redsErr.message}`);
    }

    console.log('[scheduled-client-mix-snapshot]', JSON.stringify(row), `reds_daily ${today}: ${redRows.length}`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...row, reds_daily: { snapshot_date: today, count: redRows.length } }) };
  } catch (e) {
    console.error('[scheduled-client-mix-snapshot] Failed:', e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
