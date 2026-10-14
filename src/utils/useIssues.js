import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * IDS issues for one board ('team' | 'leadership'). Issues aren't tied to a
 * single meeting — they stay on the board week to week until solved.
 * Solved issues from the last 14 days are included so a meeting can still
 * see what it just closed.
 */
export function useIssues(board) {
  const [issues, setIssues]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data, error: err } = await supabase
      .from('issues').select('*').eq('board', board)
      .or(`status.neq.solved,solved_at.gte.${since}`)
      .order('created_at');
    if (err) setError(err.message);
    else { setIssues(data || []); setError(null); }
    setLoading(false);
  }, [board]);

  useEffect(() => { load(); }, [load]);

  const addIssue = useCallback(async (title, notes) => {
    if (!title?.trim()) return null;
    const { data, error: err } = await supabase
      .from('issues').insert({ title: title.trim(), notes: notes?.trim() || null, board }).select().single();
    if (err) { setError(err.message); return null; }
    setIssues((prev) => [...prev, data]);
    return data;
  }, [board]);

  const updateIssue = useCallback(async (id, patch) => {
    const full = { ...patch };
    if (patch.status) full.solved_at = patch.status === 'solved' ? new Date().toISOString() : null;
    const { data, error: err } = await supabase.from('issues').update(full).eq('id', id).select().single();
    if (err) { setError(err.message); return null; }
    // Moving an issue to the other board takes it off this one.
    setIssues((prev) => (data.board === board ? prev.map((i) => (i.id === id ? data : i)) : prev.filter((i) => i.id !== id)));
    return data;
  }, [board]);

  const deleteIssue = useCallback(async (id) => {
    const { error: err } = await supabase.from('issues').delete().eq('id', id);
    if (err) { setError(err.message); return; }
    setIssues((prev) => prev.filter((i) => i.id !== id));
  }, []);

  return { issues, loading, error, addIssue, updateIssue, deleteIssue, reload: load };
}
