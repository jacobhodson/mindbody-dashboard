/**
 * GHL → cancellation notice (2026-10-26).
 *
 * A GHL workflow — trigger "Contact Tag added: cancellation notice given",
 * action "Webhook" — POSTs here as
 *   /api/ghl-cancellation?key=$GHL_WEBHOOK_SECRET
 * (or with an `x-webhook-secret` header). GHL's standard webhook body carries
 * the contact (contact_id, full_name, email, phone, …) plus any Custom Data
 * set on the action; a `reason` key there becomes the notice's reason.
 *
 * Each notice = one Scoreboard Churn on the (Sydney) day it arrives; repeats
 * are stored but not counted (see recordNotice in utils/metric-sync.js).
 */
import { timingSafeEqual } from 'node:crypto';
import { ok, err } from './utils/mb-auth.js';
import { serviceClient } from './utils/ghl.js';
import { sydneyDate, syncChurn, refreshChurnReview, recordNotice } from './utils/metric-sync.js';

const supabase = serviceClient();
function secretMatches(given) {
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret || !given) return false;
  const a = Buffer.from(String(given)), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// Reason: Custom Data `reason`, else any top-level field whose name mentions
// "reason" (form answers arrive keyed by their question label).
function reasonOf(body) {
  const custom = body.customData || body.custom_data || {};
  if (str(custom.reason)) return str(custom.reason);
  for (const [k, v] of Object.entries({ ...body, ...custom })) {
    if (/reason/i.test(k) && str(v)) return str(v);
  }
  return null;
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return err('method not allowed', 405);
  const given = event.headers?.['x-webhook-secret'] || event.queryStringParameters?.key;
  if (!secretMatches(given)) return err('Unauthorized', 401);

  try {
    const body = JSON.parse(event.body || '{}');
    const contact = body.contact || {};
    const ghlContactId = str(body.contact_id) || str(body.contactId) || str(contact.id);
    const email = str(body.email) || str(contact.email);
    const phone = str(body.phone) || str(contact.phone);
    const name = str(body.full_name) || str(contact.name)
      || [str(body.first_name), str(body.last_name)].filter(Boolean).join(' ') || null;
    if (!ghlContactId && !email && !phone) return err('No contact in webhook body', 400);

    const notice = await recordNotice(supabase, {
      noticeDate: sydneyDate(Date.now()), source: 'ghl',
      ghlContactId, name, email, phone, reason: reasonOf(body), payload: body,
    });
    const review = await refreshChurnReview(supabase);
    const churn = await syncChurn(supabase);
    console.log('[ghl-cancellation]', notice.duplicate_of ? 'duplicate' : 'counted', JSON.stringify({ review, churn }));
    return ok({ id: notice.id, counted: !notice.duplicate_of });
  } catch (e) {
    console.error('[ghl-cancellation] failed:', e.message);
    return err(e.message);
  }
};
