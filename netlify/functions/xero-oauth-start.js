/**
 * GET /api/xero-oauth-start
 *
 * Kicks off the Xero OAuth2 authorization-code flow — redirects the browser
 * to Xero's own login+consent screen. The actual "log in and allow access"
 * step has to be a human at a keyboard (it's Xero's login, not ours), so
 * this is a plain link a manager clicks from XeroConnection.jsx, not an API
 * call made programmatically.
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
import { err, CORS } from './utils/mb-auth.js';

const XERO_AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize';
const REDIRECT_URI = 'https://newstrength-ops-dashboard.netlify.app/api/xero-oauth-callback';
const SCOPES = [
  'offline_access',
  'payroll.employees.read',
  'payroll.payruns.read',
  'payroll.payslip.read',
].join(' ');

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

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

  return {
    statusCode: 302,
    headers: { Location: url.toString() },
    body: '',
  };
};
