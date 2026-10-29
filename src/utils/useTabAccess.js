import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Per-role sidebar visibility (role_tab_access). A tab with no row falls back
 * to its built-in default: `managerOnly` tabs are hidden from coaches, every
 * other tab is visible. Admins always see everything. Tabs marked
 * `lockedManagerOnly` (their data is manager-only in the database) can never
 * be opened up to coaches — see PermissionsSettings.
 */
export function useTabAccess(enabled) {
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    if (!enabled) return;
    const { data } = await supabase.from('role_tab_access').select('role, tab_key, allowed');
    setRows(data || []);
  }, [enabled]);

  useEffect(() => { load(); }, [load]);

  const isAllowed = useCallback((role, tab) => {
    if (role === 'admin') return true;
    if (role !== 'manager' && tab.lockedManagerOnly) return false;
    const row = rows.find((r) => r.role === (role === 'manager' ? 'manager' : 'coach') && r.tab_key === tab.key);
    if (row) return row.allowed;
    return role === 'manager' || !tab.managerOnly;
  }, [rows]);

  const setAllowed = useCallback(async (role, tabKey, allowed, staffId) => {
    const { error } = await supabase.from('role_tab_access').upsert(
      { role, tab_key: tabKey, allowed, updated_at: new Date().toISOString(), updated_by: staffId || null },
      { onConflict: 'role,tab_key' },
    );
    if (error) return { error: error.message };
    setRows((prev) => [...prev.filter((r) => !(r.role === role && r.tab_key === tabKey)), { role, tab_key: tabKey, allowed }]);
    return {};
  }, []);

  return { isAllowed, setAllowed, reload: load };
}
