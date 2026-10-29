/**
 * POST /api/xero-oauth-start   (Authorization: Bearer <Supabase access token>)
 *
 * Kicks off the Xero OAuth2 authorization-code flow — returns { url } for
 * Xero's own login+consent screen, which XeroConnection.jsx then sends the
 * browser to. The actual "log in and allow access" step has to be a human at
 * a keyboard (it's Xero's login, not ours). Admins (owners) only — API
 * connections are owner-level (Settings → Integrations).
 *
 * Scopes: offline_access (refresh tokens) + read-only payroll
 * (employees/payruns/payslips, for wages) only — no accounting.* scopes.
 *
 * Wages-only was a deliberate strip-back (2026-09-20): revenue for LER
 * comes from mb-pt-analytics.js/mb-group-performance.js (already built,
 * Mindbody-sourced), and the owner has a separate P&L dashboard for
 * full company financials — Xero here is just the wages half. This also
 * sidesteps a real problem confirmed live: this Xero app's
 * `accounting.transactions.read`/`accounting.reports.read` scopes were
 * both rejected with invalid_scope (isolated one scope at a time via the
 * authorize endpoint, which errors before any login prompt for a scope
 * the app isn't configured for) — likely those two Accounting API modules
 * were never enabled on the app itself. All three payroll.* scopes were
 * individually and jointly confirmed working, hence this scope list.
 */
import { createClient } from '@supabase/supabase-js';
import { ok, err, CORS } from './utils/mb-auth.js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const XERO_AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize';
const REDIRECT_URI = 'https://newstrength-ops-dashboard.netlify.app/api/xero-oauth-callback';
const SCOPES = [
  'offline_access',
  'payroll.employees.read',
  'payroll.payruns.read',
  'payroll.payslip.read',
].join(' ');

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }, body: '' };
  }

  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  const { data: userData } = token ? await supabase.auth.getUser(token) : { data: null };
  if (!userData?.user) return err('Sign in required', 401);
  const { data: me } = await supabase.from('staff').select('role, active').eq('auth_user_id', userData.user.id).maybeSingle();
  if (!me?.active || me.role !== 'admin') return err('Only an admin (owner) can connect Xero', 403);

  const clientId = process.env.XERO_CLIENT_ID;
  if (!clientId) return err('XERO_CLIENT_ID not configured', 503);

  // Single-org account confirmed with the owner (2026-09-20) — no need to
  // disambiguate multiple Xero tenants after authorization.
  const url = new URL(XERO_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', Math.random().toString(36).slice(2));

  return ok({ url: url.toString() });
};
