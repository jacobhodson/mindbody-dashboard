import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { periodsInRange } from './periods.js';

/**
 * Per-coach task completion stats for a given calendar month — the "what's
 * getting ticked off, what's not" piece of the Team tab.
 *
 * Scoped to individual-scope task templates only (personal + manager-
 * assigned, via owner_staff_id/assigned_staff_id) — a team-scope task isn't
 * any one coach's own, so doesn't belong in a per-coach breakdown.
 *
 * Loads every template+completion once (small tables at this scale, same
 * assumption useTeamTasks.js already makes) and computes expected-vs-
 * completed per coach per month client-side via periodsInRange, so
 * switching the selected month or coach needs no refetch.
 */
export function useTeamTaskStats(isManager) {
  const [templates, setTemplates]     = useState([]);
  const [completions, setCompletions] = useState([]);
  const [loading, setLoading]         = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([
      supabase.from('task_templates').select('*').eq('scope', 'individual'),
      supabase.from('task_completions').select('*'),
    ]).then(([tplRes, compRes]) => {
      setTemplates(tplRes.data || []);
      setCompletions(compRes.data || []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isManager) { setLoading(false); return; }
    load();
  }, [isManager, load]);

  // Returns { expected, completed, rate, missed: [{templateId, label, periodStart}] }
  const statsFor = useCallback((staffId, monthStart, monthEnd) => {
    const mine = templates.filter((t) => t.owner_staff_id === staffId || t.assigned_staff_id === staffId);
    let expected = 0, completed = 0;
    const missed = [];
    for (const t of mine) {
      for (const periodStart of periodsInRange(t, monthStart, monthEnd)) {
        expected++;
        const done = completions.some((c) => c.template_id === t.id && c.staff_id === staffId && c.period_start === periodStart);
        if (done) completed++;
        else missed.push({ templateId: t.id, label: t.label, periodStart });
      }
    }
    return { expected, completed, missed, rate: expected > 0 ? completed / expected : null };
  }, [templates, completions]);

  return { statsFor, loading, reload: load };
}
