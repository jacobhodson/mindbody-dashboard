/**
 * Logs a "contacted via dashboard" note against a client record in Mindbody.
 *
 * POST /api/mb-contact-client
 * Body: { clientId: string, note?: string }
 *
 * Uses POST /client/addclientcontactlog (Mindbody API v6).
 * If your Mindbody plan does not include this endpoint, the function returns
 * a 200 with { logged: false, reason: "..." } instead of failing loudly —
 * the frontend treats both as success for the contacted-badge UX.
 */
import { getStaffToken, mbPost, ok, err, CORS } from './utils/mb-auth.js';
import { format } from 'date-fns';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  try {
    const { clientId, note } = JSON.parse(event.body || '{}');
    if (!clientId) return err('clientId is required', 400);

    const token = await getStaffToken();
    const now = new Date();

    try {
      await mbPost('/client/addclientcontactlog', token, {
        ClientId: clientId,
        ContactMethod: 'Other',
        Contacted: format(now, "yyyy-MM-dd'T'HH:mm:ss"),
        Comments: note || `Re-engagement outreach logged via Operations Dashboard — ${format(now, 'dd MMM yyyy, h:mm a')}`,
        FollowUpDate: format(
          new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          "yyyy-MM-dd'T'00:00:00"
        ),
      });
      return ok({ logged: true, clientId });
    } catch (logErr) {
      // Endpoint may not be available on all Mindbody plans — soft-fail
      console.warn('Contact log endpoint unavailable:', logErr.message);
      return ok({ logged: false, reason: logErr.message, clientId });
    }
  } catch (e) {
    console.error('mb-contact-client:', e);
    return err(e.message);
  }
};
