import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Manager-only standing "effective wage" overrides for LER purposes —
 * see staff_wage_overrides' migration. Used instead of a Xero-derived
 * wage figure for whichever staff need it (e.g. a profit-share salary
 * that doesn't reflect face-to-face coaching value); never touches real
 * payroll. RLS on the table already restricts all access to managers, so
 * this hook has no isManager gate of its own — the caller (WageOverridesPanel)
 * doesn't render for non-managers anyway.
 */
export function useWageOverrides() {
  const [overrides, setOverrides] = useState({}); // staffId -> { effectiveWage, note, updatedAt }
  const [loading, setLoading]     = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    return supabase.from('staff_wage_overrides').select('*').then(({ data, error }) => {
      if (!error) {
        const map = {};
        for (const row of data || []) {
          map[row.staff_id] = { effectiveWage: row.effective_wage, note: row.note, updatedAt: row.updated_at };
        }
        setOverrides(map);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const setOverride = useCallback(async (staffId, effectiveWage, note, updatedBy) => {
    const { error } = await supabase.from('staff_wage_overrides').upsert(
      {
        staff_id:       staffId,
        effective_wage: effectiveWage,
        note:           note || null,
        updated_by:     updatedBy || null,
        updated_at:     new Date().toISOString(),
      },
      { onConflict: 'staff_id' },
    );
    if (!error) await load();
    return !error;
  }, [load]);

  const clearOverride = useCallback(async (staffId) => {
    const { error } = await supabase.from('staff_wage_overrides').delete().eq('staff_id', staffId);
    if (!error) await load();
    return !error;
  }, [load]);

  return { overrides, loading, setOverride, clearOverride };
}
