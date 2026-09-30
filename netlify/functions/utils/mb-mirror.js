/**
 * Read side of the Supabase Mindbody mirror (see
 * 20260930000000_mindbody_mirror.sql and scheduled-mb-mirror.js).
 *
 * mirrorGet(path, token, params) is a drop-in for mb-auth.js's mbGet(): same
 * paths, same params, same response shapes (the rows hold Mindbody's raw
 * JSON), but answered from Supabase — zero Mindbody API calls. Endpoints
 * swap `mbGet` for this and keep their logic untouched. The `token`
 * argument is ignored; getMirrorToken() exists so call sites that fetch a
 * token first don't need restructuring.
 *
 * Only the paths the dashboard actually uses are supported; anything else
 * throws, so a new live Mindbody call can't sneak back in unnoticed.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function getMirrorToken() {
  return null;
}

// Mindbody's datetime params are site-local wall-clock strings; a bare date
// as an END bound means "through the end of that day".
const startBound = (v) => (v ? String(v) : null);
const endBound   = (v) => (v ? (String(v).length === 10 ? `${v}T23:59:59` : String(v)) : null);

function page(params) {
  const limit  = Number(params.Limit ?? params.limit ?? 100);
  const offset = Number(params.Offset ?? params.offset ?? 0);
  return { from: offset, to: offset + limit - 1 };
}

// Endpoints make hundreds of small reads per request: paging a date range
// 200 rows at a time, and per-item lookups (/class/classvisits per class,
// contracts/services per client). Netlify runs in the US and Supabase in
// Sydney, so each one is a trans-Pacific round trip (~12s per endpoint,
// measured live). Instead each range or table is loaded once (1000-row
// pages in parallel) and served from memory; the short TTL keeps a warm
// Lambda from serving a previous request's data for long.
const CACHE_TTL_MS = 30_000;
const cache = new Map(); // name -> { at, promise: Promise<Map> }

function cached(name, load) {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;
  const promise = load().catch((e) => { cache.delete(name); throw e; });
  cache.set(name, { at: Date.now(), promise });
  return promise;
}

async function loadAll(build) {
  const { count, error } = await build('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  const pages = Array.from({ length: Math.ceil((count || 0) / 1000) }, (_, i) => i);
  const results = await Promise.all(pages.map(async (i) => {
    const { data, error: e } = await build('raw').range(i * 1000, i * 1000 + 999);
    if (e) throw new Error(e.message);
    return data;
  }));
  return results.flat().map((r) => r.raw);
}

async function rawRange(table, start, end, params) {
  const { from, to } = page(params);
  const rows = await cached(`${table}|${start}|${end}`, () => loadAll((cols, opts) => {
    let q = supabase.from(table).select(cols, opts);
    if (start) q = q.gte('local_ts', start);
    if (end)   q = q.lte('local_ts', end);
    return q.order('local_ts').order('id');
  }).catch((e) => { throw new Error(`mirror ${table}: ${e.message}`); }));
  return rows.slice(from, to + 1);
}

async function clients(params) {
  const { from, to } = page(params);
  const all = await cached('clients', () => loadAll((cols, opts) => supabase.from('mb_clients_raw').select(cols, opts).order('id'))
    .catch((e) => { throw new Error(`mirror mb_clients_raw: ${e.message}`); }));
  const ids = params.ClientIds ?? params.clientIds;
  if (!ids) return all.slice(from, to + 1);
  const want = new Set((Array.isArray(ids) ? ids : [ids]).map(String));
  return all.filter((c) => want.has(String(c.Id))).slice(from, to + 1);
}

async function loadMap(table, keyCol, valueCol, filter) {
  const map = new Map();
  let from = 0;
  while (true) {
    let q = supabase.from(table).select(`${keyCol}, ${valueCol}`).order(keyCol);
    if (filter) q = filter(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(`mirror ${table}: ${error.message}`);
    for (const r of data) map.set(String(r[keyCol]), r[valueCol]);
    if (data.length < 1000) return map;
    from += 1000;
  }
}

// Visits only exist for recent classes (nothing older is ever re-fetched),
// so bound the load to what any endpoint looks back over.
const visitsMap = () => cached('visits', () => loadMap('mb_classes', 'id', 'visits', (q) =>
  q.not('visits', 'is', null).gte('local_ts', new Date(Date.now() - 70 * 86400_000).toISOString().slice(0, 19))));
const contractsMap = () => cached('contracts', () => loadMap('mb_client_contracts', 'client_id', 'contracts'));
const servicesMap  = () => cached('services',  () => loadMap('mb_client_services',  'client_id', 'services'));

async function visitsFor(classId) {
  const map = await visitsMap();
  const key = String(classId);
  if (map.has(key)) return map.get(key) || [];
  // Older than the preloaded window — fall back to a direct lookup.
  const { data, error } = await supabase.from('mb_classes').select('visits').eq('id', key).maybeSingle();
  if (error) throw new Error(`mirror mb_classes visits: ${error.message}`);
  return data?.visits || [];
}

export async function mirrorGet(path, _token, params = {}) {
  switch (path) {
    case '/sale/sales':
      return { Sales: await rawRange('mb_sales', startBound(params.StartSaleDateTime), endBound(params.EndSaleDateTime), params) };
    case '/class/classes':
      return { Classes: await rawRange('mb_classes', startBound(params.StartDateTime), endBound(params.EndDateTime), params) };
    case '/appointment/staffappointments':
      return { Appointments: await rawRange('mb_appointments', startBound(params.StartDate), endBound(params.EndDate), params) };
    case '/sale/transactions':
      return { Transactions: await rawRange('mb_transactions', startBound(params.TransactionStartDateTime), endBound(params.TransactionEndDateTime), params) };
    case '/client/clients':
      return { Clients: await clients(params) };
    case '/class/classvisits':
      return { Class: { Id: params.ClassID, Visits: await visitsFor(params.ClassID) } };
    case '/client/clientcontracts':
      return { Contracts: (await contractsMap()).get(String(params.clientId ?? params.ClientId)) || [] };
    case '/client/clientservices':
      return { ClientServices: (await servicesMap()).get(String(params.clientId ?? params.ClientId)) || [] };
    case '/site/sessiontypes': {
      const { data, error } = await supabase.from('mb_reference').select('raw').eq('key', 'sessiontypes').maybeSingle();
      if (error) throw new Error(`mirror mb_reference: ${error.message}`);
      return { SessionTypes: data?.raw || [] };
    }
    default:
      throw new Error(`mirrorGet: ${path} is not mirrored — add it to scheduled-mb-mirror.js rather than calling Mindbody live`);
  }
}
