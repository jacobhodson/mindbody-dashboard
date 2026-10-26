/**
 * GoHighLevel → Supabase mirror for the Acquisition tab (2026-10-23).
 *
 * Each run:
 *   1. pipelines           – all pipelines + stages (one call)
 *   2. opportunities       – every opportunity in the Leads pipeline, any
 *                            status (full pass, so deletions in GHL drop off)
 *   3. contacts            – GET /contacts/:id for opportunity contacts not
 *                            yet mirrored, or whose opportunity changed since
 *                            (source + attribution live on the contact, not
 *                            the opportunity — that's what Meta vs organic
 *                            needs)
 *   4. Mindbody matches    – new Mindbody accounts (last MB_LOOKBACK_DAYS)
 *                            looked up in GHL by email then phone; unmatched
 *                            ones are re-checked every few hours in case they
 *                            come through a GHL form later
 *
 * Driven by pg_cron every 15 min (20261023000000_ghl_acquisition.sql) with
 * `x-sync-secret: $MB_SYNC_SECRET`, or by a signed-in staff member's
 * "Sync now" (Authorization: Bearer <Supabase token>).
 */
import { ok, err, CORS } from './utils/mb-auth.js';
import {
  ghlFetch, ghlConfigured, ghlCallCount, resetGhlCallCount, LOCATION_ID, PIPELINE_NAME,
  isLeadsPipeline, stagesOf, MB_LOOKBACK_DAYS, opportunityRow, contactRow, findContact, serviceClient, requireStaff,
} from './utils/ghl.js';

const supabase = serviceClient();

const BUDGET_MS = 20_000;
const BATCH = 8;
const CONTACT_REFRESH_HOURS = 24;
const UNMATCHED_RECHECK_HOURS = 6;

async function upsert(table, rows, onConflict = 'id') {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
  }
  return rows.length;
}

async function selectAll(build) {
  let all = [], from = 0;
  while (true) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    all = all.concat(data);
    if (data.length < 1000) return all;
    from += 1000;
  }
}

async function inBatches(items, fn, deadline) {
  let done = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    if (Date.now() > deadline) break;
    const res = await Promise.allSettled(items.slice(i, i + BATCH).map(fn));
    done += res.filter((r) => r.status === 'fulfilled').length;
    const firstFail = res.find((r) => r.status === 'rejected');
    if (firstFail) console.warn('[scheduled-ghl-sync] item failed:', firstFail.reason?.message);
  }
  return done;
}

async function syncPipelines() {
  const data = await ghlFetch('/opportunities/pipelines', { query: { locationId: LOCATION_ID } });
  const pipelines = data?.pipelines || [];
  await upsert('ghl_pipelines', pipelines.map((p) => ({
    id: p.id, name: p.name, location_id: p.locationId || LOCATION_ID, stages: stagesOf(p), synced_at: new Date().toISOString(),
  })));
  const leads = pipelines.find(isLeadsPipeline);
  if (!leads) throw new Error(`No GHL pipeline named like "${PIPELINE_NAME}" (found: ${pipelines.map((p) => p.name).join(', ')})`);
  return leads;
}

async function syncOpportunities(pipelineId, deadline) {
  const all = [];
  let page = 1, cursor = {};
  while (true) {
    if (Date.now() > deadline) return { fetched: all.length, complete: false };
    const data = await ghlFetch('/opportunities/search', {
      query: { locationId: LOCATION_ID, pipelineId, status: 'all', limit: 100, page, ...cursor },
    });
    const rows = data?.opportunities || [];
    all.push(...rows);
    const meta = data?.meta || {};
    if (rows.length < 100 || !(meta.nextPage || meta.nextPageUrl)) break;
    page = meta.nextPage || page + 1;
    cursor = meta.startAfterId ? { startAfter: meta.startAfter, startAfterId: meta.startAfterId } : {};
    if (page > 200) break; // 20k opportunities — a runaway guard, not a real limit
  }
  await upsert('ghl_opportunities', all.map((o) => opportunityRow(o, pipelineId)));

  // Full pass finished → anything we still hold for this pipeline that GHL
  // didn't return was deleted (or moved to another pipeline) there.
  const seen = new Set(all.map((o) => o.id));
  const held = await selectAll(() => supabase.from('ghl_opportunities').select('id').eq('pipeline_id', pipelineId).order('id'));
  const gone = held.map((r) => r.id).filter((id) => !seen.has(id));
  if (gone.length) await supabase.from('ghl_opportunities').delete().in('id', gone);
  return { fetched: all.length, removed: gone.length, complete: true };
}

async function syncContacts(pipelineId, deadline) {
  const [opps, contacts] = await Promise.all([
    selectAll(() => supabase.from('ghl_opportunities').select('contact_id, updated_at').eq('pipeline_id', pipelineId).not('contact_id', 'is', null).order('id')),
    selectAll(() => supabase.from('ghl_contacts').select('id, synced_at').order('id')),
  ]);
  const syncedAt = Object.fromEntries(contacts.map((c) => [c.id, new Date(c.synced_at).getTime()]));
  const stale = Date.now() - CONTACT_REFRESH_HOURS * 3600_000;
  const due = new Map();
  for (const o of opps) {
    const s = syncedAt[o.contact_id];
    const changed = o.updated_at && new Date(o.updated_at).getTime() > (s || 0);
    if (!s || s < stale || changed) due.set(o.contact_id, s || 0);
  }
  const queue = [...due.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id); // never-synced first
  const done = await inBatches(queue, async (id) => {
    const data = await ghlFetch(`/contacts/${id}`);
    if (data?.contact?.id) await upsert('ghl_contacts', [contactRow(data.contact)]);
  }, deadline);
  return { due: queue.length, synced: done };
}

async function syncMindbodyMatches(deadline) {
  const since = new Date(Date.now() - MB_LOOKBACK_DAYS * 86400_000).toISOString().slice(0, 10);
  const [clients, matches, links] = await Promise.all([
    selectAll(() => supabase.from('mb_clients_raw')
      .select('id, email:raw->>Email, mobile:raw->>MobilePhone, home:raw->>HomePhone, created:raw->>CreationDate')
      .gte('raw->>CreationDate', since).order('id')),
    selectAll(() => supabase.from('ghl_mb_matches').select('mb_client_id, ghl_contact_id, checked_at').order('mb_client_id')),
    selectAll(() => supabase.from('ghl_lead_links').select('mb_client_id').not('mb_client_id', 'is', null).order('id')),
  ]);
  const byId = Object.fromEntries(matches.map((m) => [m.mb_client_id, m]));
  const handled = new Set(links.map((l) => l.mb_client_id));
  const recheck = Date.now() - UNMATCHED_RECHECK_HOURS * 3600_000;
  const queue = clients.filter((c) => {
    if (handled.has(c.id)) return false;
    const m = byId[c.id];
    return !m || (!m.ghl_contact_id && new Date(m.checked_at).getTime() < recheck);
  });
  const done = await inBatches(queue, async (c) => {
    const hit = await findContact({ email: c.email, phone: c.mobile || c.home });
    if (hit) await upsert('ghl_contacts', [contactRow(hit.contact)]);
    await upsert('ghl_mb_matches', [{
      mb_client_id: c.id, ghl_contact_id: hit?.contact.id || null, matched_by: hit?.by || null, checked_at: new Date().toISOString(),
    }], 'mb_client_id');
  }, deadline);
  return { due: queue.length, checked: done };
}

const sydneyDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date(iso));

// Scoreboard "Sales" = Leads pipeline opportunities marked won, on the
// (Sydney) day they were won. Owner's call 2026-10-26: GHL replaces manual
// logging from SALES_FROM on (the Monday of that week); earlier days keep the
// hand-logged numbers. Recomputed in full from the mirror every run, so an
// opportunity moved back out of won (or deleted) drops off again. Manual
// logging for 'sales' is blocked in the UI (src/utils/autoMetrics.js).
const SALES_METRIC_KEY = 'sales';
const SALES_FROM = '2026-10-26';

async function syncWonSales(pipelineId) {
  const won = await selectAll(() => supabase.from('ghl_opportunities')
    .select('id, won_at:raw->>lastStatusChangeAt, updated_at')
    .eq('pipeline_id', pipelineId).eq('status', 'won').order('id'));
  const counts = {};
  for (const o of won) {
    const at = o.won_at || o.updated_at;
    if (!at) continue;
    const day = sydneyDate(at);
    if (day >= SALES_FROM) counts[day] = (counts[day] || 0) + 1;
  }

  // Check-then-write, same as metricActuals.js — the staff_id-null
  // uniqueness is a partial index PostgREST can't upsert against.
  const existing = await selectAll(() => supabase.from('metric_actuals').select('id, metric_date, value')
    .eq('metric_key', SALES_METRIC_KEY).is('staff_id', null).gte('metric_date', SALES_FROM).order('metric_date'));
  const byDate = Object.fromEntries(existing.map((r) => [r.metric_date, r]));
  const now = new Date().toISOString();
  let changed = 0;
  for (const day of new Set([...Object.keys(counts), ...Object.keys(byDate)])) {
    const value = counts[day] || 0;
    const row = byDate[day];
    if (row && Number(row.value) === value) continue;
    const { error } = row
      ? await supabase.from('metric_actuals').update({ value, source: 'ghl', synced_at: now }).eq('id', row.id)
      : await supabase.from('metric_actuals').insert({ metric_key: SALES_METRIC_KEY, metric_date: day, value, staff_id: null, source: 'ghl' });
    if (error) throw new Error(`metric_actuals (sales): ${error.message}`);
    changed++;
  }
  return { won: won.length, sinceCutover: Object.values(counts).reduce((a, b) => a + b, 0), daysChanged: changed };
}

export async function runGhlSync() {
  const deadline = Date.now() + BUDGET_MS;
  const leads = await syncPipelines();
  const opportunities = await syncOpportunities(leads.id, deadline);
  const sales = await syncWonSales(leads.id);
  const contacts = await syncContacts(leads.id, deadline);
  const mindbody = await syncMindbodyMatches(deadline);
  return { pipeline: leads.name, opportunities, sales, contacts, mindbody };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }, body: '' };
  }
  const secret = process.env.MB_SYNC_SECRET;
  const given  = event?.headers?.['x-sync-secret'] || event?.headers?.['X-Sync-Secret'];
  if (!(secret && given === secret)) {
    const { error } = await requireStaff(event, supabase);
    if (error) return error;
  }
  if (!ghlConfigured()) return err('GHL is not connected yet — set GHL_TOKEN and GHL_LOCATION_ID in Netlify', 503);

  resetGhlCallCount();
  const { data: logRow } = await supabase.from('ghl_sync_log').insert({}).select('id').single();
  try {
    const detail = await runGhlSync();
    await supabase.from('ghl_sync_log').update({ finished_at: new Date().toISOString(), ok: true, api_calls: ghlCallCount(), detail }).eq('id', logRow?.id);
    console.log(`[scheduled-ghl-sync] ok, ${ghlCallCount()} calls`, JSON.stringify(detail));
    return ok({ apiCalls: ghlCallCount(), ...detail });
  } catch (e) {
    await supabase.from('ghl_sync_log').update({ finished_at: new Date().toISOString(), ok: false, api_calls: ghlCallCount(), detail: { error: e.message } }).eq('id', logRow?.id);
    console.error('[scheduled-ghl-sync] failed:', e.message);
    return err(e.message);
  }
};
