import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Manual corrections to an onboarding client's start date — see
 * mb-onboarding.js's header and the onboarding_start_overrides migration.
 * Same shape/pattern as useOnboardingRollover.js (keyed by Mindbody client
 * ID, since onboarding clients aren't otherwise a persistent row anywhere).
 *
 * mb-onboarding.js applies these server-side before computing each client's
 * week, so setting one here just needs a refetch (passed in as `onSaved`) to
 * see it take effect — this hook doesn't do any week math itself.
 *
 * Returns:
 *   getOverride(clientId)              → 'yyyy-MM-dd' | null
 *   setStartOverride(clientId, date)   → Promise<void> (pass null/'' to clear)
 *   loading
 */
export function useOnboardingStartOverrides(staff) {
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading]     = useState(true);

  const load = useCallback(() => {
    return supabase
      .from('onboarding_start_overrides')
      .select('mindbody_client_id, start_date')
      .then(({ data, error }) => {
        if (error || !data) return;
        const map = {};
        for (const row of data) map[row.mindbody_client_id] = row.start_date;
        setOverrides(map);
      });
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const getOverride = useCallback(
    (clientId) => overrides[String(clientId)] ?? null,
    [overrides]
  );

  const setStartOverride = useCallback(async (clientId, dateStr) => {
    const id = String(clientId);

    if (!dateStr) {
      setOverrides((prev) => { const next = { ...prev }; delete next[id]; return next; });
      const { error } = await supabase.from('onboarding_start_overrides').delete().eq('mindbody_client_id', id);
      if (error) await load();
      return;
    }

    setOverrides((prev) => ({ ...prev, [id]: dateStr })); // optimistic
    const { error } = await supabase
      .from('onboarding_start_overrides')
      .upsert(
        { mindbody_client_id: id, start_date: dateStr, set_by: staff?.id || null, updated_at: new Date().toISOString() },
        { onConflict: 'mindbody_client_id' },
      );
    if (error) await load();
  }, [staff, load]);

  return { getOverride, setStartOverride, loading, reload: load };
}
