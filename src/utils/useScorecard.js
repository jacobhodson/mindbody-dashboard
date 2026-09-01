import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { periodEndFor } from './periods.js';

/**
 * Task-completion history for one period (day/week/month), plus whatever
 * targets were active during it, alongside real Mindbody-sourced actuals
 * from metric_actuals where available (currently attendance_visits and
 * revenue — see scheduled-daily-refresh.js). Targets with no matching
 * metric_key just show their configured value with no actual, same as
 * before that sync existed.
 */
export function useScorecard(cadence, periodStart) {
  const [templates, setTemplates]     = useState([]);
  const [completions, setCompletions] = useState([]);
  const [targets, setTargets]         = useState([]);
  const [actuals, setActuals]         = useState([]);
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
      supabase.from('metric_actuals').select('*')
        .gte('metric_date', periodStart).lte('metric_date', periodEnd),
    ]).then(([tpl, comp, tgt, act]) => {
      if (cancelled) return;
      if (tpl.error || comp.error || tgt.error || act.error) {
        setError((tpl.error || comp.error || tgt.error || act.error).message);
        return;
      }
      setTemplates(tpl.data || []);
      setCompletions(comp.data || []);
      setTargets(tgt.data || []);
      setActuals(act.data || []);
    }).finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [cadence, periodStart]);

  // Sum of this period's daily metric_actuals rows for a target's metric_key
  // — correct for both attendance and revenue, which are naturally additive
  // across a week/month. Returns null (not 0) when there's no synced data
  // at all for that metric_key, so the UI can tell "no data yet" apart from
  // "genuinely zero".
  const actualFor = (target) => {
    const rows = actuals.filter((a) => a.metric_key === target.metric_key);
    if (!rows.length) return null;
    return rows.reduce((sum, r) => sum + Number(r.value), 0);
  };

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
    templates, completions, targets, actuals, loading, error,
    teamTemplates, individualTemplates, teamDoneCount, individualCompletions,
    completionFor, actualFor,
  };
}
