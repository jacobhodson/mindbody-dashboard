import { createClient } from '@supabase/supabase-js';

const url     = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — Team Tasks will not work.');
}

// Invite / password-reset emails (netlify/functions/staff-admin.js) link to
// /?auth=invite|recovery&token_hash=… — App.jsx exchanges the token for a
// session with verifyOtp() and then asks the person to choose a password.
export const authLink = (() => {
  try {
    const q = new URLSearchParams(window.location.search);
    const type = q.get('auth');
    const tokenHash = q.get('token_hash');
    return (type === 'invite' || type === 'recovery') && tokenHash ? { type, tokenHash } : null;
  } catch { return null; }
})();

export const supabase = createClient(url, anonKey);
