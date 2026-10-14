import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Notes threads for a set of tasks (task_notes, 20261014010000_task_notes.sql),
 * loaded in one query. RLS ties visibility to the task itself.
 */
export function useTaskNotes(templateIds) {
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState(null);
  const idsKey = (templateIds || []).filter(Boolean).slice().sort().join(',');

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : [];
    if (!ids.length) { setNotes([]); return; }
    let cancelled = false;
    supabase.from('task_notes').select('*').in('template_id', ids).order('created_at')
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else setNotes(data || []);
      });
    return () => { cancelled = true; };
  }, [idsKey]);

  const notesFor = useCallback((templateId) => notes.filter((n) => n.template_id === templateId), [notes]);

  const addNote = useCallback(async (templateId, body) => {
    if (!body?.trim()) return null;
    const { data, error: err } = await supabase
      .from('task_notes').insert({ template_id: templateId, body: body.trim() }).select().single();
    if (err) { setError(err.message); return null; }
    setNotes((prev) => [...prev, data]);
    return data;
  }, []);

  const removeNote = useCallback(async (id) => {
    const { error: err } = await supabase.from('task_notes').delete().eq('id', id);
    if (err) { setError(err.message); return; }
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notesFor, addNote, removeNote, error };
}
