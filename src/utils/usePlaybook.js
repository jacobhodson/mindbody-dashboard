import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const LIST_COLUMNS = 'id, parent_id, title, icon, visibility, sort_order, content_text, updated_at, updated_by';

/**
 * The Playbook page tree (20261014020000_playbook.sql). Loads every page's
 * metadata + search text up front (small — titles and plain text); a page's
 * full Tiptap content is fetched when it's opened (loadPage).
 *
 * RLS hides managers-only pages from coaches. A coach could still be handed
 * an 'all' page whose parent is managers-only, so `pages` drops anything
 * whose ancestor chain isn't fully visible.
 */
export function usePlaybook() {
  const [rawPages, setRawPages] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('playbook_pages').select(LIST_COLUMNS).order('sort_order').order('created_at');
    if (err) setError(err.message);
    else { setRawPages(data || []); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pages = useMemo(() => visiblePages(rawPages), [rawPages]);

  const loadPage = useCallback(async (id) => {
    const { data, error: err } = await supabase.from('playbook_pages').select('*').eq('id', id).maybeSingle();
    if (err) { setError(err.message); return null; }
    return data;
  }, []);

  const createPage = useCallback(async ({ parent_id = null, title, visibility = 'all' }) => {
    const siblings = rawPages.filter((p) => p.parent_id === parent_id);
    const sort_order = siblings.length ? Math.max(...siblings.map((p) => p.sort_order)) + 1 : 0;
    const { data, error: err } = await supabase
      .from('playbook_pages').insert({ parent_id, title, visibility, sort_order })
      .select(LIST_COLUMNS).single();
    if (err) { setError(err.message); return null; }
    setRawPages((prev) => [...prev, data]);
    return data;
  }, [rawPages]);

  const updatePage = useCallback(async (id, patch) => {
    const { data, error: err } = await supabase
      .from('playbook_pages').update(patch).eq('id', id).select('*').single();
    if (err) { setError(err.message); return null; }
    setRawPages((prev) => prev.map((p) => (p.id === id ? pick(data) : p)));
    return data;
  }, []);

  const deletePage = useCallback(async (id) => {
    const { error: err } = await supabase.from('playbook_pages').delete().eq('id', id);
    if (err) { setError(err.message); return false; }
    await load(); // children cascade server-side
    return true;
  }, [load]);

  // Move a page up (-1) or down (+1) among its siblings, then renumber the
  // siblings 0..n so ties (e.g. several at 0) can't make a move a no-op.
  const movePage = useCallback(async (page, direction) => {
    const siblings = childrenOf(rawPages, page.parent_id);
    const i = siblings.findIndex((p) => p.id === page.id);
    const j = i + direction;
    if (j < 0 || j >= siblings.length) return;
    [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
    const { error: err } = await supabase.rpc('reorder_playbook_pages', { p_ids: siblings.map((p) => p.id) });
    if (err) setError(err.message);
    await load();
  }, [rawPages, load]);

  return { pages, loading, error, loadPage, createPage, updatePage, deletePage, movePage, reload: load };
}

function pick(row) {
  const { id, parent_id, title, icon, visibility, sort_order, content_text, updated_at, updated_by } = row;
  return { id, parent_id, title, icon, visibility, sort_order, content_text, updated_at, updated_by };
}

export function visiblePages(rawPages) {
  const byId = new Map(rawPages.map((p) => [p.id, p]));
  const ok = (p, depth = 0) => {
    if (!p.parent_id) return true;
    const parent = byId.get(p.parent_id);
    return !!parent && depth < 20 && ok(parent, depth + 1);
  };
  return rawPages.filter((p) => ok(p));
}

/** Children of `parentId` (null = top-level sections), in menu order. */
export function childrenOf(pages, parentId) {
  return pages
    .filter((p) => (p.parent_id || null) === (parentId || null))
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
}

/** [root, …, page] — for breadcrumbs. */
export function pathTo(pages, id) {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const path = [];
  let cur = byId.get(id);
  while (cur && path.length < 20) { path.unshift(cur); cur = byId.get(cur.parent_id); }
  return path;
}

/** Pages flattened in menu order with their depth — for pickers. */
export function flattenTree(pages, parentId = null, depth = 0, out = []) {
  for (const p of childrenOf(pages, parentId)) {
    out.push({ ...p, depth });
    flattenTree(pages, p.id, depth + 1, out);
  }
  return out;
}

/** Upload an image for an SOP; returns its public URL. Managers only (storage RLS). */
export async function uploadPlaybookImage(file) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('playbook-media').upload(path, file, { contentType: file.type });
  if (error) throw error;
  return supabase.storage.from('playbook-media').getPublicUrl(path).data.publicUrl;
}
