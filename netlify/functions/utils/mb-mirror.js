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

async function rawRange(table, start, end, params) {
  const { from, to } = page(params);
  let q = supabase.from(table).select('raw').order('local_ts').order('id');
  if (start) q = q.gte('local_ts', start);
  if (end)   q = q.lte('local_ts', end);
  const { data, error } = await q.range(from, to);
  if (error) throw new Error(`mirror ${table}: ${error.message}`);
  return data.map((r) => r.raw);
}

async function clients(params) {
  const { from, to } = page(params);
  let q = supabase.from('mb_clients_raw').select('raw').order('id');
  const ids = params.ClientIds ?? params.clientIds;
  if (ids) q = q.in('id', (Array.isArray(ids) ? ids : [ids]).map(String));
  const { data, error } = await q.range(from, to);
  if (error) throw new Error(`mirror mb_clients_raw: ${error.message}`);
  return data.map((r) => r.raw);
}

async function perClient(table, column, clientId) {
  const { data, error } = await supabase.from(table).select(column).eq('client_id', String(clientId)).maybeSingle();
  if (error) throw new Error(`mirror ${table}: ${error.message}`);
  return data?.[column] || [];
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
    case '/class/classvisits': {
      const { data, error } = await supabase.from('mb_classes').select('visits').eq('id', String(params.ClassID)).maybeSingle();
      if (error) throw new Error(`mirror mb_classes visits: ${error.message}`);
      return { Class: { Id: params.ClassID, Visits: data?.visits || [] } };
    }
    case '/client/clientcontracts':
      return { Contracts: await perClient('mb_client_contracts', 'contracts', params.clientId ?? params.ClientId) };
    case '/client/clientservices':
      return { ClientServices: await perClient('mb_client_services', 'services', params.clientId ?? params.ClientId) };
    case '/site/sessiontypes': {
      const { data, error } = await supabase.from('mb_reference').select('raw').eq('key', 'sessiontypes').maybeSingle();
      if (error) throw new Error(`mirror mb_reference: ${error.message}`);
      return { SessionTypes: data?.raw || [] };
    }
    default:
      throw new Error(`mirrorGet: ${path} is not mirrored — add it to scheduled-mb-mirror.js rather than calling Mindbody live`);
  }
}
