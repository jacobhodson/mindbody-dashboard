import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { periodStartFor } from './periods.js';

/**
 * One week's meeting of a given type ('team' | 'leadership'), keyed by that
 * week's Monday. This week's (or a future week's) meeting is created the
 * first time anyone opens it — replacing Notion's weekly auto-created page —
 * so there's no cron job. Past weeks that never had a meeting stay empty.
 *
 * Also loads the meeting's items and ratings, and the ids of earlier
 * meetings of the same type (for "Last week's to-dos").
 */
export function useMeeting(type, meetingDate) {
  const [meeting, setMeeting]       = useState(null);
  const [items, setItems]           = useState([]);
  const [ratings, setRatings]       = useState([]);
  const [pastMeetings, setPast]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let { data: m, error: mErr } = await supabase
        .from('meetings').select('*').eq('meeting_type', type).eq('meeting_date', meetingDate).maybeSingle();
      if (mErr) throw mErr;

      if (!m && meetingDate >= periodStartFor('weekly')) {
        // Two people opening it at once both upsert; ignoreDuplicates makes
        // the loser a no-op, then both read the same row back.
        const { error: insErr } = await supabase
          .from('meetings').upsert({ meeting_type: type, meeting_date: meetingDate }, { onConflict: 'meeting_type,meeting_date', ignoreDuplicates: true });
        if (insErr) throw insErr;
        ({ data: m, error: mErr } = await supabase
          .from('meetings').select('*').eq('meeting_type', type).eq('meeting_date', meetingDate).maybeSingle());
        if (mErr) throw mErr;
      }
      setMeeting(m || null);

      // Up to ~3 months of earlier meetings — enough to catch to-dos that
      // are still open from a few weeks back.
      const { data: past, error: pErr } = await supabase
        .from('meetings').select('id, meeting_date').eq('meeting_type', type)
        .lt('meeting_date', meetingDate).order('meeting_date', { ascending: false }).limit(12);
      if (pErr) throw pErr;
      setPast(past || []);

      if (m) {
        const [{ data: its, error: iErr }, { data: rts, error: rErr }] = await Promise.all([
          supabase.from('meeting_items').select('*').eq('meeting_id', m.id).order('created_at'),
          supabase.from('meeting_ratings').select('*').eq('meeting_id', m.id).order('created_at'),
        ]);
        if (iErr) throw iErr;
        if (rErr) throw rErr;
        setItems(its || []);
        setRatings(rts || []);
      } else {
        setItems([]);
        setRatings([]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [type, meetingDate]);

  useEffect(() => { load(); }, [load]);

  const updateMeeting = useCallback(async (patch) => {
    if (!meeting) return;
    const { data, error: err } = await supabase.from('meetings').update(patch).eq('id', meeting.id).select().single();
    if (err) { setError(err.message); return; }
    setMeeting(data);
  }, [meeting]);

  const addItem = useCallback(async (section, body) => {
    if (!meeting || !body?.trim()) return null;
    const { data, error: err } = await supabase
      .from('meeting_items').insert({ meeting_id: meeting.id, section, body: body.trim() }).select().single();
    if (err) { setError(err.message); return null; }
    setItems((prev) => [...prev, data]);
    return data;
  }, [meeting]);

  const removeItem = useCallback(async (id) => {
    const { error: err } = await supabase.from('meeting_items').delete().eq('id', id);
    if (err) { setError(err.message); return; }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // One rating per person per meeting — re-rating overwrites.
  const saveRating = useCallback(async (staffId, rating, suggestion) => {
    if (!meeting) return;
    const { data, error: err } = await supabase
      .from('meeting_ratings')
      .upsert({ meeting_id: meeting.id, staff_id: staffId, rating, suggestion: suggestion?.trim() || null }, { onConflict: 'meeting_id,staff_id' })
      .select().single();
    if (err) { setError(err.message); return; }
    setRatings((prev) => [...prev.filter((r) => r.staff_id !== staffId), data]);
  }, [meeting]);

  return { meeting, items, ratings, pastMeetings, loading, error, updateMeeting, addItem, removeItem, saveRating, reload: load };
}

/** The Leadership Huddle's cascade for a week, readable by all staff. */
export function useLeadershipCascade(meetingDate, enabled) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    supabase.rpc('leadership_cascade', { p_meeting_date: meetingDate })
      .then(({ data, error }) => { if (!cancelled && !error) setItems(data || []); });
    return () => { cancelled = true; };
  }, [meetingDate, enabled]);
  return items;
}
