/**
 * GET /api/mb-contact-logs?recent=true
 *   → { contacted: { clientId: { at, note, name } } }  (only those within last 7 days)
 *
 * GET /api/mb-contact-logs?clientId=XXX
 *   → { logs: [{ at, note, name }, …] }  (full history for one client)
 */
import { getStore } from '@netlify/blobs';
import { ok, err, CORS } from './utils/mb-auth.js';

const DAYS_7 = 7 * 24 * 60 * 60 * 1000;

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const store    = getStore('contact-logs');
    const { clientId, recent } = event.queryStringParameters || {};

    // ── Single client history ─────────────────────────────────────────────────
    if (clientId) {
      const raw  = await store.get(String(clientId));
      const logs = raw ? JSON.parse(raw) : [];
      return ok({ clientId, logs });
    }

    // ── Recently contacted (last 7 days) ──────────────────────────────────────
    if (recent === 'true') {
      const cutoff = Date.now() - DAYS_7;
      const { blobs } = await store.list();

      const contacted = {};
      await Promise.all(
        blobs.map(async (blob) => {
          const raw = await store.get(blob.key);
          if (!raw) return;
          const logs = JSON.parse(raw);
          // Find the most recent entry within the 7-day window
          const recent = logs
            .filter((l) => new Date(l.at).getTime() > cutoff)
            .sort((a, b) => new Date(b.at) - new Date(a.at));
          if (recent.length > 0) contacted[blob.key] = recent[0];
        })
      );

      return ok({ contacted });
    }

    return err('Provide ?clientId=X or ?recent=true');
  } catch (e) {
    console.error('mb-contact-logs:', e);
    return err(e.message);
  }
};
