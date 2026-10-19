import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const POLL_MS = 60_000;
const LIMIT = 40;

/**
 * The signed-in person's notifications (header bell). Rows are written by DB
 * triggers and RLS only ever returns your own. Polls every minute and
 * whenever the tab regains focus — no realtime channel needed for this.
 */
export function useNotifications(enabled = true) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('notifications').select('*').order('created_at', { ascending: false }).limit(LIMIT);
    if (!error) setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const id = setInterval(load, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [enabled, load]);

  const markRead = useCallback(async (id) => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: now } : n)));
    await supabase.from('notifications').update({ read_at: now }).eq('id', id).is('read_at', null);
  }, []);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await supabase.from('notifications').update({ read_at: now }).is('read_at', null);
  }, []);

  const clearRead = useCallback(async () => {
    setItems((prev) => prev.filter((n) => !n.read_at));
    await supabase.from('notifications').delete().not('read_at', 'is', null);
  }, []);

  const unread = items.filter((n) => !n.read_at).length;
  return { items, unread, loading, markRead, markAllRead, clearRead, reload: load };
}
