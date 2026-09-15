/**
 * GET /api/xero-oauth-start
 *
 * Kicks off the Xero OAuth2 authorization-code flow — redirects the browser
 * to Xero's own login+consent screen. The actual "log in and allow access"
 * step has to be a human at a keyboard (it's Xero's login, not ours), so
 * this is a plain link a manager clicks from XeroConnection.jsx, not an API
 * call made programmatically.
 *
 * Scopes requested match exactly what the app registration at
 * developer.xero.com needs approved: offline_access (refresh tokens) +
 * read-only accounting reports/transactions (revenue) + read-only payroll
 * (employees/payruns/payslips, for wages).
 */
import { err, CORS } from './utils/mb-auth.js';

const XERO_AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize';
const REDIRECT_URI = 'https://newstrength-ops-dashboard.netlify.app/api/xero-oauth-callback';
const SCOPES = [
  'offline_access',
  'accounting.reports.read',
  'accounting.transactions.read',
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
