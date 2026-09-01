import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { periodEndFor } from './periods.js';

/**
 * Task-completion history for one period (day/week/month), plus whatever
 * targets were active during it. Deliberately does NOT compare targets
 * against an "actual" — that needs the Mindbody→metric_actuals sync job,
 * which is a separate, not-yet-built piece. This only reports what staff
 * logged themselves: task completion counts.
 */
export function useScorecard(cadence, periodStart) {
  const [templates, setTemplates]     = useState([]);
  const [completions, setCompletions] = useState([]);
  const [targets, setTargets]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const periodEnd = periodEndFor(cadence, periodStart);

    Promise.all([
      // All templates for this cadence — including inactive ones, so a
      // since-deactivated task doesn't vanish from a past scorecard.
      supabase.from('task_templates').select('*').eq('cadence', cadence),
      supabase.from('task_completions').select('*')
        .eq('period_type', cadence).eq('period_start', periodStart),
      supabase.from('targets').select('*').eq('cadence', cadence)
        .lte('effective_from', periodEnd)
        .or(`effective_to.is.null,effective_to.gte.${periodStart}`),
    ]).then(([tpl, comp, tgt]) => {
      if (cancelled) return;
      if (tpl.error || comp.error || tgt.error) {
        setError((tpl.error || comp.error || tgt.error).message);
        return;
      }
      setTemplates(tpl.data || []);
      setCompletions(comp.data || []);
      setTargets(tgt.data || []);
    }).finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [cadence, periodStart]);

  const completionFor = (template) => completions.find((c) =>
    c.template_id === template.id &&
    (template.scope === 'team' ? c.staff_id === null : true)
  );

  const teamTemplates       = templates.filter((t) => t.scope === 'team');
  const individualTemplates = templates.filter((t) => t.scope === 'individual');

  const teamDoneCount = teamTemplates.filter((t) => completionFor(t)).length;

  // Per-person breakdown for individual/assigned tasks: how many of their
  // applicable tasks did each staff member complete this period.
  const individualCompletions = completions.filter((c) => c.staff_id !== null);

  return {
    templates, completions, targets, loading, error,
    teamTemplates, individualTemplates, teamDoneCount, individualCompletions,
    completionFor,
  };
}
