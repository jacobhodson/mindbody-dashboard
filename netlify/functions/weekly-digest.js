/**
 * Weekly email digest — see utils/digest-build.js for what's in it.
 *
 * Two ways in:
 *  - Sunday send:  GET /api/weekly-digest?key=<DIGEST_CRON_SECRET>
 *      Called by pg_cron at 07:00 and 08:00 UTC on Sundays; only sends during
 *      the 6pm hour in Sydney (so exactly one of the two runs does anything,
 *      whatever daylight saving is doing). &force=1 skips the time check.
 *      Everyone active with an email who hasn't switched it off gets one;
 *      digest_sends (unique per person per week) stops double sends.
 *      &test_for=<staff id> instead emails just that person a preview.
 *  - Preview:      POST /api/weekly-digest?mode=preview  (Authorization: Bearer <Supabase JWT>)
 *      Returns { subject, html } for the caller's own digest — managers can
 *      pass &for=<staff id> to see someone else's. &send=1 also emails it to
 *      the caller's own address (never to the person previewed, never logged).
 *
 * Email goes out through Resend (RESEND_API_KEY, DIGEST_FROM).
 */
import { createClient } from '@supabase/supabase-js';
import { ok, err, CORS } from './utils/mb-auth.js';
import { sydneyNow, upcomingSunday, digestWindows, loadDigestData, digestContent, renderDigest } from './utils/digest-build.js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const FROM = process.env.DIGEST_FROM || 'Newstrength <team@newstrength.com.au>';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function sendEmail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('Email sending is not set up yet (RESEND_API_KEY missing)');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.message || JSON.stringify(body).slice(0, 200)}`);
  return body.id;
}

async function caller(event) {
  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: me } = await supabase.from('staff').select('id, full_name, email, role, active').eq('auth_user_id', data.user.id).maybeSingle();
  return me?.active ? me : null;
}

export async function runWeeklySend({ force = false } = {}) {
  const now = sydneyNow();
  if (!force && !(now.weekday === 'Sun' && now.hour === 18)) {
    return { skipped: true, reason: `Not Sunday 6pm in Sydney (${now.weekday} ${now.hour}:00)` };
  }
  const win = digestWindows(now.date);
  const data = await loadDigestData(supabase, win);
  const { data: already } = await supabase.from('digest_sends').select('staff_id').eq('week_start', win.weekStart);
  const sentIds = new Set((already || []).map((r) => r.staff_id));

  const results = { week_start: win.weekStart, sent: 0, skipped: 0, failed: [] };
  for (const person of data.staff) {
    if (!person.email || data.prefOff.has(person.id) || sentIds.has(person.id)) { results.skipped += 1; continue; }
    try {
      const mail = renderDigest(digestContent(person, data, win), win);
      // Claim the week first so a retry or the second cron slot can't double-send.
      const { error: claimErr } = await supabase.from('digest_sends')
        .insert({ staff_id: person.id, week_start: win.weekStart, email: person.email });
      if (claimErr) { results.skipped += 1; continue; }
      try {
        const id = await sendEmail({ to: person.email, ...mail });
        await supabase.from('digest_sends').update({ resend_id: id }).eq('staff_id', person.id).eq('week_start', win.weekStart);
        results.sent += 1;
      } catch (e) {
        // Release the claim so a later run can try again.
        await supabase.from('digest_sends').delete().eq('staff_id', person.id).eq('week_start', win.weekStart);
        throw e;
      }
      await sleep(600); // Resend allows ~2 requests/second
    } catch (e) {
      console.error('weekly-digest send', person.id, e.message);
      results.failed.push({ staff_id: person.id, error: e.message });
    }
  }
  return results;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }, body: '' };
  }
  const qs = event.queryStringParameters || {};
  try {
    if (qs.mode === 'preview') {
      const me = await caller(event);
      if (!me) return err('Sign in required', 401);
      const isManager = me.role === 'manager' || me.role === 'admin';
      const win = digestWindows(upcomingSunday(sydneyNow().date));
      const data = await loadDigestData(supabase, win);
      const targetId = isManager && qs.for ? qs.for : me.id;
      const person = data.staff.find((s) => s.id === targetId);
      if (!person) return err('No such team member', 404);
      const mail = renderDigest(digestContent(person, data, win), win, { preview: true });
      if (qs.send === '1') {
        if (!me.email) return err('You have no email address on file', 400);
        await sendEmail({ to: me.email, subject: `[Preview] ${mail.subject}`, html: mail.html, text: mail.text });
        return ok({ sent: true, to: me.email });
      }
      return ok({ subject: mail.subject, html: mail.html });
    }

    const secret = process.env.DIGEST_CRON_SECRET;
    if (!secret || qs.key !== secret) return err('Forbidden', 403);
    // &test_for=<staff id>: email that one person their own digest as a
    // preview (not logged, ignores the Sunday gate and their on/off setting).
    if (qs.test_for) {
      const win = digestWindows(upcomingSunday(sydneyNow().date));
      const data = await loadDigestData(supabase, win);
      const person = data.staff.find((s) => s.id === qs.test_for);
      if (!person?.email) return err('No such team member with an email', 404);
      const mail = renderDigest(digestContent(person, data, win), win, { preview: true });
      const id = await sendEmail({ to: person.email, subject: `[Preview] ${mail.subject}`, html: mail.html, text: mail.text });
      return ok({ sent: true, to: person.email, resend_id: id });
    }
    return ok(await runWeeklySend({ force: qs.force === '1' }));
  } catch (e) {
    console.error('weekly-digest:', e);
    return err(e.message);
  }
};
