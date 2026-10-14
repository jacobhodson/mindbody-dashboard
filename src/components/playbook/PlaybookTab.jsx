import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  BookOpen, ChevronRight, ChevronDown, Plus, Search, Pencil, Trash2, ArrowUp, ArrowDown,
  Lock, Globe, FileText, Menu, X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { childrenOf, pathTo } from '../../utils/usePlaybook.js';
import { useAllStaff } from '../../utils/useAllStaff.js';
import PlaybookEditor, { PlaybookContent } from './PlaybookEditor.jsx';

/**
 * The Playbook hub — the team's SOPs and handbooks. One sidebar entry; the
 * hub has its own contents menu (sections → pages, any depth) on the left.
 * Everyone reads; managers create, edit, reorder, hide (managers-only) and
 * delete. `playbook` is the usePlaybook() result, owned by Dashboard so task
 * "How to" links can share it.
 */
export default function PlaybookTab({ playbook, isManager, pageId, onSelectPage }) {
  const { pages, loading, error } = playbook;
  const { staffList } = useAllStaff();
  const nameById = useMemo(() => Object.fromEntries(staffList.map((s) => [s.id, s.full_name])), [staffList]);
  const [menuOpen, setMenuOpen] = useState(false);     // mobile only
  const [editNewId, setEditNewId] = useState(null);    // a just-created page opens in edit mode
  const dirtyRef = useRef(false);

  // Unsaved-edit guard for moving around inside the hub (and leaving the site).
  const select = useCallback((id) => {
    if (dirtyRef.current && !window.confirm('You have unsaved changes on this page. Leave without saving?')) return;
    dirtyRef.current = false;
    setMenuOpen(false);
    onSelectPage(id);
  }, [onSelectPage]);
  useEffect(() => {
    const warn = (e) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // A link to a page that's since been deleted/hidden falls back to the hub home.
  const page = pageId ? pages.find((p) => p.id === pageId) : null;

  const addPage = async (parent) => {
    const created = await playbook.createPage({
      parent_id: parent?.id || null,
      title: parent ? 'Untitled page' : 'New section',
      visibility: parent?.visibility === 'managers' ? 'managers' : 'all',
    });
    if (created) { setEditNewId(created.id); select(created.id); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><BookOpen className="h-5 w-5" /> Playbook</h1>
          <p className="text-sm text-gray-500">Our SOPs, playbooks and handbooks — how we do things at Newstrength.</p>
        </div>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 md:hidden"
        >
          {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />} Contents
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[15rem_1fr]">
        <aside className={`${menuOpen ? 'block' : 'hidden'} md:block`}>
          <PlaybookMenu pages={pages} activeId={page?.id} isManager={isManager} onSelect={select} onAddSection={() => addPage(null)} />
        </aside>

        <main className="min-w-0">
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : page ? (
            <PageView
              key={page.id}
              page={page}
              playbook={playbook}
              isManager={isManager}
              nameById={nameById}
              startEditing={editNewId === page.id}
              dirtyRef={dirtyRef}
              onSelect={select}
              onAddChild={() => addPage(page)}
              onEdited={() => setEditNewId(null)}
            />
          ) : (
            <HubHome pages={pages} isManager={isManager} nameById={nameById} onSelect={select} onAddSection={() => addPage(null)} />
          )}
        </main>
      </div>
    </div>
  );
}

// ── Contents menu ──────────────────────────────────────────────────────────

function PlaybookMenu({ pages, activeId, isManager, onSelect, onAddSection }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());

  // Keep the open page's ancestors expanded.
  useEffect(() => {
    if (!activeId) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      pathTo(pages, activeId).forEach((p) => next.add(p.id));
      return next;
    });
  }, [activeId, pages]);

  const toggle = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return pages
      .map((p) => {
        const inTitle = p.title.toLowerCase().includes(q);
        const idx = (p.content_text || '').toLowerCase().indexOf(q);
        if (!inTitle && idx < 0) return null;
        const snippet = idx >= 0 ? `…${p.content_text.slice(Math.max(0, idx - 30), idx + q.length + 50).replace(/\s+/g, ' ')}…` : null;
        return { page: p, inTitle, snippet };
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.inTitle) - Number(a.inTitle));
  }, [pages, q]);

  return (
    <nav className="space-y-3 md:sticky md:top-[96px]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the playbook…"
          aria-label="Search the playbook"
          className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {q ? (
        results.length === 0 ? (
          <p className="px-1 text-xs text-gray-500">Nothing matches "{query}".</p>
        ) : (
          <ul className="space-y-1">
            {results.map(({ page, snippet }) => (
              <li key={page.id}>
                <button onClick={() => { onSelect(page.id); setQuery(''); }} className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-gray-100">
                  <span className="block text-sm text-gray-900">{page.icon} {page.title}</span>
                  <span className="block text-[11px] text-gray-400">{pathTo(pages, page.id).slice(0, -1).map((p) => p.title).join(' › ') || 'Section'}</span>
                  {snippet && <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">{snippet}</span>}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <button
            onClick={() => onSelect(null)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium ${!activeId ? 'bg-emerald-500/10 text-emerald-700' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <BookOpen className="h-4 w-4" /> Playbook home
          </button>
          <MenuLevel pages={pages} parentId={null} depth={0} activeId={activeId} expanded={expanded} onToggle={toggle} onSelect={onSelect} />
          {isManager && (
            <button onClick={onAddSection} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/10">
              <Plus className="h-3.5 w-3.5" /> New section
            </button>
          )}
        </>
      )}
    </nav>
  );
}

function MenuLevel({ pages, parentId, depth, activeId, expanded, onToggle, onSelect }) {
  const items = childrenOf(pages, parentId);
  if (!items.length) return null;
  return (
    <ul className={depth ? 'ml-3 border-l border-gray-200 pl-1.5' : 'space-y-0.5'}>
      {items.map((p) => {
        const hasKids = pages.some((c) => c.parent_id === p.id);
        const open = expanded.has(p.id);
        return (
          <li key={p.id}>
            <div className={`flex items-center rounded-lg ${activeId === p.id ? 'bg-emerald-500/10' : 'hover:bg-gray-100'}`}>
              <button
                onClick={() => hasKids && onToggle(p.id)}
                aria-label={open ? 'Collapse' : 'Expand'}
                className={`p-1 text-gray-400 ${hasKids ? 'hover:text-gray-700' : 'invisible'}`}
              >
                {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => { onSelect(p.id); if (hasKids && !open) onToggle(p.id); }}
                className={`min-w-0 flex-1 truncate py-1.5 pr-2 text-left text-sm ${
                  activeId === p.id ? 'font-medium text-emerald-700' : depth === 0 ? 'font-medium text-gray-800' : 'text-gray-600'
                }`}
              >
                {p.icon && <span className="mr-1">{p.icon}</span>}{p.title}
                {p.visibility === 'managers' && <Lock className="ml-1 inline h-3 w-3 text-gray-400" />}
              </button>
            </div>
            {hasKids && open && (
              <MenuLevel pages={pages} parentId={p.id} depth={depth + 1} activeId={activeId} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ── Hub home ───────────────────────────────────────────────────────────────

function descendantCount(pages, id) {
  const kids = pages.filter((p) => p.parent_id === id);
  return kids.reduce((n, k) => n + 1 + descendantCount(pages, k.id), 0);
}

function HubHome({ pages, isManager, nameById, onSelect, onAddSection }) {
  const sections = childrenOf(pages, null);
  const recent = useMemo(
    () => [...pages].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6),
    [pages],
  );

  if (!sections.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
        <BookOpen className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-2 text-sm text-gray-600">The Playbook is empty.</p>
        {isManager ? (
          <button onClick={onAddSection} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">
            <Plus className="h-4 w-4" /> Create the first section
          </button>
        ) : (
          <p className="mt-1 text-xs text-gray-400">A manager will add SOPs here soon.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => {
          const n = descendantCount(pages, s.id);
          return (
            <button key={s.id} onClick={() => onSelect(s.id)} className="rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/30">
              <p className="text-2xl leading-none">{s.icon || '📘'}</p>
              <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-gray-900">
                {s.title}{s.visibility === 'managers' && <Lock className="h-3 w-3 text-gray-400" />}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">{n} page{n === 1 ? '' : 's'}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Recently updated</h2>
        <ul className="divide-y divide-gray-100">
          {recent.map((p) => (
            <li key={p.id}>
              <button onClick={() => onSelect(p.id)} className="flex w-full items-center justify-between gap-3 py-2 text-left">
                <span className="min-w-0 truncate text-sm text-gray-800">{p.icon} {p.title}</span>
                <span className="shrink-0 text-[11px] text-gray-400">
                  {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}{nameById[p.updated_by] ? ` · ${nameById[p.updated_by]}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── A page ─────────────────────────────────────────────────────────────────

function PageView({ page, playbook, isManager, nameById, startEditing, dirtyRef, onSelect, onAddChild, onEdited }) {
  const [full, setFull]         = useState(null);
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState(null);
  const [saving, setSaving]     = useState(false);
  const crumbs = pathTo(playbook.pages, page.id);
  const kids = childrenOf(playbook.pages, page.id);
  const siblings = childrenOf(playbook.pages, page.parent_id);
  const index = siblings.findIndex((p) => p.id === page.id);

  useEffect(() => {
    let cancelled = false;
    playbook.loadPage(page.id).then((data) => { if (!cancelled) setFull(data); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  const beginEdit = useCallback((data) => {
    setDraft({ title: data.title, icon: data.icon || '', json: data.content, text: data.content_text, contentChanged: false });
    setEditing(true);
  }, []);

  useEffect(() => {
    if (startEditing && full && !editing) { beginEdit(full); onEdited(); }
  }, [startEditing, full, editing, beginEdit, onEdited]);

  const isDirty = editing && draft && full && (
    draft.title !== full.title || (draft.icon || '') !== (full.icon || '') || draft.contentChanged
  );
  useEffect(() => { dirtyRef.current = !!isDirty; }, [isDirty, dirtyRef]);
  useEffect(() => () => { dirtyRef.current = false; }, [dirtyRef]);

  const save = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    const patch = { title: draft.title.trim(), icon: draft.icon.trim() || null };
    if (draft.contentChanged) { patch.content = draft.json; patch.content_text = draft.text.replace(/\n{2,}/g, '\n').trim(); }
    const saved = await playbook.updatePage(page.id, patch);
    setSaving(false);
    if (saved) { setFull(saved); setEditing(false); setDraft(null); }
  };

  const cancel = () => {
    if (isDirty && !window.confirm('Discard your changes?')) return;
    setEditing(false); setDraft(null);
  };

  const remove = async () => {
    const n = descendantCount(playbook.pages, page.id);
    const msg = n
      ? `Delete "${page.title}" and the ${n} page${n === 1 ? '' : 's'} inside it? This can't be undone.`
      : `Delete "${page.title}"? This can't be undone.`;
    if (!window.confirm(msg)) return;
    dirtyRef.current = false;
    if (await playbook.deletePage(page.id)) onSelect(page.parent_id || null);
  };

  const toggleVisibility = () => playbook.updatePage(page.id, { visibility: page.visibility === 'managers' ? 'all' : 'managers' });

  const iconBtn = 'flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40';

  return (
    <article className="space-y-4">
      <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
        <button onClick={() => onSelect(null)} className="hover:text-gray-800">Playbook</button>
        {crumbs.slice(0, -1).map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            <button onClick={() => onSelect(c.id)} className="hover:text-gray-800">{c.title}</button>
          </span>
        ))}
      </div>

      {editing && draft ? (
        <div className="flex gap-2">
          <input
            value={draft.icon}
            onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
            placeholder="📘"
            aria-label="Icon (emoji)"
            maxLength={4}
            className="w-14 rounded-lg border border-gray-300 bg-gray-50 px-2 py-1.5 text-center text-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="Page title"
            aria-label="Page title"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-xl font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      ) : (
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">{page.icon && <span className="mr-2">{page.icon}</span>}{page.title}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>Updated {formatDistanceToNow(new Date(page.updated_at), { addSuffix: true })}{nameById[page.updated_by] ? ` by ${nameById[page.updated_by]}` : ''}</span>
            {page.visibility === 'managers' && (
              <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700"><Lock className="h-3 w-3" /> Managers only</span>
            )}
          </p>
        </div>
      )}

      {isManager && !editing && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => full && beginEdit(full)} disabled={!full} className={iconBtn}><Pencil className="h-3.5 w-3.5" /> Edit</button>
          <button onClick={onAddChild} className={iconBtn}><Plus className="h-3.5 w-3.5" /> Add page inside</button>
          <button onClick={() => playbook.movePage(page, -1)} disabled={index <= 0} title="Move up" className={iconBtn}><ArrowUp className="h-3.5 w-3.5" /></button>
          <button onClick={() => playbook.movePage(page, 1)} disabled={index === siblings.length - 1} title="Move down" className={iconBtn}><ArrowDown className="h-3.5 w-3.5" /></button>
          <button onClick={toggleVisibility} className={iconBtn} title="Who can see this page (and everything inside it)">
            {page.visibility === 'managers' ? <><Globe className="h-3.5 w-3.5" /> Show to everyone</> : <><Lock className="h-3.5 w-3.5" /> Managers only</>}
          </button>
          <button onClick={remove} className={`${iconBtn} hover:border-red-200 hover:text-red-600`}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
        </div>
      )}

      {editing && draft ? (
        <div className="space-y-3">
          <PlaybookEditor
            content={full?.content}
            onChange={({ json, text }) => setDraft((d) => ({ ...d, json, text, contentChanged: true }))}
          />
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !draft.title.trim()} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={cancel} className="rounded-lg px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      ) : full === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : full.content ? (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <PlaybookContent content={full.content} />
        </div>
      ) : (
        !kids.length && (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            This page is empty{isManager ? ' — click Edit to write it.' : '.'}
          </p>
        )
      )}

      {!editing && kids.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">In this section</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {kids.map((k) => (
              <button key={k.id} onClick={() => onSelect(k.id)} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left hover:border-emerald-300">
                {k.icon ? <span>{k.icon}</span> : <FileText className="h-4 w-4 text-gray-400" />}
                <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{k.title}</span>
                {k.visibility === 'managers' && <Lock className="h-3 w-3 text-gray-400" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
