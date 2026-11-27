import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * The editable grids of a meeting (meeting_table_rows, from
 * 20261127000000_annual_planning.sql) — used by the planning day's tables.
 * A row is keyed by (section, row_key): 'r<index>' for a table's fixed rows
 * (created on first edit), a uuid for rows people add. Cells are saved one at
 * a time through set_meeting_table_cell(), which merges the cell into the
 * row server-side, so two people editing different cells don't clash.
 */
export function useMeetingTables(meetingId) {
  const [rows, setRows]   = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!meetingId) { setRows([]); return undefined; }
    let cancelled = false;
    supabase.from('meeting_table_rows').select('*').eq('meeting_id', meetingId)
      .order('sort_order').order('created_at')
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else { setRows(data || []); setError(null); }
      });
    return () => { cancelled = true; };
  }, [meetingId]);

  const put = (row) => setRows((prev) => {
    const i = prev.findIndex((r) => r.id === row.id);
    if (i === -1) return [...prev, row];
    const next = [...prev];
    next[i] = row;
    return next;
  });

  const saveCell = useCallback(async (section, rowKey, col, value, sort = 0) => {
    const { data, error: err } = await supabase.rpc('set_meeting_table_cell', {
      p_meeting_id: meetingId, p_section: section, p_row_key: rowKey, p_col: col, p_value: value ?? '', p_sort: sort,
    });
    if (err) { setError(err.message); return false; }
    put(Array.isArray(data) ? data[0] : data);
    setError(null);
    return true;
  }, [meetingId]);

  const addRow = useCallback(async (section, sort) => {
    const { data, error: err } = await supabase.from('meeting_table_rows')
      .insert({ meeting_id: meetingId, section, row_key: crypto.randomUUID(), sort_order: sort })
      .select().single();
    if (err) { setError(err.message); return null; }
    put(data);
    return data;
  }, [meetingId]);

  const deleteRow = useCallback(async (id) => {
    const { error: err } = await supabase.from('meeting_table_rows').delete().eq('id', id);
    if (err) { setError(err.message); return; }
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { rows, error, saveCell, addRow, deleteRow };
}
