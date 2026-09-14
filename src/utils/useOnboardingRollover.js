import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Hook for managing membership rollover decisions AND manual onboarding-
 * pipeline removals (same store — 'removed' isn't a rollover outcome, it's
 * an override for clients who never should've been swept onto the pipeline
 * in the first place, e.g. an existing member whose contract changed, or a
 * one-off trial visitor). Persists via Supabase (`onboarding_rollover_decisions`),
 * replacing the old Notion-backed version — same migration pattern as
 * useContactLog.js/usePaymentResolutions.js.
 *
 * A decision now also records the client's short_product/is_straight_in at
 * the moment it's made (see setDecision's `meta` param) — mb-onboarding.js's
 * live pipeline only shows clients within their rolling 27-day window, so a
 * rollover-rate computed by joining decisions against "the current
 * pipeline" would lose that context the moment a client ages out. Recording
 * it on the decision itself is what makes useRolloverStats.js's historical
 * reporting correct regardless of pipeline churn.
 *
 * Returns:
 *   decisions                                    → { [clientId]: { decision, decidedAt } }
 *   getDecision(clientId)                        → 'rollover' | 'no-rollover' | 'removed' | null
 *   setDecision(clientId, decision, meta?)        → Promise<void> (pass null decision to undo/restore)
 *   loading                                       → boolean
 */
export function useOnboardingRollover() {
  const [decisions, setDecisions] = useState({});
  const [loading, setLoading]     = useState(true);

  const load = useCallback(() => {
    return supabase
      .from('onboarding_rollover_decisions')
      .select('mindbody_client_id, decision, decided_at')
      .then(({ data, error }) => {
        if (error || !data) return;
        const map = {};
        for (const row of data) {
          map[row.mindbody_client_id] = { decision: row.decision, decidedAt: row.decided_at };
        }
        setDecisions(map);
      });
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const getDecision = useCallback(
    (clientId) => decisions[String(clientId)]?.decision ?? null,
    [decisions]
  );

  // meta: { shortProduct, isStraightIn, product } — recorded alongside the
  // decision so it stays correct after the client leaves the live pipeline.
  const setDecision = useCallback(async (clientId, decision, meta = {}) => {
    const id = String(clientId);
    const decidedAt = new Date().toISOString();

    // Optimistic update
    setDecisions((prev) => {
      const next = { ...prev };
      if (!decision) delete next[id];
      else next[id] = { decision, decidedAt };
      return next;
    });

    if (!decision) {
      const { error } = await supabase.from('onboarding_rollover_decisions').delete().eq('mindbody_client_id', id);
      if (error) await load();
      return;
    }

    const { error } = await supabase
      .from('onboarding_rollover_decisions')
      .upsert(
        {
          mindbody_client_id: id,
          decision,
          decided_at:         decidedAt,
          short_product:      meta.shortProduct || null,
          is_straight_in:     !!meta.isStraightIn,
          product:            meta.product || null,
        },
        { onConflict: 'mindbody_client_id' },
      );
    if (error) await load();
  }, [load]);

  return { decisions, getDecision, setDecision, loading };
}
