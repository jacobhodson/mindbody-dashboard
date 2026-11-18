import { supabase } from '../lib/supabaseClient.js';

/**
 * Posts a client note (#client-headlines) or strategy session (its own
 * channel) to Slack via /api/slack-publish (netlify/functions/slack-publish.js).
 * Resolves to the JSON body or { error }.
 */
export const publishNoteToSlack = (noteId) => publishToSlack({ note_id: noteId });
export const publishStrategyToSlack = (id) => publishToSlack({ strategy_session_id: id });

async function publishToSlack(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  try {
    const res = await fetch('/api/slack-publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: body.error || `HTTP ${res.status}` };
    return body;
  } catch (e) {
    return { error: e.message };
  }
}
