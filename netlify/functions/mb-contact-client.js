/**
 * POST /api/mb-contact-client
 * Body: { clientId, clientName?, note? }
 *
 * Appends a contact log entry to Netlify Blobs (persistent, cross-device).
 * Each client has a key in the 'contact-logs' store containing an array of
 * { at: ISO string, note: string, name: string } entries.
 */
import { getStore } from '@netlify/blobs';
import { ok, err, CORS } from './utils/mb-auth.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  try {
    const { clientId, clientName = '', note = '' } = JSON.parse(event.body || '{}');
    if (!clientId) return err('clientId is required', 400);

    const store = getStore('contact-logs');
    const raw   = await store.get(String(clientId));
    const logs  = raw ? JSON.parse(raw) : [];

    const entry = { at: new Date().toISOString(), note, name: clientName };
    logs.push(entry);

    await store.set(String(clientId), JSON.stringify(logs));

    return ok({ logged: true, entry, total: logs.length });
  } catch (e) {
    console.error('mb-contact-client:', e);
    return err(e.message);
  }
};
