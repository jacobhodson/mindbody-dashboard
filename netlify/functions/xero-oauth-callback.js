/**
 * GET /api/xero-oauth-callback
 *
 * Xero redirects here after a manager approves access, with ?code=...
 * Exchanges that code for an access/refresh token pair, looks up which
 * organization (Xero calls it a "tenant") was actually connected, and
 * stores the connection in `xero_connection` — a single row (this account
 * only ever connects to one Xero org), service-role-only, never exposed to
 * the browser (see its migration for why: RLS enabled with zero policies).
 *
 * A refresh_token from Xero is only valid until first use — the *next*
 * refresh call gets a brand new one and the old one stops working, so
 * every future token refresh (xero-client.js, not built yet) must save
 * whatever refresh_token comes back each time, not just the first one.
 */
import { createClient } from '@supabase/supabase-js';
import { err, CORS } from './utils/mb-auth.js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TOKEN_URL       = 'https://identity.xero.com/connect/token';
const CONNECTIONS_URL = 'https://api.xero.com/connections';
const REDIRECT_URI    = 'https://newstrength-ops-dashboard.netlify.app/api/xero-oauth-callback';

function htmlResponse(title, message, ok = true) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: `<html><body style="font-family:-apple-system,sans-serif;padding:60px 20px;text-align:center;color:#111827;">
      <h2 style="color:${ok ? '#059669' : '#dc2626'}">${title}</h2>
      <p style="color:#4b5563;max-width:420px;margin:0 auto;">${message}</p>
      <p style="color:#9ca3af;font-size:13px;margin-top:24px;">You can close this tab and return to the dashboard.</p>
    </body></html>`,
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const { code, error: xeroError } = event.queryStringParameters || {};
  if (xeroError) return htmlResponse('Xero authorization was not completed', xeroError, false);
  if (!code) return htmlResponse('Missing authorization code', 'Xero did not send back a code — try connecting again.', false);

  const clientId     = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) return err('Xero client credentials not configured', 503);

  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('xero-oauth-callback token exchange failed:', tokenRes.status, text);
      return htmlResponse('Token exchange failed', `Xero returned ${tokenRes.status}. Check the function logs for details.`, false);
    }
    const { access_token, refresh_token, expires_in } = await tokenRes.json();

    const connRes = await fetch(CONNECTIONS_URL, { headers: { Authorization: `Bearer ${access_token}` } });
    const connections = await connRes.json();
    const tenant = Array.isArray(connections) ? connections[0] : null;
    if (!tenant) return htmlResponse('No organization found', 'The token exchange worked, but Xero reported no connected organization.', false);

    const payload = {
      tenant_id:        tenant.tenantId,
      tenant_name:       tenant.tenantName,
      access_token,
      refresh_token,
      token_expires_at: new Date(Date.now() + (expires_in || 1800) * 1000).toISOString(),
      updated_at:        new Date().toISOString(),
    };

    // Single-row model — update in place if a connection already exists
    // (e.g. reconnecting) rather than risking a delete-then-insert leaving
    // zero rows if the insert half fails.
    const { data: existing } = await supabase.from('xero_connection').select('id').limit(1).maybeSingle();
    const { error: writeErr } = existing
      ? await supabase.from('xero_connection').update(payload).eq('id', existing.id)
      : await supabase.from('xero_connection').insert(payload);

    if (writeErr) {
      console.error('xero-oauth-callback DB write failed:', writeErr.message);
      return htmlResponse('Connected, but failed to save', writeErr.message, false);
    }

    return htmlResponse('Xero connected', `Connected to <strong>${tenant.tenantName}</strong>.`);
  } catch (e) {
    console.error('xero-oauth-callback:', e);
    return htmlResponse('Something went wrong', e.message, false);
  }
};
