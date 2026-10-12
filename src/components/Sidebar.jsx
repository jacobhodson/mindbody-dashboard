import { useState, useEffect } from 'react';
import { ChevronsLeft, ChevronsRight, ChevronDown, ExternalLink, Link2, Plus, Trash2, X } from 'lucide-react';
import { useQuickLinks } from '../utils/useQuickLinks.js';

/**
 * Two independent responsive behaviors:
 *  - Mobile (< md): off-canvas drawer, hidden by default, toggled by the
 *    hamburger button in Dashboard's header (mobileOpen/onCloseMobile,
 *    controlled from there since the toggle button lives in a sibling).
 *  - Desktop (>= md): inline in the layout as before, with its own
 *    collapse-to-icons toggle (persisted locally per browser).
 */
export default function Sidebar({ tabs, activeTab, onSelect, atRiskCount, mobileOpen, onCloseMobile, isManager }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  const handleSelect = (key) => {
    onSelect(key);
    onCloseMobile?.();
  };

  return (
    <>
      {/* Backdrop — mobile drawer only */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onCloseMobile} />
      )}

      <nav
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white py-4 px-3
          transition-transform duration-200 ease-in-out
          md:sticky md:top-[79px] md:z-auto md:h-[calc(100vh-79px)] md:translate-x-0 md:transition-[width] md:duration-200
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          ${collapsed ? 'md:w-16' : 'md:w-56'}`}
      >
        <button
          onClick={onCloseMobile}
          className="mb-2 self-end text-gray-400 hover:text-gray-700 md:hidden"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex-1 space-y-1 overflow-y-auto">
          {tabs.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => handleSelect(key)}
              title={collapsed ? label : undefined}
              className={`flex w-full items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors ${
                collapsed ? 'md:justify-center' : ''
              } ${
                activeTab === key
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={`flex-1 text-left ${collapsed ? 'md:hidden' : ''}`}>{label}</span>
              {key === 'onboarding' && atRiskCount > 0 && (
                <span className={`rounded-full border border-red-500/30 bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-600 ${collapsed ? 'md:hidden' : ''}`}>
                  {atRiskCount}
                </span>
              )}
            </button>
          ))}

          <QuickLinks
            collapsed={collapsed}
            onExpandSidebar={() => setCollapsed(false)}
            isManager={isManager}
          />
        </div>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 md:flex"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : (<><ChevronsLeft className="h-4 w-4" /> Collapse</>)}
        </button>
      </nav>
    </>
  );
}

/**
 * Expandable "Quick links" section under the tabs. Open/closed is remembered
 * per browser like the collapse toggle. Managers get add/remove controls.
 * In the collapsed (icons-only) desktop sidebar, clicking the icon expands
 * the sidebar and opens the list rather than trying to fit links into 64px.
 */
function QuickLinks({ collapsed, onExpandSidebar, isManager }) {
  const { links, addLink, removeLink } = useQuickLinks();
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('quick-links-open') === '1'; } catch { return false; }
  });
  const [adding, setAdding] = useState(false);
  const [label, setLabel]   = useState('');
  const [url, setUrl]       = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try { localStorage.setItem('quick-links-open', open ? '1' : '0'); } catch { /* ignore */ }
  }, [open]);

  const toggle = () => {
    if (collapsed) { onExpandSidebar(); setOpen(true); return; }
    setOpen((o) => !o);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!label.trim() || !url.trim()) return;
    setSaving(true);
    const added = await addLink(label, url);
    setSaving(false);
    if (added) { setLabel(''); setUrl(''); setAdding(false); }
  };

  const remove = (link) => {
    if (window.confirm(`Remove "${link.label}" from Quick links?`)) removeLink(link.id);
  };

  const inputClass = 'w-full rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="mt-3 border-t border-gray-200 pt-3">
      <button
        onClick={toggle}
        title={collapsed ? 'Quick links' : undefined}
        aria-expanded={open && !collapsed}
        className={`flex w-full items-center gap-2.5 rounded-lg border-l-2 border-transparent px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 ${
          collapsed ? 'md:justify-center' : ''
        }`}
      >
        <Link2 className="h-4 w-4 shrink-0" />
        <span className={`flex-1 text-left ${collapsed ? 'md:hidden' : ''}`}>Quick links</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${collapsed ? 'md:hidden' : ''}`} />
      </button>

      {open && (
        <div className={`mt-1 space-y-0.5 pl-3 ${collapsed ? 'md:hidden' : ''}`}>
          {links.length === 0 && !adding && (
            <p className="px-3 py-1.5 text-xs text-gray-400">
              {isManager ? 'No links yet — add one below.' : 'No links yet.'}
            </p>
          )}

          {links.map((link) => (
            <div key={link.id} className="group flex items-center rounded-lg hover:bg-gray-100">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                title={link.url}
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                <span className="truncate">{link.label}</span>
                <ExternalLink className="h-3 w-3 shrink-0 text-gray-400" />
              </a>
              {isManager && (
                <button
                  onClick={() => remove(link)}
                  title="Remove link"
                  className="mr-1 rounded p-1 text-gray-400 opacity-0 transition-opacity hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}

          {isManager && (adding ? (
            <form onSubmit={submit} className="space-y-1.5 px-3 py-2">
              <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Display text, e.g. Newstrength Website" aria-label="Display text" className={inputClass} />
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link, e.g. www.newstrength.com.au" aria-label="Link" className={inputClass} />
              <div className="flex gap-1.5">
                <button
                  type="submit"
                  disabled={saving || !label.trim() || !url.trim()}
                  className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? 'Adding…' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setLabel(''); setUrl(''); }}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/10"
            >
              <Plus className="h-3.5 w-3.5" /> Add link
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
