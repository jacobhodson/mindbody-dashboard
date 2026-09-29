/**
 * The ONLY place in this app that calls the Mindbody API (2026-09-30).
 *
 * Mindbody bills per call. Every dashboard endpoint used to hit it live on
 * each page load, tab switch and period toggle — hundreds of calls apiece
 * (one /class/classvisits per class, one /client/clientcontracts per
 * client, ...), and a Supabase token refresh re-ran the whole load hourly
 * for every open tab. This job copies Mindbody's raw objects into the
 * mb_* mirror tables on a schedule; everything else reads them through
 * utils/mb-mirror.js, so usage no longer grows with how often staff open
 * the dashboard.
 *
 * Modes (?mode=…, driven by pg_cron — see 20260930000010_mindbody_mirror_cron.sql):
 *   frequent  (hourly, daytime) – roster, recent sales/transactions, today's
 *                                 and yesterday's classes, visits for
 *                                 classes that have started (each class is
 *                                 re-fetched until one fetch lands after it
 *                                 ended), appointments for the last week.
 *   nightly                      – wider windows to catch late edits
 *                                 (returns, sign-offs, late check-ins):
 *                                 35 days of sales/appointments, 3 days of
 *                                 class visits re-fetched, 31 days of
 *                                 transactions, session types.
 *   contracts                    – /client/clientcontracts for clients whose
 *                                 status can matter (not Terminated /
 *                                 Non-Member / Expired / Declined), oldest-
 *                                 synced first, under a time budget.
 *   services                     – /client/clientservices for recent PT/SP
 *                                 clients, same budgeted approach.
 *   backfill&from=YYYY-MM-DD&to=YYYY-MM-DD[&visits=1]
 *                                – seed history (lists only unless visits=1).
 *                                   Run locally with node (&noDeadline=1) for
 *                                   big ranges — no Netlify timeout there.
 *
 * Requires header `x-sync-secret: $MB_SYNC_SECRET` — this endpoint spends
 * money, so it must not be publicly triggerable.
 */
import { createClient } from '@supabase/supabase-js';
import { getStaffToken, mbGet as rawMbGet, ok, err } from './utils/mb-auth.js';
import { classifySession } from './utils/session-classify.js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BATCH = 10;              // parallel per-item calls (Mindbody rate-limits bursts)
const BUDGET_MS = 18_000;      // leave headroom under Netlify's 26s
const PER_CLIENT_FRESH_HOURS = 20;
const IGNORED_CONTRACT_STATUSES = new Set(['terminated', 'non-member', 'non member', 'expired', 'declined']);

let apiCalls = 0;
const mbGet = (...args) => { apiCalls++; return rawMbGet(...args); };

// ── Sydney wall-clock helpers (Mindbody datetimes are site-local) ─────────
function sydneyParts(date = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` };
}
const nowLocal = () => { const p = sydneyParts(); return `${p.date}T${p.time}`; };
function localDate(daysOffset = 0) {
  const d = new Date(`${sydneyParts().date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}
function addMinutesLocal(localStr, minutes) {
  const d = new Date(`${localStr.slice(0, 19)}Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 19);
}
const toLocalTs = (v) => (v ? String(v).slice(0, 19) : null);

// ── Generic helpers ───────────────────────────────────────────────────────
async function fetchAllPages(path, token, params, key) {
  let all = [], offset = 0;
  while (true) {
    const data = await mbGet(path, token, { ...params, Limit: 200, Offset: offset });
    const rows = data[key] || [];
    all = all.concat(rows);
    if (rows.length < 200 || offset >= 19800) break;
    offset += 200;
  }
  return all;
}

async function upsert(table, rows, onConflict = 'id') {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
  }
  return rows.length;
}

// PostgREST caps a response at 1000 rows — page through anything that can exceed it.
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

function dedupeById(rows) {
  return [...new Map(rows.map((r) => [r.id, r])).values()];
}

async function inBatches(items, fn, deadline) {
  let done = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    if (deadline && Date.now() > deadline) break;
    await Promise.allSettled(items.slice(i, i + BATCH).map(fn));
    done = Math.min(items.length, i + BATCH);
  }
  return done;
}

// ── Lists ─────────────────────────────────────────────────────────────────
async function syncSales(token, fromDate, toDate) {
  const sales = await fetchAllPages('/sale/sales', token,
    { StartSaleDateTime: `${fromDate}T00:00:00`, EndSaleDateTime: `${toDate}T23:59:59` }, 'Sales');
  const rows = dedupeById(sales
    .map((s) => ({ id: String(s.Id), local_ts: toLocalTs(s.SaleDateTime || s.SaleDate), raw: s, synced_at: new Date().toISOString() }))
    .filter((r) => r.local_ts));
  return upsert('mb_sales', rows);
}

async function syncTransactions(token, fromDate, toDate) {
  const txns = await fetchAllPages('/sale/transactions', token,
    { TransactionStartDateTime: `${fromDate}T00:00:00`, TransactionEndDateTime: `${toDate}T23:59:59` }, 'Transactions');
  const rows = dedupeById(txns
    .map((t) => ({ id: String(t.TransactionId ?? t.Id), local_ts: toLocalTs(t.TransactionTime), raw: t, synced_at: new Date().toISOString() }))
    .filter((r) => r.local_ts && r.id !== 'undefined'));
  return upsert('mb_transactions', rows);
}

async function syncAppointments(token, fromDate, toDate) {
  const appts = await fetchAllPages('/appointment/staffappointments', token,
    { StartDate: `${fromDate}T00:00:00`, EndDate: `${toDate}T23:59:59` }, 'Appointments');
  const rows = dedupeById(appts
    .map((a) => ({ id: String(a.Id), local_ts: toLocalTs(a.StartDateTime), raw: a, synced_at: new Date().toISOString() }))
    .filter((r) => r.local_ts));
  return upsert('mb_appointments', rows);
}

// Class list only — visits are a separate per-class call (syncVisits).
// `visits`/`visits_final` are omitted from the payload so an upsert never
// wipes visits already fetched.
async function syncClasses(token, fromDate, toDate) {
  const classes = await fetchAllPages('/class/classes', token,
    { StartDateTime: `${fromDate}T00:00:00`, EndDateTime: `${toDate}T23:59:59` }, 'Classes');
  const rows = dedupeById(classes
    .map((c) => ({ id: String(c.Id), local_ts: toLocalTs(c.StartDateTime), raw: c, synced_at: new Date().toISOString() }))
    .filter((r) => r.local_ts));
  return upsert('mb_classes', rows);
}

async function syncRoster(token) {
  const clients = await fetchAllPages('/client/clients', token, { ActiveOnly: false }, 'Clients');
  const rows = dedupeById(clients.map((c) => ({ id: String(c.Id), raw: c, synced_at: new Date().toISOString() })));
  return upsert('mb_clients_raw', rows);
}

async function syncSessionTypes(token) {
  const data = await mbGet('/site/sessiontypes', token, { OnlineOnly: false });
  const { error } = await supabase.from('mb_reference')
    .upsert({ key: 'sessiontypes', raw: data.SessionTypes || [], synced_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`mb_reference: ${error.message}`);
  return (data.SessionTypes || []).length;
}

// ── Class visits ──────────────────────────────────────────────────────────
// Only classes with bookings (same filter the endpoints always applied).
// `force` refetches regardless of visits_final (nightly catch-up of late
// check-in corrections); otherwise only started classes not yet final.
async function syncVisits(token, fromDate, toDate, { force = false, deadline } = {}) {
  const now = nowLocal();
  const rangeEnd = `${toDate}T23:59:59`;
  const q = () => supabase.from('mb_classes')
    .select('id, local_ts, raw->EndDateTime, raw->TotalBooked, visits_final')
    .gte('local_ts', `${fromDate}T00:00:00`)
    .lte('local_ts', rangeEnd < now ? rangeEnd : now) // only classes that have started
    .in('visits_final', force ? [true, false] : [false]);
  const data = await selectAll(() => q().order('id'));

  const due = data.filter((c) => Number(c.TotalBooked || 0) > 0);
  let fetched = 0;
  await inBatches(due, async (c) => {
    const res = await mbGet('/class/classvisits', token, { ClassID: c.id });
    const end = toLocalTs(c.EndDateTime) || addMinutesLocal(c.local_ts, 60);
    const { error: updErr } = await supabase.from('mb_classes').update({
      visits: res.Class?.Visits || [],
      visits_synced_at: new Date().toISOString(),
      visits_final: now >= addMinutesLocal(end, 30),
    }).eq('id', c.id);
    if (updErr) throw new Error(updErr.message);
    fetched++;
  }, deadline);

  // Classes nobody booked are final by definition — no call needed.
  const empty = data.filter((c) => Number(c.TotalBooked || 0) === 0 && !c.visits_final).map((c) => c.id);
  if (empty.length) {
    await supabase.from('mb_classes').update({ visits: [], visits_final: true, visits_synced_at: new Date().toISOString() }).in('id', empty);
  }
  return { due: due.length, fetched };
}

// ── Per-client lists, oldest-synced first under a time budget ─────────────
async function syncPerClient({ token, ids, table, column, path, params, key, deadline }) {
  const { data: existing, error } = await supabase.from(table).select('client_id, synced_at');
  if (error) throw new Error(`${table} select: ${error.message}`);
  const syncedAt = Object.fromEntries(existing.map((r) => [r.client_id, new Date(r.synced_at).getTime()]));
  const freshCutoff = Date.now() - PER_CLIENT_FRESH_HOURS * 3600_000;

  const queue = ids
    .filter((id) => !(syncedAt[id] > freshCutoff))
    .sort((a, b) => (syncedAt[a] || 0) - (syncedAt[b] || 0));

  let done = 0;
  await inBatches(queue, async (id) => {
    const res = await mbGet(path, token, { ...params, clientId: id });
    const list = key.map((k) => res[k]).find(Array.isArray) || [];
    const { error: upErr } = await supabase.from(table)
      .upsert({ client_id: id, [column]: list, synced_at: new Date().toISOString() }, { onConflict: 'client_id' });
    if (upErr) throw new Error(upErr.message);
    done++;
  }, deadline);
  return { candidates: ids.length, due: queue.length, synced: done, remaining: queue.length - done };
}

async function contractCandidates() {
  const { data, error } = await supabase.from('mb_clients_raw').select('id, raw->Status');
  if (error) throw new Error(`mb_clients_raw select: ${error.message}`);
  return data.filter((c) => !IGNORED_CONTRACT_STATUSES.has(String(c.Status || 'Active').toLowerCase())).map((c) => c.id);
}

// Clients with a PT/SP appointment in the last 35 days — the pool
// mb-pt-analytics.js checks for remaining session credits.
async function serviceCandidates() {
  const [{ data: ref }, appts] = await Promise.all([
    supabase.from('mb_reference').select('raw').eq('key', 'sessiontypes').maybeSingle(),
    selectAll(() => supabase.from('mb_appointments').select('id, raw->ClientId, raw->SessionTypeId').gte('local_ts', `${localDate(-35)}T00:00:00`).order('id')),
  ]);
  const typeName = Object.fromEntries((ref?.raw || []).map((t) => [t.Id, t.Name || '']));
  const ids = new Set();
  for (const a of appts) {
    const t = classifySession(typeName[a.SessionTypeId] || '');
    if ((t === 'pt' || t === 'sp') && a.ClientId != null) ids.add(String(a.ClientId));
  }
  return [...ids];
}

// ── Modes ─────────────────────────────────────────────────────────────────
async function runMode(mode, qs, token) {
  // noDeadline=1 is for local node runs (backfills), which have no 26s limit.
  const deadline = qs.noDeadline ? null : Date.now() + BUDGET_MS;
  switch (mode) {
    case 'frequent': {
      const [roster, sales, txns, classes, appts] = await Promise.all([
        syncRoster(token),
        syncSales(token, localDate(-2), localDate(0)),
        syncTransactions(token, localDate(-2), localDate(0)),
        syncClasses(token, localDate(-1), localDate(0)),
        syncAppointments(token, localDate(-7), localDate(1)),
      ]);
      const visits = await syncVisits(token, localDate(-1), localDate(0), { deadline });
      return { roster, sales, txns, classes, appts, visits };
    }
    case 'nightly': {
      const [types, roster, sales, txns, classes, appts] = await Promise.all([
        syncSessionTypes(token),
        syncRoster(token),
        syncSales(token, localDate(-35), localDate(0)),
        syncTransactions(token, localDate(-31), localDate(0)),
        syncClasses(token, localDate(-3), localDate(0)),
        syncAppointments(token, localDate(-35), localDate(1)),
      ]);
      const visits = await syncVisits(token, localDate(-3), localDate(0), { force: true, deadline });
      return { types, roster, sales, txns, classes, appts, visits };
    }
    case 'contracts':
      return syncPerClient({
        token, ids: await contractCandidates(), table: 'mb_client_contracts', column: 'contracts',
        path: '/client/clientcontracts', params: { Limit: 50 }, key: ['Contracts', 'ClientContracts'], deadline,
      });
    case 'services':
      return syncPerClient({
        token, ids: await serviceCandidates(), table: 'mb_client_services', column: 'services',
        path: '/client/clientservices', params: { ActiveOnly: true, Limit: 50 }, key: ['ClientServices'], deadline,
      });
    case 'backfill': {
      const { from, to } = qs;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) throw new Error('backfill needs from/to=YYYY-MM-DD');
      const [types, roster, sales, classes, appts, txns] = await Promise.all([
        syncSessionTypes(token),
        syncRoster(token),
        syncSales(token, from, to),
        syncClasses(token, from, to),
        syncAppointments(token, from, to),
        syncTransactions(token, from, to),
      ]);
      const visits = qs.visits ? await syncVisits(token, from, to, { force: true, deadline }) : null;
      return { types, roster, sales, classes, appts, txns, visits };
    }
    default:
      throw new Error(`unknown mode ${mode}`);
  }
}

export const handler = async (event) => {
  const secret = process.env.MB_SYNC_SECRET;
  const given  = event?.headers?.['x-sync-secret'] || event?.headers?.['X-Sync-Secret'];
  if (!secret || given !== secret) return err('forbidden', 403);

  const qs   = event?.queryStringParameters || {};
  const mode = qs.mode || 'frequent';
  apiCalls = 0;
  const { data: logRow } = await supabase.from('mb_sync_log').insert({ mode }).select('id').single();

  try {
    const token  = await getStaffToken();
    apiCalls++; // the token issue call counts too
    const detail = await runMode(mode, qs, token);
    await supabase.from('mb_sync_log').update({ finished_at: new Date().toISOString(), api_calls: apiCalls, ok: true, detail }).eq('id', logRow?.id);
    console.log(`[scheduled-mb-mirror] ${mode} ok, ${apiCalls} calls`, JSON.stringify(detail));
    return ok({ mode, apiCalls, ...detail });
  } catch (e) {
    await supabase.from('mb_sync_log').update({ finished_at: new Date().toISOString(), api_calls: apiCalls, ok: false, detail: { error: e.message } }).eq('id', logRow?.id);
    console.error(`[scheduled-mb-mirror] ${mode} failed after ${apiCalls} calls:`, e.message);
    return err(e.message);
  }
};
