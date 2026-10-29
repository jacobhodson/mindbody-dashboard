/**
 * POST /api/staff-admin   (Authorization: Bearer <Supabase access token>)
 * Body: { action, ...args }
 *
 * The Settings tab's server half — everything that touches Supabase Auth
 * itself (creating logins, changing a login email, blocking a login), which
 * the browser's anon key can't do. Plain staff-row edits (name, role,
 * is_coach) go straight from the browser and are policed by RLS plus the
 * staff_guard_update trigger; this function re-applies the same rules
 * because the service role bypasses that trigger.
 *
 * Actions:
 *   invite        { full_name, email, role, is_coach }   managers
 *   login-link    { staff_id }                           managers — set-password link
 *   change-email  { staff_id, email, current_password? } self (needs password) or managers
 *   set-active    { staff_id, active }                   managers — deactivate blocks login
 *   forgot-password { email }                            anyone, no auth — always "ok"
 *
 * Links are emailed through Resend (same sender as the weekly digest) and
 * also returned to the manager, so they can be texted if an email bounces.
 */
import { createClient } from '@supabase/supabase-js';
import { ok, err, CORS } from './utils/mb-auth.js';
import { sendEmail } from './weekly-digest.js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PROD_URL = 'https://newstrength-ops-dashboard.netlify.app';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Where a set-password link lands: the site the request came from, if it's
// ours (prod, a deploy preview or local dev), else production.
function siteUrl(event) {
  const origin = event.headers.origin || '';
  if (/^https:\/\/([a-z0-9-]+--)?newstrength-ops-dashboard\.netlify\.app$/.test(origin)) return origin;
  if (/^http:\/\/localhost:\d+$/.test(origin)) return origin;
  return PROD_URL;
}

// Our own link straight to the dashboard, carrying Supabase's hashed token;
// App.jsx exchanges it with verifyOtp(). This avoids Supabase's /verify
// redirect, which only honours URLs on the project's Auth redirect allowlist
// (and otherwise falls back to the Site URL — localhost on this project).
function appLink(event, data, type) {
  const url = new URL(siteUrl(event));
  url.searchParams.set('auth', type);
  url.searchParams.set('token_hash', data.properties.hashed_token);
  return url.toString();
}

async function caller(event) {
  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: me } = await supabase.from('staff').select('*').eq('auth_user_id', data.user.id).maybeSingle();
  return me?.active ? me : null;
}

const isManagerRole = (r) => r === 'manager' || r === 'admin';

async function loadTarget(staffId) {
  const { data } = await supabase.from('staff').select('*').eq('id', staffId).maybeSingle();
  if (!data) throw Object.assign(new Error('Staff member not found'), { status: 404 });
  return data;
}

// Managers can act on anyone except an admin; only admins act on admins.
function assertCanManage(me, target) {
  if (!isManagerRole(me.role)) throw Object.assign(new Error('Managers only'), { status: 403 });
  if (target.role === 'admin' && me.role !== 'admin') {
    throw Object.assign(new Error('Only an admin (owner) can change an admin'), { status: 403 });
  }
}

async function emailLink({ to, name, link, kind }) {
  const { data: settings } = await supabase.from('app_settings').select('business_name, system_name').maybeSingle();
  const app = `${settings?.business_name || 'Newstrength'} ${settings?.system_name || 'Operations Dashboard'}`;
  const invite = kind === 'invite';
  const subject = invite ? `You've been added to the ${app}` : `Set a new password for the ${app}`;
  const intro = invite
    ? `You've been given access to the ${app}. Click below to choose your password and sign in.`
    : `Click below to set a new password for the ${app}. If you didn't ask for this, you can ignore this email.`;
  const button = invite ? 'Set up my login' : 'Set new password';
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#111">
    <p>Hi ${escapeHtml(name || 'there')},</p><p>${intro}</p>
    <p style="margin:28px 0"><a href="${link}" style="background:#059669;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${button}</a></p>
    <p style="font-size:12px;color:#666">This link works once and expires in 24 hours.</p></div>`;
  const text = `Hi ${name || 'there'},\n\n${intro}\n\n${link}\n\nThis link works once and expires in 24 hours.`;
  try {
    await sendEmail({ to, subject, html, text });
    return true;
  } catch (e) {
    console.error('staff-admin email:', e.message);
    return false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function invite(me, body, event) {
  if (!isManagerRole(me.role)) throw Object.assign(new Error('Managers only'), { status: 403 });
  const full_name = (body.full_name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const role = body.role || 'coach';
  if (!full_name) throw Object.assign(new Error('Name is required'), { status: 400 });
  if (!EMAIL_RE.test(email)) throw Object.assign(new Error('Enter a valid email'), { status: 400 });
  if (!['coach', 'manager', 'admin'].includes(role)) throw Object.assign(new Error('Unknown role'), { status: 400 });
  if (role === 'admin' && me.role !== 'admin') throw Object.assign(new Error('Only an admin (owner) can add an admin'), { status: 403 });

  const { data: existing } = await supabase.from('staff').select('id, auth_user_id').ilike('email', email).maybeSingle();
  if (existing?.auth_user_id) throw Object.assign(new Error('Someone with that email already has a login'), { status: 409 });

  // Creates the auth user; on_auth_user_created then creates (or links) the
  // staff row with role 'coach', which is corrected just below.
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'invite', email,
    options: { data: { full_name } },
  });
  if (error) throw Object.assign(new Error(error.message), { status: 400 });

  const { data: row, error: upErr } = await supabase.from('staff')
    .update({ full_name, role, is_coach: body.is_coach !== false, active: true })
    .eq('auth_user_id', data.user.id).select().single();
  if (upErr) throw new Error(upErr.message);

  const link = appLink(event, data, 'invite');
  const emailed = await emailLink({ to: email, name: full_name, link, kind: 'invite' });
  return { staff: row, link, emailed };
}

async function loginLink(me, body, event) {
  const target = await loadTarget(body.staff_id);
  assertCanManage(me, target);
  if (!target.active) throw Object.assign(new Error('Reactivate them first'), { status: 400 });

  // Never signed in → resend the invite; otherwise a password-reset link.
  const { data: authUser } = target.auth_user_id
    ? await supabase.auth.admin.getUserById(target.auth_user_id)
    : { data: null };
  const neverSignedIn = !authUser?.user?.last_sign_in_at;
  const type = neverSignedIn && !authUser?.user ? 'invite' : 'recovery';
  const { data, error } = await supabase.auth.admin.generateLink({ type, email: target.email });
  if (error) throw Object.assign(new Error(error.message), { status: 400 });

  const link = appLink(event, data, type);
  const emailed = await emailLink({ to: target.email, name: target.full_name, link, kind: neverSignedIn ? 'invite' : 'recovery' });
  return { link, emailed };
}

async function changeEmail(me, body) {
  const target = await loadTarget(body.staff_id);
  const email = (body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw Object.assign(new Error('Enter a valid email'), { status: 400 });

  if (target.id === me.id) {
    // Re-check the password so an unattended signed-in laptop can't be used
    // to take over someone's login.
    const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { error } = await anon.auth.signInWithPassword({ email: target.email, password: body.current_password || '' });
    if (error) throw Object.assign(new Error('Current password is incorrect'), { status: 400 });
  } else {
    assertCanManage(me, target);
  }

  const { data: clash } = await supabase.from('staff').select('id').ilike('email', email).neq('id', target.id).maybeSingle();
  if (clash) throw Object.assign(new Error('Another staff member already uses that email'), { status: 409 });

  if (target.auth_user_id) {
    const { error } = await supabase.auth.admin.updateUserById(target.auth_user_id, { email, email_confirm: true });
    if (error) throw Object.assign(new Error(error.message), { status: 400 });
  }
  const { data: row, error: upErr } = await supabase.from('staff').update({ email }).eq('id', target.id).select().single();
  if (upErr) throw new Error(upErr.message);
  return { staff: row };
}

async function setActive(me, body) {
  const target = await loadTarget(body.staff_id);
  assertCanManage(me, target);
  const active = !!body.active;
  if (target.id === me.id) throw Object.assign(new Error("You can't deactivate yourself"), { status: 400 });
  if (!active && target.role === 'admin') {
    const { count } = await supabase.from('staff').select('id', { count: 'exact', head: true })
      .eq('role', 'admin').eq('active', true).neq('id', target.id);
    if (!count) throw Object.assign(new Error('There must always be at least one admin'), { status: 400 });
  }

  if (target.auth_user_id) {
    const { error } = await supabase.auth.admin.updateUserById(target.auth_user_id, { ban_duration: active ? 'none' : '876000h' });
    if (error) throw Object.assign(new Error(error.message), { status: 400 });
  }
  const { data: row, error: upErr } = await supabase.from('staff').update({ active }).eq('id', target.id).select().single();
  if (upErr) throw new Error(upErr.message);
  return { staff: row };
}

async function forgotPassword(body, event) {
  const email = (body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: true };
  const { data: target } = await supabase.from('staff').select('full_name, email, active, auth_user_id').ilike('email', email).maybeSingle();
  // Same answer whether or not the email exists, so this can't be used to
  // find out who works here.
  if (!target?.active || !target.auth_user_id) return { ok: true };
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery', email: target.email,
  });
  if (!error) await emailLink({ to: target.email, name: target.full_name, link: appLink(event, data, 'recovery'), kind: 'recovery' });
  return { ok: true };
}

export const handler = async (event) => {
  const headers = { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return err('POST only', 405);

  try {
    const body = JSON.parse(event.body || '{}');
    if (body.action === 'forgot-password') return ok(await forgotPassword(body, event));

    const me = await caller(event);
    if (!me) return err('Sign in required', 401);

    switch (body.action) {
      case 'invite':       return ok(await invite(me, body, event));
      case 'login-link':   return ok(await loginLink(me, body, event));
      case 'change-email': return ok(await changeEmail(me, body));
      case 'set-active':   return ok(await setActive(me, body));
      default:             return err('Unknown action', 400);
    }
  } catch (e) {
    console.error('staff-admin:', e);
    return err(e.message, e.status || 500);
  }
};
