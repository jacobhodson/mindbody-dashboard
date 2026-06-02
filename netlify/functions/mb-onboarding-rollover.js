/**
 * Persist membership rollover decisions in Netlify Blobs.
 *
 * GET  /api/mb-onboarding-rollover
 *   → { decisions: { [clientId]: { decision: 'rollover'|'no-rollover', decidedAt: ISO } } }
 *
 * POST /api/mb-onboarding-rollover  { clientId, decision: 'rollover'|'no-rollover'|null }
 *   → null decision clears/undoes the decision
 *   → { decisions: { ... } }
 */
import { getStore } from '@netlify/blobs';
import { ok, err, CORS } from './utils/mb-auth.js';

const STORE_KEY = 'decisions';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const store = getStore('onboarding-rollover');

    if (event.httpMethod === 'GET') {
      const raw = await store.get(STORE_KEY);
      return ok({ decisions: raw ? JSON.parse(raw) : {} });
    }

    if (event.httpMethod === 'POST') {
      const { clientId, decision } = JSON.parse(event.body || '{}');
      if (!clientId) return err('clientId is required', 400);

      const raw       = await store.get(STORE_KEY);
      const decisions = raw ? JSON.parse(raw) : {};
      const id        = String(clientId);

      if (!decision) {
        delete decisions[id];   // Undo
      } else if (decision === 'rollover' || decision === 'no-rollover') {
        decisions[id] = { decision, decidedAt: new Date().toISOString() };
      } else {
        return err('decision must be "rollover", "no-rollover", or null', 400);
      }

      await store.set(STORE_KEY, JSON.stringify(decisions));
      return ok({ decisions });
    }

    return err('Method not allowed', 405);
  } catch (e) {
    console.error('mb-onboarding-rollover:', e);
    return err(e.message);
  }
};
