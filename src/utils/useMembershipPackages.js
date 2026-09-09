import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Manager-managed list of membership package names — deliberately manual,
 * not synced from Mindbody (see 20260909000000_client_packages_and_group_caseload.sql).
 * Mirrors useAllStaff.js's shape.
 */
export function useMembershipPackages() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('membership_packages').select('*').eq('active', true).order('sort_order').order('name');
    if (!error) setPackages(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // RLS restricts this to managers — the UI only exposes the "add new"
  // affordance to managers anyway, same division of labour as elsewhere.
  const createPackage = useCallback(async (name) => {
    if (!name?.trim()) return null;
    const { data, error } = await supabase
      .from('membership_packages').insert({ name: name.trim() }).select().single();
    if (error) return null;
    setPackages((prev) => [...prev, data].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
    return data;
  }, []);

  return { packages, loading, createPackage, reload: load };
}
