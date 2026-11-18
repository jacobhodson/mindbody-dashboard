/**
 * POST /api/slack-publish   (Authorization: Bearer <Supabase access token>)
 * Body: { note_id } | { strategy_session_id }
 *
 * Posts one client note or strategy session to Slack through an Incoming
 * Webhook, one per channel (created in the Slack app's "Incoming Webhooks"
 * page, each bound to its channel):
 *   client notes       → SLACK_CLIENT_HEADLINES_WEBHOOK  (#client-headlines)
 *   strategy sessions  → SLACK_STRATEGY_SESSIONS_WEBHOOK
 * Any active staff member can publish anything they can see; the row's
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

// Each publishable kind: its table, webhook env var, the select that loads
// the row with client + author (staff embed must name the FK — these tables
// have a second staff FK, slack_posted_by), and how to word the post.
const KINDS = {
  note: {
    table: 'client_notes',
    env: 'SLACK_CLIENT_HEADLINES_WEBHOOK',
    select: 'id, note, staff_id, client:clients(first_name, last_name), author:staff!client_notes_staff_id_fkey(full_name)',
    text: (row) => row.note,
    heading: (name) => `*${name}*`,
    byline: 'Note by',
  },
  strategy: {
    table: 'strategy_sessions',
    env: 'SLACK_STRATEGY_SESSIONS_WEBHOOK',
    select: 'id, notes, session_date, staff_id, client:clients(first_name, last_name), author:staff!strategy_sessions_staff_id_fkey(full_name)',
    text: (row) => row.notes || 'No notes recorded.',
    heading: (name, row) => `*Strategy session — ${name}* · ${fmtDay(row.session_date)}`,
    byline: 'Logged by',
  },
};

function fmtDay(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
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

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return err('Bad JSON', 400); }
  const kindKey = body.strategy_session_id ? 'strategy' : body.note_id ? 'note' : null;
  if (!kindKey) return err('note_id or strategy_session_id required', 400);
  const kind = KINDS[kindKey];
  const id = body.strategy_session_id || body.note_id;

  const webhook = process.env[kind.env];
  if (!webhook) return err(`Slack is not connected yet — ${kind.env} is not set`, 503);

  const me = await caller(event);
  if (!me) return err('Sign in required', 401);

  const { data: row, error: rowErr } = await supabase.from(kind.table).select(kind.select).eq('id', id).maybeSingle();
  if (rowErr) return err(rowErr.message);
  if (!row) return err('Not found', 404);

  const clientName = [row.client?.first_name, row.client?.last_name].filter(Boolean).join(' ') || 'Client';
  const author = row.author?.full_name || 'Staff';
  const origin = event.headers.origin && /netlify\.app$|localhost:\d+$/.test(event.headers.origin) ? event.headers.origin : PROD_URL;
  const fallback = `${clientName} — ${kind.text(row)}`.slice(0, 300);

  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: fallback,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: kind.heading(toSlack(clientName), row) } },
        { type: 'section', text: { type: 'mrkdwn', text: toSlack(kind.text(row)).slice(0, 2900) } },
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `${kind.byline} ${toSlack(author)}${me.id !== row.staff_id ? ` · shared by ${toSlack(me.full_name)}` : ''} · <${origin}|Ops Dashboard>`,
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
  await supabase.from(kind.table).update({ slack_posted_at: postedAt, slack_posted_by: me.id }).eq('id', row.id);
  return ok({ ok: true, slack_posted_at: postedAt, slack_posted_by: me.id });
};
