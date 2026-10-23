/**
 * Acquisition tab ↔ GoHighLevel, for signed-in staff only
 * (Authorization: Bearer <Supabase access token>).
 *
 *   GET  ?view=notes&contactId=…   a lead's notes, live from GHL (newest first)
 *   GET  ?view=mb-queue            new Mindbody accounts with no GHL contact
 *   POST {action:'note', contactId, body}
 *   POST {action:'add-mindbody', mbClientId}
 *   POST {action:'add-referral', firstName, lastName, email, phone, referredBy, note}
 *   POST {action:'dismiss', mbClientId}
 *
 * Anything created in GHL is also written straight into the ghl_* mirror so
 * the board shows it without waiting for the next scheduled-ghl-sync run.
 */
import { ok, err, CORS } from './utils/mb-auth.js';
import {
  ghlFetch, ghlConfigured, LOCATION_ID, isLeadsPipeline, opportunityRow, contactRow,
  findContact, toE164, serviceClient, requireStaff, MB_LOOKBACK_DAYS,
} from './utils/ghl.js';

const supabase = serviceClient();

const SOURCES = {
  mindbody: { source: 'Mindbody sign-up', tags: ['ops-dashboard', 'mindbody-signup'] },
  referral: { source: 'Referral',         tags: ['ops-dashboard', 'referral'] },
};

async function leadsPipeline() {
  const { data, error } = await supabase.from('ghl_pipelines').select('id, name, stages');
  if (error) throw new Error(error.message);
  const p = (data || []).find(isLeadsPipeline);
  if (!p) throw new Error('Leads pipeline not synced yet — run a sync first');
  return { id: p.id, firstStageId: p.stages?.[0]?.id || null };
}

// ── Notes ─────────────────────────────────────────────────────────────────
async function listNotes(contactId) {
  const data = await ghlFetch(`/contacts/${encodeURIComponent(contactId)}/notes`);
  return (data?.notes || []).sort((a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded)));
}

async function addNote(contactId, body, staff) {
  const text = String(body || '').trim();
  if (!contactId || !text) throw Object.assign(new Error('contactId and body are required'), { status: 400 });
  const data = await ghlFetch(`/contacts/${encodeURIComponent(contactId)}/notes`, {
    method: 'POST',
    body: { body: `${text}\n\n— ${staff.full_name || 'Staff'} (Ops Dashboard)` },
  });
  return data?.note || data;
}

// ── Creating leads ────────────────────────────────────────────────────────
// Reuses an existing GHL contact (matched by email/phone) and an existing
// open opportunity for it in the Leads pipeline, so pressing the button
// twice — or adding someone who's already a lead — never makes duplicates.
async function createLead({ kind, firstName, lastName, email, phone, note, staff, mbClientId, referredBy }) {
  const pipeline = await leadsPipeline();
  const meta = SOURCES[kind];

  let contact = (await findContact({ email, phone }))?.contact || null;
  let createdContact = false;
  if (!contact) {
    const data = await ghlFetch('/contacts/', {
      method: 'POST',
      body: {
        locationId: LOCATION_ID,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        email: email ? String(email).trim().toLowerCase() : undefined,
        phone: toE164(phone) || undefined,
        source: meta.source,
        tags: meta.tags,
      },
    });
    contact = data?.contact;
    createdContact = true;
  }
  if (!contact?.id) throw new Error('GHL did not return a contact');

  const existing = await ghlFetch('/opportunities/search', {
    query: { locationId: LOCATION_ID, pipelineId: pipeline.id, contactId: contact.id, status: 'open', limit: 1 },
  });
  let opportunity = existing?.opportunities?.[0] || null;
  if (!opportunity) {
    const name = contact.name || [firstName, lastName].filter(Boolean).join(' ') || contact.email || 'New lead';
    const data = await ghlFetch('/opportunities/', {
      method: 'POST',
      body: {
        locationId: LOCATION_ID,
        pipelineId: pipeline.id,
        pipelineStageId: pipeline.firstStageId || undefined,
        name,
        status: 'open',
        contactId: contact.id,
      },
    });
    opportunity = data?.opportunity;
  }
  if (!opportunity?.id) throw new Error('GHL did not return an opportunity');

  if (note || referredBy) {
    const lines = [referredBy && `Referred by ${referredBy}`, note].filter(Boolean).join('\n');
    await addNote(contact.id, lines, staff);
  }

  // Mirror now; the next sync refreshes both with GHL's full objects.
  const fullContact = createdContact ? contact : (await ghlFetch(`/contacts/${contact.id}`))?.contact || contact;
  await supabase.from('ghl_contacts').upsert(contactRow(fullContact), { onConflict: 'id' });
  await supabase.from('ghl_opportunities').upsert(opportunityRow(opportunity, pipeline.id), { onConflict: 'id' });
  const { error: linkErr } = await supabase.from('ghl_lead_links').insert({
    kind, mb_client_id: mbClientId || null, ghl_contact_id: contact.id, ghl_opportunity_id: opportunity.id,
    referred_by: referredBy || null, created_by: staff.id,
  });
  if (linkErr) throw new Error(linkErr.message);
  if (mbClientId) {
    await supabase.from('ghl_mb_matches').upsert({
      mb_client_id: mbClientId, ghl_contact_id: contact.id, matched_by: 'added', checked_at: new Date().toISOString(),
    }, { onConflict: 'mb_client_id' });
  }
  return { contactId: contact.id, opportunityId: opportunity.id, reusedContact: !createdContact };
}

async function mbClient(id) {
  const { data, error } = await supabase.from('mb_clients_raw').select('id, raw').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw Object.assign(new Error('Mindbody client not found'), { status: 404 });
  return data.raw;
}

// ── New Mindbody accounts with no GHL contact ─────────────────────────────
async function mbQueue() {
  const since = new Date(Date.now() - MB_LOOKBACK_DAYS * 86400_000).toISOString().slice(0, 10);
  const [{ data: clients, error: cErr }, { data: matches }, { data: links }] = await Promise.all([
    supabase.from('mb_clients_raw')
      .select('id, first:raw->>FirstName, last:raw->>LastName, email:raw->>Email, mobile:raw->>MobilePhone, home:raw->>HomePhone, created:raw->>CreationDate, status:raw->>Status')
      .gte('raw->>CreationDate', since),
    supabase.from('ghl_mb_matches').select('mb_client_id, ghl_contact_id, checked_at'),
    supabase.from('ghl_lead_links').select('mb_client_id').not('mb_client_id', 'is', null),
  ]);
  if (cErr) throw new Error(cErr.message);
  const matchBy = Object.fromEntries((matches || []).map((m) => [m.mb_client_id, m]));
  const handled = new Set((links || []).map((l) => l.mb_client_id));
  const unmatched = (clients || []).filter((c) => matchBy[c.id] && !matchBy[c.id].ghl_contact_id && !handled.has(c.id));
  const unchecked = (clients || []).filter((c) => !matchBy[c.id] && !handled.has(c.id)).length;

  // First thing each one bought (e.g. "3 session pass") — what brought them in.
  const ids = unmatched.map((c) => c.id);
  const firstBuy = {};
  if (ids.length) {
    const { data: sales } = await supabase.from('mb_sales')
      .select('local_ts, client:raw->>ClientId, items:raw->PurchasedItems')
      .in('raw->>ClientId', ids).gte('local_ts', `${since}T00:00:00`).order('local_ts');
    for (const s of sales || []) {
      if (firstBuy[s.client]) continue;
      firstBuy[s.client] = { date: s.local_ts, items: (s.items || []).map((i) => i.Description).filter(Boolean) };
    }
  }

  return {
    lookbackDays: MB_LOOKBACK_DAYS,
    unchecked,
    clients: unmatched
      .map((c) => ({
        id: c.id,
        name: [c.first, c.last].filter(Boolean).join(' '),
        email: c.email, phone: c.mobile || c.home,
        created: c.created?.slice(0, 10), status: c.status,
        firstPurchase: firstBuy[c.id] || null,
      }))
      .sort((a, b) => String(b.created).localeCompare(String(a.created))),
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }, body: '' };
  }
  try {
    const { staff, error } = await requireStaff(event, supabase);
    if (error) return error;

    const qs = event.queryStringParameters || {};
    if (event.httpMethod === 'GET') {
      if (qs.view === 'mb-queue') return ok(await mbQueue());
      if (!ghlConfigured()) return err('GHL is not connected yet', 503);
      if (qs.view === 'notes') return ok({ notes: await listNotes(qs.contactId) });
      return err('unknown view', 400);
    }
    if (event.httpMethod !== 'POST') return err('method not allowed', 405);

    const body = JSON.parse(event.body || '{}');
    if (body.action === 'dismiss') {
      const { error: e } = await supabase.from('ghl_lead_links')
        .insert({ kind: 'dismissed', mb_client_id: String(body.mbClientId), created_by: staff.id });
      if (e) throw new Error(e.message);
      return ok({ dismissed: true });
    }

    if (!ghlConfigured()) return err('GHL is not connected yet', 503);
    switch (body.action) {
      case 'note':
        return ok({ note: await addNote(body.contactId, body.body, staff) });
      case 'add-mindbody': {
        const c = await mbClient(String(body.mbClientId));
        return ok(await createLead({
          kind: 'mindbody', staff, mbClientId: String(c.Id),
          firstName: c.FirstName, lastName: c.LastName, email: c.Email, phone: c.MobilePhone || c.HomePhone,
          note: body.note,
        }));
      }
      case 'add-referral': {
        const firstName = String(body.firstName || '').trim();
        if (!firstName || !(body.email || body.phone)) return err('First name and an email or phone are required', 400);
        return ok(await createLead({
          kind: 'referral', staff, firstName, lastName: String(body.lastName || '').trim(),
          email: body.email, phone: body.phone, referredBy: String(body.referredBy || '').trim() || null, note: body.note,
        }));
      }
      default:
        return err('unknown action', 400);
    }
  } catch (e) {
    console.error('ghl-lead:', e.message);
    return err(e.message, e.status && e.status < 500 ? e.status : 500);
  }
};
