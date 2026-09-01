import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Wraps Supabase Auth session state. Staff are created via Supabase invite
 * or manual "Add user" — there's no public sign-up form.
 */
export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  const signOut = () => supabase.auth.signOut();

  return { session, user: session?.user ?? null, loading, signIn, signOut };
}
