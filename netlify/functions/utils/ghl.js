/**
 * GoHighLevel (LeadConnector) API v2 helpers.
 *
 * Auth is a sub-account Private Integration Token (GHL_TOKEN) scoped to one
 * location (GHL_LOCATION_ID). Every endpoint requires a `Version` header;
 * GHL's docs list `v3` as the only accepted value (checked 2026-10-23) —
 * override with GHL_API_VERSION if that changes.
 *
 * GHL doesn't bill per call (unlike Mindbody), but it rate-limits bursts
 * (~100 requests / 10s per location), so callers batch.
 */
import { createClient } from '@supabase/supabase-js';
import { err } from './mb-auth.js';

const GHL_BASE = 'https://services.leadconnectorhq.com';

export const LOCATION_ID = process.env.GHL_LOCATION_ID;

// Matched case-insensitively with emoji/punctuation stripped, so the
// "📈 Leads Pipeline" name in GHL matches without the emoji.
export const PIPELINE_NAME = process.env.GHL_PIPELINE_NAME || 'Leads Pipeline';

// How far back a new Mindbody account counts as "new" for the GHL match queue.
export const MB_LOOKBACK_DAYS = 60;

export function ghlConfigured() {
  return Boolean(process.env.GHL_TOKEN && LOCATION_ID);
}

let calls = 0;
export const ghlCallCount = () => calls;
export const resetGhlCallCount = () => { calls = 0; };

export async function ghlFetch(path, { method = 'GET', query, body } = {}) {
  if (!ghlConfigured()) throw new Error('GHL is not connected yet — set GHL_TOKEN and GHL_LOCATION_ID in Netlify');
  const url = new URL(`${GHL_BASE}${path}`);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  calls++;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GHL_TOKEN}`,
      Version: process.env.GHL_API_VERSION || 'v3',
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join('; ') : (data?.message || text);
    const e = new Error(`GHL ${method} ${path} failed (${res.status}): ${msg}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
export const isLeadsPipeline = (p) => normName(p?.name).includes(normName(PIPELINE_NAME));

// Stages sorted left-to-right as GHL shows them.
export function stagesOf(pipeline) {
  return (pipeline?.stages || [])
    .map((s, i) => ({ id: s.id, name: s.name, position: s.position ?? i }))
    .sort((a, b) => a.position - b.position);
}

export function opportunityRow(o, pipelineId) {
  return {
    id: o.id,
    pipeline_id: o.pipelineId || pipelineId,
    stage_id: o.pipelineStageId || null,
    status: o.status || null,
    name: o.name || o.contact?.name || null,
    contact_id: o.contactId || o.contact?.id || null,
    source: o.source || null,
    monetary_value: o.monetaryValue ?? null,
    assigned_to: o.assignedTo || null,
    created_at: o.createdAt || null,
    updated_at: o.updatedAt || null,
    last_stage_change_at: o.lastStageChangeAt || null,
    raw: o,
    synced_at: new Date().toISOString(),
  };
}

export function contactRow(c) {
  const name = c.name || c.contactName || [c.firstName, c.lastName].filter(Boolean).join(' ') || null;
  return {
    id: c.id,
    name,
    email: c.email || null,
    phone: c.phone || null,
    source: c.source || null,
    tags: Array.isArray(c.tags) ? c.tags : [],
    attribution: c.attributionSource || null,
    last_attribution: c.lastAttributionSource || null,
    date_added: c.dateAdded || null,
    raw: c,
    synced_at: new Date().toISOString(),
  };
}

// The duplicate-search response body isn't in GHL's spec; it has
// historically been { contact: {...} | null }. Accept a list too.
export async function findContact({ email, phone }) {
  const tries = [];
  if (email) tries.push(['email', { email: String(email).trim().toLowerCase() }]);
  if (phone) tries.push(['phone', { number: toE164(phone) }]);
  for (const [by, q] of tries) {
    if (!Object.values(q)[0]) continue;
    const data = await ghlFetch('/contacts/search/duplicate', { query: { locationId: LOCATION_ID, ...q } });
    const contact = data?.contact || data?.contacts?.[0] || null;
    if (contact?.id) return { contact, by };
  }
  return null;
}

// Australian numbers → +61…; anything already international is left alone.
export function toE164(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('61')) return `+${digits}`;
  if (digits.startsWith('0')) return `+61${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('4')) return `+61${digits}`;
  return digits;
}

// ── Staff auth for the write endpoints ────────────────────────────────────
export const serviceClient = () => createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Returns { staff } for an active staff member's bearer token, or { error } (a ready response). */
export async function requireStaff(event, supabase) {
  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return { error: err('Sign in required', 401) };
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) return { error: err('Sign in required', 401) };
  const { data: me } = await supabase.from('staff').select('id, full_name, role, active').eq('auth_user_id', userData.user.id).maybeSingle();
  if (!me?.active) return { error: err('Not an active staff member', 403) };
  return { staff: me };
}
