import { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { supabase } from '../lib/supabaseClient.js';
import { periodStartFor, periodEndFor } from './periods.js';

/**
 * Live rollover rate, sourced from `onboarding_rollover_decisions` rather
 * than a manually-logged Scoreboard count — "convert it to pipeline data"
 * (2026-09-18). Straight-in members and 'removed' overrides are excluded
 * at the query itself, not computed client-side, since is_straight_in is
 * recorded on the decision at the moment it's made (see
 * useOnboardingRollover.js) — that's what keeps this correct even after a
 * client ages out of mb-onboarding.js's rolling 27-day pipeline view.
 *
 * Deliberately its own hook/component rather than another `targets` row:
 * the existing metric_actuals model sums daily values over a period, which
 * is right for a count (visits, sales) but wrong for a rate — you can't sum
 * daily percentages. A rate needs "how many decided, how many of those were
 * yes" for the period, not an additive ledger.
 */
export function useRolloverStats() {
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    return supabase
      .from('onboarding_rollover_decisions')
      .select('decision, decided_at')
      .eq('is_straight_in', false)
      .in('decision', ['rollover', 'no-rollover'])
      .then(({ data, error }) => {
        if (!error) setDecisions(data || []);
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  // { rollovers, decided, pct } for the current week or month.
  const statsFor = useCallback((cadence) => {
    const start = periodStartFor(cadence);
    const end   = periodEndFor(cadence, start);
    const inRange = decisions.filter((d) => {
      const day = format(parseISO(d.decided_at), 'yyyy-MM-dd');
      return day >= start && day <= end;
    });
    const rollovers = inRange.filter((d) => d.decision === 'rollover').length;
    const decided   = inRange.length;
    const pct = decided > 0 ? Math.round((rollovers / decided) * 100) : null;
    return { rollovers, decided, pct };
  }, [decisions]);

  return { statsFor, loading, reload: load };
}
