/**
 * GET /api/xero-status
 *
 * Read-only connection summary for XeroConnection.jsx — deliberately
 * returns only tenant_name/connected_at, never the tokens themselves.
 * `xero_connection` has no RLS policies at all (service-role only), so
 * this thin function is the one sanctioned way the browser learns
 * whether a connection exists.
 */
import { createClient } from '@supabase/supabase-js';
import { ok, err, CORS } from './utils/mb-auth.js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const { data, error } = await supabase
    .from('xero_connection')
    .select('tenant_name, connected_at, token_expires_at')
    .limit(1)
    .maybeSingle();
  if (error) return err(error.message);

  return ok({
    connected:     !!data,
    tenantName:    data?.tenant_name || null,
    connectedAt:   data?.connected_at || null,
    tokenExpiresAt: data?.token_expires_at || null,
  });
};
