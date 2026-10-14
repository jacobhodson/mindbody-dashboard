import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/** A rock's running update log, newest first. Anyone can add a note. */
export function useRockNotes(rockId) {
  const [notes, setNotes]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    if (!rockId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('rock_notes').select('*').eq('rock_id', rockId).order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setNotes(data || []);
    setLoading(false);
  }, [rockId]);

  useEffect(() => { load(); }, [load]);

  const addNote = useCallback(async (body) => {
    if (!body?.trim()) return null;
    const { data, error: err } = await supabase
      .from('rock_notes').insert({ rock_id: rockId, body: body.trim() }).select().single();
    if (err) { setError(err.message); return null; }
    setNotes((prev) => [data, ...prev]);
    return data;
  }, [rockId]);

  const removeNote = useCallback(async (id) => {
    const { error: err } = await supabase.from('rock_notes').delete().eq('id', id);
    if (err) { setError(err.message); return; }
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notes, loading, error, addNote, removeNote };
}
