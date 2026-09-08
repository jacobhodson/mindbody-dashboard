import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { periodStartFor } from './periods.js';

// Shared by createTask and TaskChecklist's edit form — turns "personal /
// team / assigned to X" + who's asking into the actual scope/owner/assignee
// columns. Non-managers always end up personal regardless of what they pass,
// matching what RLS enforces server-side anyway.
export function resolveAssignmentFields({ isManager, assignMode, assignee, staffId }) {
  const assigned = isManager && assignMode === 'assigned' && assignee;
  const personal = !assigned && (!isManager || assignMode !== 'team');
  return {
    scope:             assigned || personal ? 'individual' : 'team',
    owner_staff_id:    assigned ? staffId : (personal ? staffId : null),
    assigned_staff_id: assigned ? assignee : null,
  };
}

/**
 * Loads active task templates (RLS already scopes personal-vs-team
 * visibility) and this period's completions for the given staff member;
 * exposes toggle() to check/uncheck a task, createTask() to add a new
 * template, and logContactTask() for task_type='contact_log' tasks.
 *
 * `staff` comes from useStaff(user) — fetched once higher up the tree
 * (App.jsx) rather than re-derived here.
 *
 * Team-scope tasks (template.scope === 'team') share one row per period
 * (staff_id null, see supabase/migrations/20260901000001_task_completions_fix.sql)
 * — whoever checks it off logs it for the whole team, tracked via completed_by.
 */
export function useTeamTasks(user, staff) {
  const [templates, setTemplates]     = useState([]);
  const [completions, setCompletions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  const load = useCallback(async () => {
    if (!user || !staff) return;
    setLoading(true);
    setError(null);
    try {
      const { data: tpls, error: tplErr } = await supabase
        .from('task_templates').select('*').eq('active', true).order('sort_order');
      if (tplErr) throw tplErr;
      setTemplates(tpls || []);

      const periodStarts = [...new Set((tpls || []).map((t) => periodStartFor(t.cadence)))];
      if (periodStarts.length) {
        const { data: comps, error: compErr } = await supabase
          .from('task_completions').select('*').in('period_start', periodStarts);
        if (compErr) throw compErr;
        setCompletions(comps || []);
      } else {
        setCompletions([]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user, staff]);

  useEffect(() => { load(); }, [load]);

  const completionFor = useCallback((template) => {
    const periodStart = periodStartFor(template.cadence);
    return completions.find((c) =>
      c.template_id === template.id &&
      c.period_start === periodStart &&
      (template.scope === 'team' ? c.staff_id === null : c.staff_id === staff?.id)
    );
  }, [completions, staff]);

  const markDone = useCallback(async (template, value) => {
    const row = {
      template_id:  template.id,
      staff_id:     template.scope === 'team' ? null : staff.id,
      completed_by: staff.id,
      period_start: periodStartFor(template.cadence),
      period_type:  template.cadence,
      value:        value ?? template.target_value ?? 1,
    };
    const { data, error: insErr } = await supabase.from('task_completions').insert(row).select().single();
    if (insErr) { setError(insErr.message); return null; }
    setCompletions((prev) => [...prev, data]);
    return data;
  }, [staff]);

  const toggle = useCallback(async (template) => {
    if (!staff) return;
    const existing = completionFor(template);

    if (existing) {
      const { error: delErr } = await supabase.from('task_completions').delete().eq('id', existing.id);
      if (delErr) { setError(delErr.message); return; }
      setCompletions((prev) => prev.filter((c) => c.id !== existing.id));
      return;
    }

    await markDone(template);
  }, [staff, completionFor, markDone]);

  // For task_type === 'contact_log' templates: logs the contact entry, and
  // (if not already done this period) marks the task completed too, linking
  // the two rows together via task_contact_log.completion_id.
  const logContactTask = useCallback(async (template, { clientName, note }) => {
    if (!staff) return;
    let completion = completionFor(template);
    if (!completion) completion = await markDone(template);

    const { data, error: logErr } = await supabase
      .from('task_contact_log')
      .insert({
        staff_id:      staff.id,
        completion_id: completion?.id ?? null,
        client_name:   clientName,
        note:          note || null,
      })
      .select().single();
    if (logErr) { setError(logErr.message); return null; }
    return data;
  }, [staff, completionFor, markDone]);

  // Managers create shared team templates or assign a task to a specific
  // person; everyone else can only create personal ones (RLS enforces all
  // of this server-side too). assignMode is 'personal' | 'team' | 'assigned'.
  const createTask = useCallback(async ({
    label, description, cadence, target_type, target_value, unit, task_type, isManager, assignMode, assignee,
  }) => {
    if (!staff) return null;
    const row = {
      key:            `personal-${staff.id}-${Date.now()}`,
      label,
      description:    description || null,
      cadence,
      target_type:    target_type || 'boolean',
      target_value:   target_value ?? 1,
      unit:           unit || null,
      task_type:      task_type || 'checkbox',
      ...resolveAssignmentFields({ isManager, assignMode, assignee, staffId: staff.id }),
    };
    const { data, error: insErr } = await supabase.from('task_templates').insert(row).select().single();
    if (insErr) { setError(insErr.message); return null; }
    setTemplates((prev) => [...prev, data].sort((a, b) => a.sort_order - b.sort_order));
    return data;
  }, [staff]);

  // Edit an existing template's own fields (label/description/cadence/etc)
  // and/or its assignment. RLS already restricts who can actually update a
  // given row (managers, or the personal task's own owner) — this just does
  // the write; the edit UI decides whether to show itself based on the same
  // rule client-side.
  const updateTask = useCallback(async (id, patch) => {
    const { data, error: updErr } = await supabase.from('task_templates').update(patch).eq('id', id).select().single();
    if (updErr) { setError(updErr.message); return null; }
    setTemplates((prev) => prev.map((t) => (t.id === id ? data : t)).sort((a, b) => a.sort_order - b.sort_order));
    return data;
  }, []);

  return { templates, loading, error, toggle, completionFor, logContactTask, createTask, updateTask, reload: load };
}
