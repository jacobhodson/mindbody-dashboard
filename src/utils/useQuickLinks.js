import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Manager-curated sidebar "Quick links" (see 20261012000000_quick_links.sql).
 * Mirrors useMembershipPackages.js's shape. RLS restricts add/remove to
 * managers; the Sidebar only shows those controls to managers anyway.
 */
export function useQuickLinks() {
  const [links, setLinks]     = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('quick_links').select('*').order('sort_order').order('created_at');
    if (!error) setLinks(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addLink = useCallback(async (label, url) => {
    if (!label?.trim() || !url?.trim()) return null;
    let href = url.trim();
    if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
    const { data, error } = await supabase
      .from('quick_links').insert({ label: label.trim(), url: href }).select().single();
    if (error) return null;
    setLinks((prev) => [...prev, data]);
    return data;
  }, []);

  const removeLink = useCallback(async (id) => {
    const { error } = await supabase.from('quick_links').delete().eq('id', id);
    if (!error) setLinks((prev) => prev.filter((l) => l.id !== id));
  }, []);

  return { links, loading, addLink, removeLink, reload: load };
}
