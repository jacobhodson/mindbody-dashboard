/**
 * POST /api/slack-publish   (Authorization: Bearer <Supabase access token>)
 * Body: { note_id }
 *
 * Posts one client note to the #client-headlines Slack channel through a
 * Slack Incoming Webhook (env SLACK_CLIENT_HEADLINES_WEBHOOK — created in the
 * Slack app's "Incoming Webhooks" page, bound to #client-headlines). Any
 * active staff member can publish any note they can see; the note's
 * slack_posted_at/slack_posted_by are stamped so the UI shows it went out.
 * Re-publishing is allowed (the button asks first).
 */
import { createClient } from '@supabase/supabase-js';
import { ok, err } from './utils/mb-auth.js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PROD_URL = 'https://newstrength-ops-dashboard.netlify.app';

async function caller(event) {
  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: me } = await supabase.from('staff').select('id, full_name, active').eq('auth_user_id', data.user.id).maybeSingle();
  return me?.active ? me : null;
}

// Slack mrkdwn: escape &<>, then map our **bold** / *italic* / _underline_
// markers (richText.js) to Slack's *bold* / _italic_ (no underline in Slack).
function toSlack(text) {
  const escaped = String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g, (_, b, i, u) => {
    if (b !== undefined) return `*${b}*`;
    if (i !== undefined) return `_${i}_`;
    return u;
  });
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } };
  }
  if (event.httpMethod !== 'POST') return err('POST only', 405);

  const webhook = process.env.SLACK_CLIENT_HEADLINES_WEBHOOK;
  if (!webhook) return err('Slack is not connected yet — SLACK_CLIENT_HEADLINES_WEBHOOK is not set', 503);

  const me = await caller(event);
  if (!me) return err('Sign in required', 401);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err('Bad JSON', 400); }
  if (!body.note_id) return err('note_id required', 400);

  const { data: note, error: noteErr } = await supabase
    .from('client_notes')
    .select('id, note, staff_id, created_at, client:clients(first_name, last_name, mindbody_id), author:staff!client_notes_staff_id_fkey(full_name)')
    .eq('id', body.note_id)
    .maybeSingle();
  if (noteErr) return err(noteErr.message);
  if (!note) return err('Note not found', 404);

  const clientName = [note.client?.first_name, note.client?.last_name].filter(Boolean).join(' ') || 'Client';
  const author = note.author?.full_name || 'Staff';
  const origin = event.headers.origin && /netlify\.app$|localhost:\d+$/.test(event.headers.origin) ? event.headers.origin : PROD_URL;
  const fallback = `${clientName} — ${note.note}`.slice(0, 300);

  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: fallback,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `*${toSlack(clientName)}*` } },
        { type: 'section', text: { type: 'mrkdwn', text: toSlack(note.note).slice(0, 2900) } },
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `Note by ${toSlack(author)}${me.id !== note.staff_id ? ` · shared by ${toSlack(me.full_name)}` : ''} · <${origin}|Ops Dashboard>`,
          }],
        },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return err(`Slack rejected the post (${res.status}${detail ? `: ${detail}` : ''})`, 502);
  }

  const postedAt = new Date().toISOString();
  await supabase.from('client_notes').update({ slack_posted_at: postedAt, slack_posted_by: me.id }).eq('id', note.id);
  return ok({ ok: true, slack_posted_at: postedAt, slack_posted_by: me.id });
};
