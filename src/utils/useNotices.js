import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * The noticeboard — active announcements/coaching keys, newest first.
 * Read for everyone (RLS); create/update/delete restricted to managers.
 */
export function useNotices(staff) {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('notices').select('*').eq('active', true).order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setNotices(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createNotice = useCallback(async (message) => {
    if (!staff || !message.trim()) return null;
    const { data, error: err } = await supabase
      .from('notices').insert({ message: message.trim(), created_by: staff.id }).select().single();
    if (err) { setError(err.message); return null; }
    setNotices((prev) => [data, ...prev]);
    return data;
  }, [staff]);

  const updateNotice = useCallback(async (id, message) => {
    const { data, error: err } = await supabase
      .from('notices').update({ message: message.trim() }).eq('id', id).select().single();
    if (err) { setError(err.message); return null; }
    setNotices((prev) => prev.map((n) => (n.id === id ? data : n)));
    return data;
  }, []);

  const removeNotice = useCallback(async (id) => {
    const { error: err } = await supabase.from('notices').update({ active: false }).eq('id', id);
    if (err) { setError(err.message); return; }
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notices, loading, error, createNotice, updateNotice, removeNotice };
}
