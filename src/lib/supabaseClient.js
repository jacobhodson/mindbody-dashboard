import { createClient } from '@supabase/supabase-js';

const url     = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — Team Tasks will not work.');
}

// An invite or password-reset email lands back here with the session in the
// URL hash (#access_token=…&type=invite|recovery). supabase-js consumes and
// clears that hash during start-up, so note the type first — App.jsx uses it
// to ask the person to choose a password before showing the dashboard.
export const authLinkType = (() => {
  try {
    const t = new URLSearchParams(window.location.hash.slice(1)).get('type');
    return t === 'invite' || t === 'recovery' ? t : null;
  } catch { return null; }
})();

export const supabase = createClient(url, anonKey);
