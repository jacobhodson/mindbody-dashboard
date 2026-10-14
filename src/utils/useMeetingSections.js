import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { periodStartFor } from './periods.js';
import { MEETING_TYPES } from './meetingAgendas.js';

/**
 * A meeting type's agenda from `meeting_sections`
 * (20261015010000_meeting_sections.sql), plus the build-mode edits managers
 * make to it. `sectionsFor(date)` is the agenda as it stood for that week's
 * meeting: a section shows for meetings in [active_from, active_until).
 *
 * Changes take effect from the current week: adding stamps active_from with
 * this week's Monday, removing stamps active_until — so earlier weeks keep
 * their sections and entries. If the table can't be read (e.g. the migration
 * isn't applied yet) it falls back to the seed agenda in meetingAgendas.js.
 */
export function useMeetingSections(type) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [fallback, setFallback] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('meeting_sections').select('*').eq('meeting_type', type)
      .order('sort_order').order('created_at');
    if (err || !data?.length) {
      setFallback(true);
      setRows(MEETING_TYPES[type].sections.map((s, i) => ({ ...s, id: s.key, sort_order: i })));
    } else {
      setFallback(false);
      setRows(data);
    }
    setLoading(false);
  }, [type]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const thisWeek = periodStartFor('weekly');

  /** The agenda for a given meeting date (yyyy-MM-dd). */
  const sectionsFor = useCallback((date) => rows.filter((s) =>
    (!s.active_from || date >= s.active_from) && (!s.active_until || date < s.active_until)), [rows]);

  /** What build mode edits: the agenda from this week on. */
  const current = useMemo(() => rows.filter((s) => !s.active_until || s.active_until > thisWeek), [rows, thisWeek]);

  const run = async (query) => {
    const { error: err } = await query;
    if (err) { setError(err.message); return false; }
    setError(null);
    await load();
    return true;
  };

  const addSection = ({ title, kind, hint, minutes }) => {
    const max = rows.reduce((m, s) => Math.max(m, s.sort_order), -1);
    return run(supabase.from('meeting_sections').insert({
      meeting_type: type,
      key: `${kind}_${crypto.randomUUID().slice(0, 8)}`,
      title, kind, hint: hint || null, minutes: minutes ?? null,
      board: kind === 'ids' ? type : null,
      voices: kind === 'ids' && type === 'team',
      sort_order: max + 1,
      active_from: thisWeek,
    }));
  };

  const updateSection = (id, patch) => run(supabase.from('meeting_sections').update(patch).eq('id', id));

  // A section added this week has no history yet, so it's simply deleted;
  // anything older is retired from this week on.
  const removeSection = (section) => (section.active_from === thisWeek
    ? run(supabase.from('meeting_sections').delete().eq('id', section.id))
    : run(supabase.from('meeting_sections').update({ active_until: thisWeek }).eq('id', section.id)));

  /** Save a new order for the current agenda (array of ids). */
  const reorder = (ids) => {
    // Optimistic, so drag-and-drop doesn't jump back while it saves.
    const pos = new Map(ids.map((id, i) => [id, i]));
    setRows((prev) => [...prev].sort((a, b) => (pos.get(a.id) ?? -1) - (pos.get(b.id) ?? -1)));
    return run(supabase.rpc('reorder_meeting_sections', { p_ids: ids }));
  };

  return { loading, error, fallback, sectionsFor, current, addSection, updateSection, removeSection, reorder };
}
