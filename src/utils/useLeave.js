import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Every leave request (HR → Leave Planner). The whole table is small
 * (a few dozen rows a year), so it's loaded once and filtered client-side.
 * Approval rules are enforced by the leave_requests_guard trigger: a
 * non-manager's insert is always pending, and changing the dates/type of a
 * decided request sends it back to pending.
 *
 * Notes live in leave_request_notes, which RLS only returns for your own
 * requests (or all, for managers) — they're merged onto each request as
 * `notes` (always null on other people's requests for non-managers).
 */
export function useLeave() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const load = useCallback(async () => {
    const [reqRes, notesRes] = await Promise.all([
      supabase.from('leave_requests').select('*').order('start_date', { ascending: false }),
      supabase.from('leave_request_notes').select('request_id, notes'),
    ]);
    const err = reqRes.error || notesRes.error;
    if (err) setError(err.message);
    else {
      const notes = Object.fromEntries((notesRes.data || []).map((n) => [n.request_id, n.notes]));
      setRequests((reqRes.data || []).map((r) => ({ ...r, notes: notes[r.id] ?? null })));
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Writes (or clears) a request's private note.
  const saveNotes = async (requestId, notes) => {
    const text = notes?.trim() || null;
    const { error: err } = text
      ? await supabase.from('leave_request_notes').upsert({ request_id: requestId, notes: text, updated_at: new Date().toISOString() })
      : await supabase.from('leave_request_notes').delete().eq('request_id', requestId);
    if (err) { setError(err.message); return false; }
    return text;
  };

  const createRequest = useCallback(async ({ notes, ...fields }) => {
    const { data, error: err } = await supabase.from('leave_requests').insert(fields).select().single();
    if (err) { setError(err.message); return null; }
    const savedNotes = notes?.trim() ? await saveNotes(data.id, notes) : null;
    const row = { ...data, notes: savedNotes || null };
    setRequests((prev) => [row, ...prev]);
    setError(null);
    return row;
  }, []);

  const updateRequest = useCallback(async (id, { notes, ...patch }) => {
    let data = null;
    if (Object.keys(patch).length) {
      const res = await supabase.from('leave_requests').update(patch).eq('id', id).select().single();
      if (res.error) { setError(res.error.message); return null; }
      data = res.data;
    }
    let noteVal;
    if (notes !== undefined) {
      noteVal = await saveNotes(id, notes);
      if (noteVal === false) return null;
    }
    let merged = null;
    setRequests((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      merged = { ...r, ...(data || {}), ...(notes !== undefined ? { notes: noteVal || null } : {}) };
      return merged;
    }));
    setError(null);
    return merged || true;
  }, []);

  const deleteRequest = useCallback(async (id) => {
    const { error: err } = await supabase.from('leave_requests').delete().eq('id', id);
    if (err) { setError(err.message); return false; }
    setRequests((prev) => prev.filter((r) => r.id !== id));
    return true;
  }, []);

  return { requests, loading, error, createRequest, updateRequest, deleteRequest, reload: load };
}
