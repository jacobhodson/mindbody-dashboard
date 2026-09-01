import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Hook for managing onboarding task completion state.
 * Persists via Supabase (`onboarding_task_completions`), replacing the old
 * single-key Netlify Blobs store — gives real per-completion history and
 * staff attribution instead of just "currently checked or not".
 *
 * `templates` is the flat list from useOnboardingTaskTemplates() — each
 * template's `id` is its `key` string (e.g. 'w1-pre-session') and `dbId` is
 * the real uuid used as the FK. Return shape is unchanged from the old
 * Blobs-backed version so OnboardingCard.jsx doesn't need to change:
 *
 *   isComplete(clientId, taskId)   → boolean
 *   toggleTask(clientId, taskId)   → Promise<void>
 *   completions                    → { [clientId]: taskId[] }
 *   loading                        → boolean
 */
export function useOnboardingTasks(staff, templates) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!staff || !templates.length) return;
    supabase.from('onboarding_task_completions').select('*')
      .then(({ data, error }) => {
        if (!error) setRows(data || []);
      })
      .finally(() => setLoading(false));
  }, [staff, templates.length]);

  const byDbId = useCallback(
    (dbId) => templates.find((t) => t.dbId === dbId),
    [templates]
  );
  const byKey = useCallback(
    (key) => templates.find((t) => t.id === key),
    [templates]
  );

  // Derive the same { [clientId]: taskId[] } shape the old Blobs store returned.
  const completions = rows.reduce((acc, r) => {
    const tpl = byDbId(r.template_id);
    if (!tpl) return acc;
    if (!acc[r.client_id]) acc[r.client_id] = [];
    acc[r.client_id].push(tpl.id);
    return acc;
  }, {});

  const isComplete = useCallback(
    (clientId, taskId) => (completions[String(clientId)] || []).includes(taskId),
    [completions]
  );

  const toggleTask = useCallback(async (clientId, taskId) => {
    if (!staff) return;
    const tpl = byKey(taskId);
    if (!tpl) return;
    const id = String(clientId);

    const existing = rows.find((r) => r.template_id === tpl.dbId && r.client_id === id);
    if (existing) {
      setRows((prev) => prev.filter((r) => r.id !== existing.id)); // optimistic
      const { error } = await supabase.from('onboarding_task_completions').delete().eq('id', existing.id);
      if (error) setRows((prev) => [...prev, existing]); // revert on failure
      return;
    }

    const { data, error } = await supabase
      .from('onboarding_task_completions')
      .insert({ template_id: tpl.dbId, client_id: id, completed_by: staff.id })
      .select().single();
    if (!error) setRows((prev) => [...prev, data]);
  }, [staff, rows, byKey]);

  return { completions, isComplete, toggleTask, loading };
}
