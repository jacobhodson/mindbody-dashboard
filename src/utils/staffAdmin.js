import { supabase } from '../lib/supabaseClient.js';

/**
 * Calls /api/staff-admin (netlify/functions/staff-admin.js) — the server
 * side of anything touching logins: invites, set-password links, email
 * changes, deactivation. Resolves to the JSON body or { error }.
 */
export async function staffAdmin(action, args = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  try {
    const res = await fetch('/api/staff-admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ action, ...args }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: body.error || `HTTP ${res.status}` };
    return body;
  } catch (e) {
    return { error: e.message };
  }
}

export const ROLE_LABELS = { coach: 'Coach', manager: 'Manager', admin: 'Admin (owner)' };

// Re-checks the signed-in person's current password without touching the
// app's own session (a separate, non-persisting client).
let verifier;
export async function verifyPassword(email, password) {
  if (!verifier) {
    const { createClient } = await import('@supabase/supabase-js');
    verifier = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'password-check' },
    });
  }
  const { error } = await verifier.auth.signInWithPassword({ email, password });
  return !error;
}
