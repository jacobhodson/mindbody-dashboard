import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Rock tasks and meeting to-dos — ordinary task_templates rows (cadence
 * 'once', so a completion's period_start is the task's due_date) tagged with
 * rock_id or meeting_id. Because they're normal tasks, the assignee also sees
 * them in their Home checklist, and ticking either place is the same row.
 *
 * `column` is 'rock_id' or 'meeting_id'; `ids` the rocks/meetings to load.
 *
 * Who can do what (mirrors RLS in 20261014000000_rocks_and_meetings.sql):
 * anyone can add a task to a rock/team meeting; owner (creator), assignee or
 * a manager can edit/delete it; the assignee (or anyone, if unassigned) or a
 * manager can tick it off.
 */
export function useLinkedTasks(column, ids, staff, isManager) {
  const [tasks, setTasks]             = useState([]);
  const [completions, setCompletions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const idsKey = (ids || []).filter(Boolean).slice().sort().join(',');

  const load = useCallback(async () => {
    const idList = idsKey ? idsKey.split(',') : [];
    if (!idList.length) { setTasks([]); setCompletions([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data: tpls, error: tErr } = await supabase
        .from('task_templates').select('*').in(column, idList)
        .order('due_date').order('created_at');
      if (tErr) throw tErr;
      setTasks(tpls || []);
      const tplIds = (tpls || []).map((t) => t.id);
      if (tplIds.length) {
        const { data: comps, error: cErr } = await supabase
          .from('task_completions').select('*').in('template_id', tplIds);
        if (cErr) throw cErr;
        setCompletions(comps || []);
      } else {
        setCompletions([]);
      }
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [column, idsKey]);

  useEffect(() => { load(); }, [load]);

  const completionFor = useCallback((task) => completions.find(
    (c) => c.template_id === task.id && c.period_start === task.due_date,
  ), [completions]);

  const canToggle = useCallback((task) => (
    isManager || !task.assigned_staff_id || task.assigned_staff_id === staff?.id
  ), [isManager, staff]);

  const canEdit = useCallback((task) => (
    isManager || task.owner_staff_id === staff?.id || task.assigned_staff_id === staff?.id
  ), [isManager, staff]);

  // fields: { label, assignee, due_date, rock_id?, meeting_id?, issue_id? }
  const addTask = useCallback(async ({ label, assignee, due_date, rock_id, meeting_id, issue_id }) => {
    if (!staff || !label?.trim() || !due_date) return null;
    const row = {
      key:               `${column}-${staff.id}-${Date.now()}`,
      label:             label.trim(),
      scope:             'individual',
      cadence:           'once',
      due_date,
      owner_staff_id:    staff.id,
      assigned_staff_id: assignee || null,
      rock_id:           rock_id || null,
      meeting_id:        meeting_id || null,
      issue_id:          issue_id || null,
    };
    const { data, error: err } = await supabase.from('task_templates').insert(row).select().single();
    if (err) { setError(err.message); return null; }
    setTasks((prev) => [...prev, data]);
    return data;
  }, [staff, column]);

  const toggle = useCallback(async (task) => {
    if (!staff) return;
    const existing = completionFor(task);
    if (existing) {
      const { error: err } = await supabase.from('task_completions').delete().eq('id', existing.id);
      if (err) { setError(err.message); return; }
      setCompletions((prev) => prev.filter((c) => c.id !== existing.id));
      return;
    }
    const { data, error: err } = await supabase.from('task_completions').insert({
      template_id:  task.id,
      staff_id:     task.assigned_staff_id || staff.id,
      completed_by: staff.id,
      period_start: task.due_date,
      period_type:  'once',
      value:        1,
    }).select().single();
    if (err) { setError(err.message); return; }
    setCompletions((prev) => [...prev, data]);
  }, [staff, completionFor]);

  const updateTask = useCallback(async (task, patch) => {
    const { data, error: err } = await supabase
      .from('task_templates').update(patch).eq('id', task.id).select().single();
    if (err) { setError(err.message); return null; }
    // A completion is keyed by the due date it was ticked against — move it
    // with the task so changing the date doesn't silently un-tick it.
    const existing = completionFor(task);
    if (existing && patch.due_date && patch.due_date !== task.due_date) {
      const { data: moved } = await supabase
        .from('task_completions').update({ period_start: patch.due_date }).eq('id', existing.id).select().single();
      if (moved) setCompletions((prev) => prev.map((c) => (c.id === moved.id ? moved : c)));
    }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? data : t)));
    return data;
  }, [completionFor]);

  const deleteTask = useCallback(async (id) => {
    const { error: err } = await supabase.from('task_templates').delete().eq('id', id);
    if (err) { setError(err.message); return false; }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    return true;
  }, []);

  return { tasks, loading, error, completionFor, canToggle, canEdit, addTask, toggle, updateTask, deleteTask, reload: load };
}
