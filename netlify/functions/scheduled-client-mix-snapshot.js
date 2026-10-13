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
 */
import { createClient } from '@supabase/supabase-js';
import { startOfWeek, parseISO, subDays, format } from 'date-fns';
import { handler as analyticsHandler } from './mb-client-analytics.js';
import { handler as onboardingHandler } from './mb-onboarding.js';
import { summariseClientMix } from '../../src/utils/clientMix.js';

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

    console.log('[scheduled-client-mix-snapshot]', JSON.stringify(row));
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...row }) };
  } catch (e) {
    console.error('[scheduled-client-mix-snapshot] Failed:', e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
