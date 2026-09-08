/**
 * Scheduled Mindbody client sync — separate from scheduled-daily-refresh.js
 * (which is already near its 26s budget) so a slow Mindbody response here
 * can't take down the existing attendance/revenue sync.
 *
 * Runs daily, an hour after scheduled-daily-refresh.js, to stagger Mindbody
 * API load:
 *   1. syncClientRoster    – full /client/clients pull (503 clients), upserted
 *                            into `clients` on mindbody_id. The payload never
 *                            includes our own columns (assigned_staff_id,
 *                            next_program_due, total_classes_attended,
 *                            total_pt_sessions, last_visit_date) — PostgREST's
 *                            generated ON CONFLICT DO UPDATE SET only touches
 *                            columns present in the JSON, so those are never
 *                            clobbered by a resync.
 *   2. syncClassVisitLedger    – yesterday's class visits, one row per
 *                                client per class attended.
 *   3. syncAppointmentLedger   – yesterday's PT/appointment visits.
 *   4. recomputeTotals         – for clients touched today, refresh
 *                                total_classes_attended/total_pt_sessions/
 *                                last_visit_date on the clients row.
 *
 * Manual HTTP invocation with ?backfillLedgerDate=YYYY-MM-DD runs steps 2–4
 * for exactly that one date (used to backfill the last ~90 days one call at
 * a time — a full multi-day walk of /class/classes + /class/classvisits
 * fan-out can't reliably fit in one 26s invocation). The cron trigger never
 * passes query params, so this path only ever runs when deliberately curled.
 * Every upsert is idempotent, so backfill calls are safe to re-run/resume.
 */
import { createClient } from '@supabase/supabase-js';
import { getStaffToken, mbGet, ok, err, formatPhone } from './utils/mb-auth.js';
import { classifySession } from './utils/session-classify.js';
import { format, parseISO, subDays } from 'date-fns';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export const config = {
  schedule: '0 15 * * *', // 3pm UTC = 1am Sydney (AEST) — 1hr after scheduled-daily-refresh
};

const CLASS_BATCH = 15; // matches mb-client-analytics.js's classvisits fan-out batch size

// ─── Roster sync ────────────────────────────────────────────────────────────

async function fetchAllClients(token) {
  let all = [];
  let offset = 0;
  while (true) {
    const data = await mbGet('/client/clients', token, { ActiveOnly: false, Limit: 200, Offset: offset });
    const clients = data.Clients || [];
    all = all.concat(clients);
    if (clients.length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return all;
}

function mapClientRow(c) {
  return {
    mindbody_id:                    String(c.Id),
    first_name:                     c.FirstName || null,
    last_name:                      c.LastName || null,
    middle_name:                    c.MiddleName || null,
    email:                          c.Email || null,
    mobile_phone:                   c.MobilePhone ? formatPhone(c.MobilePhone) : null,
    home_phone:                     c.HomePhone ? formatPhone(c.HomePhone) : null,
    work_phone:                     c.WorkPhone ? formatPhone(c.WorkPhone) : null,
    birth_date:                     c.BirthDate ? c.BirthDate.slice(0, 10) : null,
    gender:                         c.Gender || null,
    status:                         c.Status || null,
    active:                         c.Active !== false,
    address_line1:                  c.AddressLine1 || null,
    address_line2:                  c.AddressLine2 || null,
    city:                           c.City || null,
    postal_code:                    c.PostalCode || null,
    country:                        c.Country || null,
    state:                          c.State || null,
    emergency_contact_name:         c.EmergencyContactInfoName || null,
    emergency_contact_email:        c.EmergencyContactInfoEmail || null,
    emergency_contact_phone:        c.EmergencyContactInfoPhone || null,
    emergency_contact_relationship: c.EmergencyContactInfoRelationship || null,
    creation_date:                  c.CreationDate || null,
    first_class_date:               c.FirstClassDate ? c.FirstClassDate.slice(0, 10) : null,
    first_appointment_date:         c.FirstAppointmentDate ? c.FirstAppointmentDate.slice(0, 10) : null,
    mb_last_modified:               c.LastModifiedDateTime || null,
    account_balance:                c.AccountBalance ?? null,
    suspension_info:                c.SuspensionInfo || null,
    red_alert:                      c.RedAlert || null,
    yellow_alert:                   c.YellowAlert || null,
    referred_by:                    c.ReferredBy || null,
    photo_url:                      c.PhotoUrl || null,
    mindbody_notes:                 c.Notes || null,
    last_formula_notes:             c.LastFormulaNotes || null,
    synced_at:                      new Date().toISOString(),
  };
}

async function syncClientRoster(token) {
  const rawClients = await fetchAllClients(token);
  const rows = rawClients.map(mapClientRow);
  // Chunked upsert — 503 rows in one call is fine, but chunk defensively in
  // case the roster grows a lot before this code is revisited.
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from('clients').upsert(chunk, { onConflict: 'mindbody_id' });
    if (error) throw new Error(`roster upsert failed: ${error.message}`);
  }
  return rows.length;
}

async function fetchClientIdMap() {
  const map = {};
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('clients').select('id, mindbody_id').range(from, from + 999);
    if (error) throw new Error(`client id map fetch failed: ${error.message}`);
    for (const row of data) map[row.mindbody_id] = row.id;
    if (data.length < 1000) break;
    from += 1000;
  }
  return map;
}

// ─── Class visit ledger (one day) ──────────────────────────────────────────

async function getClassesForDay(token, dateStr) {
  const startStr = `${dateStr}T00:00:00`;
  const endStr   = `${dateStr}T23:59:59`;
  let all = [];
  let offset = 0;
  while (true) {
    const data = await mbGet('/class/classes', token, { StartDateTime: startStr, EndDateTime: endStr, Limit: 200, Offset: offset });
    const classes = (data.Classes || []).filter((c) => (c.TotalBooked || 0) > 0);
    all = all.concat(classes);
    if ((data.Classes || []).length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return all;
}

async function getVisitsForClass(token, classId) {
  try {
    const data = await mbGet('/class/classvisits', token, { ClassID: classId });
    return data.Class?.Visits || [];
  } catch {
    return [];
  }
}

async function syncClassVisitLedger(token, dateStr, idMap) {
  const classes = await getClassesForDay(token, dateStr);
  // Keyed by "client_id|mindbody_class_id" — a client can have more than one
  // Visit record against the same class (e.g. late-cancel then rebook), which
  // would otherwise submit two rows sharing our (client_id, mindbody_class_id)
  // unique key in the same upsert batch and Postgres rejects "ON CONFLICT DO
  // UPDATE... affect row a second time". Last visit for a given key wins,
  // except signed_in/late_cancelled are OR'd across duplicates so a genuine
  // attendance isn't lost behind a later no-show/cancel record for the same class.
  const byKey = new Map();
  for (let i = 0; i < classes.length; i += CLASS_BATCH) {
    const batch = classes.slice(i, i + CLASS_BATCH);
    const results = await Promise.allSettled(batch.map((cls) => getVisitsForClass(token, cls.Id).then((visits) => ({ cls, visits }))));
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { cls, visits } = r.value;
      for (const visit of visits) {
        const clientId = idMap[String(visit.ClientId || '')];
        if (!clientId) continue; // client not yet in roster (race/new client) — skip, not fatal
        const key = `${clientId}|${cls.Id}`;
        const prev = byKey.get(key);
        byKey.set(key, {
          client_id:            clientId,
          mindbody_class_id:    String(cls.Id),
          mindbody_visit_id:    visit.Id != null ? String(visit.Id) : null,
          class_name:           cls.ClassDescription?.Name || cls.Name || null,
          service_name:         visit.ServiceName || null,
          staff_name:           `${cls.Staff?.FirstName || ''} ${cls.Staff?.LastName || ''}`.trim() || null,
          class_date:           dateStr,
          class_start_datetime: cls.StartDateTime || null,
          signed_in:            visit.SignedIn === true || prev?.signed_in === true,
          late_cancelled:       visit.LateCancelled === true || prev?.late_cancelled === true,
          synced_at:            new Date().toISOString(),
        });
      }
    }
  }
  const rows = [...byKey.values()];
  if (rows.length) {
    const { error } = await supabase.from('client_class_visits').upsert(rows, { onConflict: 'client_id,mindbody_class_id' });
    if (error) throw new Error(`class visit upsert failed: ${error.message}`);
  }
  return { classesChecked: classes.length, visitsWritten: rows.length, clientIds: new Set(rows.map((r) => r.client_id)) };
}

// ─── Appointment (PT/SP) ledger (one day) ──────────────────────────────────

async function fetchSessionTypeMap(token) {
  try {
    const data = await mbGet('/site/sessiontypes', token, { OnlineOnly: false });
    const map = {};
    for (const t of data.SessionTypes || []) map[t.Id] = t.Name || '';
    return map;
  } catch {
    return {};
  }
}

async function getAppointmentsForDay(token, dateStr) {
  const start = `${dateStr}T00:00:00`;
  const end   = `${dateStr}T23:59:59`;
  let all = [];
  let offset = 0;
  while (true) {
    const data = await mbGet('/appointment/staffappointments', token, { StartDate: start, EndDate: end, Limit: 200, Offset: offset });
    const appts = data.Appointments || [];
    all = all.concat(appts);
    if (appts.length < 200 || offset >= 1800) break;
    offset += 200;
  }
  return all;
}

async function syncAppointmentLedger(token, dateStr, idMap) {
  const [sessionTypeMap, appts] = await Promise.all([
    fetchSessionTypeMap(token),
    getAppointmentsForDay(token, dateStr),
  ]);
  // Keyed by mindbody_appointment_id (our unique constraint) — defensive
  // against the same appointment appearing twice across a paginated fetch,
  // for the same "ON CONFLICT DO UPDATE... affect row a second time" reason
  // as the class-visit ledger above.
  const byId = new Map();
  const clientIds = new Set();
  for (const a of appts) {
    const clientId = idMap[String(a.ClientId || '')];
    if (!clientId) continue;
    const typeName = sessionTypeMap[a.SessionTypeId] || '';
    byId.set(String(a.Id), {
      client_id:                  clientId,
      mindbody_appointment_id:    String(a.Id),
      session_type_id:            a.SessionTypeId != null ? String(a.SessionTypeId) : null,
      session_type_name:          typeName || null,
      session_category:           classifySession(typeName),
      staff_name:                 `${a.Staff?.FirstName || ''} ${a.Staff?.LastName || ''}`.trim() || null,
      appointment_date:           dateStr,
      appointment_start_datetime: a.StartDateTime || null,
      status:                     a.Status || null,
      synced_at:                  new Date().toISOString(),
    });
    clientIds.add(clientId);
  }
  const rows = [...byId.values()];
  if (rows.length) {
    const { error } = await supabase.from('client_appointment_visits').upsert(rows, { onConflict: 'mindbody_appointment_id' });
    if (error) throw new Error(`appointment visit upsert failed: ${error.message}`);
  }
  return { appointmentsChecked: appts.length, visitsWritten: rows.length, clientIds };
}

// ─── Totals recompute ───────────────────────────────────────────────────────

async function recomputeTotals(clientIds) {
  for (const clientId of clientIds) {
    const [classesRes, apptsRes] = await Promise.all([
      supabase.from('client_class_visits').select('class_date', { count: 'exact' }).eq('client_id', clientId).eq('signed_in', true),
      supabase.from('client_appointment_visits').select('appointment_date', { count: 'exact' }).eq('client_id', clientId).eq('status', 'Completed').in('session_category', ['pt', 'sp']),
    ]);
    if (classesRes.error || apptsRes.error) {
      console.error('[scheduled-client-sync] totals recompute failed for', clientId, classesRes.error?.message, apptsRes.error?.message);
      continue;
    }
    const classDates = (classesRes.data || []).map((r) => r.class_date);
    const apptDates  = (apptsRes.data || []).map((r) => r.appointment_date);
    const lastVisit  = [...classDates, ...apptDates].sort().pop() || null;

    const { error: updErr } = await supabase.from('clients').update({
      total_classes_attended: classesRes.count || 0,
      total_pt_sessions:      apptsRes.count || 0,
      last_visit_date:        lastVisit,
      updated_at:             new Date().toISOString(),
    }).eq('id', clientId);
    if (updErr) console.error('[scheduled-client-sync] clients totals update failed for', clientId, updErr.message);
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  const backfillLedgerDate = event?.queryStringParameters?.backfillLedgerDate || null;
  console.log('[scheduled-client-sync] Starting at', new Date().toISOString(), backfillLedgerDate ? `(backfill ${backfillLedgerDate})` : '');

  try {
    const token = await getStaffToken();

    // The roster sync hits Mindbody's rate limit fast if repeated on every
    // call of a backfill loop (each one paginates the full /client/clients
    // roster) — and a backfill run doesn't need a fresh roster per day, just
    // the mindbody_id→uuid map already sitting in Supabase from whichever
    // normal/first run synced it. Only the normal cron path (no backfill
    // param) re-syncs the roster; skip it on every backfill call.
    const rosterCount = backfillLedgerDate ? null : await syncClientRoster(token);
    const idMap = await fetchClientIdMap();

    const dateStr = backfillLedgerDate || format(subDays(new Date(), 1), 'yyyy-MM-dd');

    const [classResult, apptResult] = await Promise.all([
      syncClassVisitLedger(token, dateStr, idMap),
      syncAppointmentLedger(token, dateStr, idMap),
    ]);

    const touchedClientIds = new Set([...classResult.clientIds, ...apptResult.clientIds]);
    await recomputeTotals(touchedClientIds);

    console.log(
      '[scheduled-client-sync] Done.',
      `roster=${rosterCount} date=${dateStr} classVisits=${classResult.visitsWritten} apptVisits=${apptResult.visitsWritten} touched=${touchedClientIds.size}`,
    );

    return ok({
      roster: rosterCount,
      date: dateStr,
      classes: { checked: classResult.classesChecked, written: classResult.visitsWritten },
      appointments: { checked: apptResult.appointmentsChecked, written: apptResult.visitsWritten },
      clientsRecomputed: touchedClientIds.size,
    });
  } catch (e) {
    console.error('[scheduled-client-sync] Failed:', e.message);
    return err(e.message);
  }
};
