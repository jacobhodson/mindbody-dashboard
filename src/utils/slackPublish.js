import { supabase } from '../lib/supabaseClient.js';

/**
 * Posts a client note to #client-headlines via /api/slack-publish
 * (netlify/functions/slack-publish.js). Resolves to the JSON body or { error }.
 */
export async function publishNoteToSlack(noteId) {
  const { data: { session } } = await supabase.auth.getSession();
  try {
    const res = await fetch('/api/slack-publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ note_id: noteId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: body.error || `HTTP ${res.status}` };
    return body;
  } catch (e) {
    return { error: e.message };
  }
}
