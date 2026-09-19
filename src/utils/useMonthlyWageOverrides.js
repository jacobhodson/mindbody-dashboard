import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Manager-only per-MONTH wage overrides — see
 * 20260925000000_monthly_wage_overrides_and_rolling30.sql. A month-specific
 * row beats the standing override (useWageOverrides.js), which beats Xero.
 *
 * Writes go through the set_monthly_wage_override() RPC rather than the
 * table directly: it also recomputes that month's ler_monthly rows so the
 * LER table and Team tab reflect the change immediately, not at the next
 * nightly snapshot.
 *
 *   overrides                          -> { 'staffId|yyyy-MM-01': { effectiveWage, note } }
 *   setMonthlyOverride(staffId, month, wage, note)   month = 'yyyy-MM-01'
 *   clearMonthlyOverride(staffId, month)
 */
export function useMonthlyWageOverrides(isManager) {
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading]     = useState(true);

  const load = useCallback(() => {
    return supabase.from('staff_wage_overrides_monthly').select('*').then(({ data, error }) => {
      if (error) return;
      const map = {};
      for (const row of data || []) {
        map[`${row.staff_id}|${row.month}`] = { effectiveWage: row.effective_wage, note: row.note };
      }
      setOverrides(map);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isManager) { setLoading(false); return; }
    load();
  }, [isManager, load]);

  const setMonthlyOverride = useCallback(async (staffId, month, wage, note) => {
    const { error } = await supabase.rpc('set_monthly_wage_override', {
      p_staff_id: staffId, p_month: month, p_wage: wage, p_note: note || null,
    });
    if (!error) await load();
    return !error;
  }, [load]);

  const clearMonthlyOverride = useCallback(async (staffId, month) => {
    const { error } = await supabase.rpc('set_monthly_wage_override', {
      p_staff_id: staffId, p_month: month, p_wage: null, p_note: null,
    });
    if (!error) await load();
    return !error;
  }, [load]);

  return { overrides, loading, setMonthlyOverride, clearMonthlyOverride, reload: load };
}
