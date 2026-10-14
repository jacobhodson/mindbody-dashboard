import { createContext, useContext, useMemo } from 'react';
import { BookOpen } from 'lucide-react';
import { flattenTree } from './usePlaybook.js';

/**
 * Lets any task row / form link to a Playbook SOP without threading props
 * through every tab: Dashboard provides the page list (for pickers) and
 * open(id), which switches to the Playbook tab on that page.
 */
const PlaybookLinkContext = createContext({ pages: [], open: () => {} });

export function PlaybookLinkProvider({ pages, open, children }) {
  const value = useMemo(() => ({ pages, open }), [pages, open]);
  return <PlaybookLinkContext.Provider value={value}>{children}</PlaybookLinkContext.Provider>;
}

export function usePlaybookLink() {
  return useContext(PlaybookLinkContext);
}

/** "How to" chip on a task — renders nothing if unlinked or the page is hidden/deleted. */
export function PlaybookChip({ pageId, className = '' }) {
  const { pages, open } = usePlaybookLink();
  const page = pageId && pages.find((p) => p.id === pageId);
  if (!page) return null;
  return (
    <button
      type="button"
      onClick={() => open(page.id)}
      title={`Open "${page.title}" in the Playbook`}
      className={`inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100 ${className}`}
    >
      <BookOpen className="h-3 w-3" /> How to: {page.title}
    </button>
  );
}

/** <select> of Playbook pages, indented by depth. value '' = no link. */
export function PlaybookPicker({ value, onChange, className = '' }) {
  const { pages } = usePlaybookLink();
  const options = useMemo(() => flattenTree(pages), [pages]);
  if (!options.length) return null;
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value || null)} aria-label="Playbook guide" className={className}>
      <option value="">No playbook guide</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>{'  '.repeat(p.depth)}{p.icon ? `${p.icon} ` : ''}{p.title}</option>
      ))}
    </select>
  );
}
