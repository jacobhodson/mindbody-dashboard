/**
 * Logs a contact note against a client record in Mindbody.
 *
 * POST /api/mb-contact-client
 * Body: { clientId: string, note?: string }
 *
 * Strategy:
 *  1. Try POST /client/addclientcontactlog  (shows in Client → Contact Log tab)
 *  2. Fall back to POST /client/updateclientservices (if above is 404/403)
 *  3. Fall back to POST /client/addclientnote
 *
 * Returns { logged: bool, method: string, message: string }
 * so the frontend can show the user exactly what happened.
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
    const now   = new Date();
    const dateStr = format(now, "yyyy-MM-dd'T'HH:mm:ss");
    const label   = format(now, 'dd MMM yyyy, h:mm a');
    const comment = note
      ? `${note} — logged via Operations Dashboard ${label}`
      : `Re-engagement outreach — logged via Operations Dashboard ${label}`;

    // ── Attempt 1: Contact Log ────────────────────────────────────────────────
    try {
      await mbPost('/client/addclientcontactlog', token, {
        ClientId:      clientId,
        ContactMethod: 'Other',
        Contacted:     dateStr,
        Comments:      comment,
        FollowUpDate:  format(
          new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          "yyyy-MM-dd'T'00:00:00"
        ),
      });
      console.log(`Contact log saved for client ${clientId} via addclientcontactlog`);
      return ok({ logged: true, method: 'contactlog', message: 'Saved to Contact Log in Mindbody' });
    } catch (e1) {
      console.warn(`addclientcontactlog failed for ${clientId}:`, e1.message);

      // ── Attempt 2: Client Note ──────────────────────────────────────────────
      try {
        await mbPost('/client/addclientnote', token, {
          ClientId: clientId,
          Note:     comment,
        });
        console.log(`Contact note saved for client ${clientId} via addclientnote`);
        return ok({ logged: true, method: 'note', message: 'Saved as a Note in Mindbody' });
      } catch (e2) {
        console.warn(`addclientnote failed for ${clientId}:`, e2.message);

        // ── Both failed — return diagnostic so we can see what's happening ──
        return ok({
          logged:  false,
          method:  'none',
          message: `Contact log: ${e1.message} | Note: ${e2.message}`,
        });
      }
    }
  } catch (e) {
    console.error('mb-contact-client:', e);
    return err(e.message);
  }
};
