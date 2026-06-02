/**
 * Contact tracking endpoint.
 *
 * The Mindbody write endpoints (/client/addclientcontactlog, /client/addclientnote)
 * return 404 on this API plan, so logging is handled client-side only.
 * This endpoint is kept as a no-op stub so the frontend call doesn't error.
 *
 * POST /api/mb-contact-client
 * Body: { clientId: string, note?: string }
 * Returns: { logged: false, method: 'session-only' }
 */
import { CORS } from './utils/mb-auth.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ logged: false, method: 'session-only' }),
  };
};
