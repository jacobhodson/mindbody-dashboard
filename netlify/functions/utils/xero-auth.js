/**
 * Shared Xero API helper — token refresh + Payroll GET, used by every
 * xero-*.js function that needs live data (mirrors mb-auth.js's role for
 * Mindbody). `xero_connection` has zero RLS policies (service-role only),
 * so every caller here already runs with the service role key.
 *
 * Xero's refresh_token is single-use — each refresh call returns a brand
 * new one and invalidates the old one. getXeroAuth() always saves
 * whatever comes back, every time it refreshes, so the *next* call still
 * has a valid token to refresh with.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TOKEN_URL = 'https://identity.xero.com/connect/token';

export function parseXeroDate(s) {
  const m = /\/Date\((\d+)([+-]\d+)?\)\//.exec(s || '');
  return m ? new Date(Number(m[1])) : null;
}

// Returns { accessToken, tenantId } — refreshes and persists a new token
// pair first if the stored one is missing or expiring within 60s.
export async function getXeroAuth() {
  const { data: conn, error } = await supabase.from('xero_connection').select('*').limit(1).maybeSingle();
  if (error) throw new Error(`xero_connection read failed: ${error.message}`);
  if (!conn) throw new Error('Xero is not connected yet');

  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (conn.access_token && expiresAt > Date.now() + 60_000) {
    return { accessToken: conn.access_token, tenantId: conn.tenant_id };
  }

  const clientId     = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const basicAuth     = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Xero token refresh failed (${tokenRes.status}): ${text.slice(0, 300)}`);
  }
  const tokenData = await tokenRes.json();

  await supabase.from('xero_connection').update({
    access_token:     tokenData.access_token,
    refresh_token:    tokenData.refresh_token,
    token_expires_at: new Date(Date.now() + (tokenData.expires_in || 1800) * 1000).toISOString(),
    updated_at:       new Date().toISOString(),
  }).eq('id', conn.id);

  return { accessToken: tokenData.access_token, tenantId: conn.tenant_id };
}

export async function xeroPayrollGet(path, accessToken, tenantId) {
  const res = await fetch(`https://api.xero.com/payroll.xro/1.0${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Xero-tenant-id': tenantId, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Xero Payroll GET ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}
