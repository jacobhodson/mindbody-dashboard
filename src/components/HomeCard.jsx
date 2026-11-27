import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const TONES = {
  amber:  { box: 'border-amber-300/60 bg-amber-50/40',  icon: 'text-amber-600',  badge: 'border-amber-500/30 bg-amber-500/20 text-amber-700',  solid: 'bg-amber-500 text-white' },
  sky:    { box: 'border-sky-200 bg-sky-50/40',         icon: 'text-sky-600',    badge: 'border-sky-500/30 bg-sky-500/20 text-sky-700',        solid: 'bg-sky-600 text-white' },
  violet: { box: 'border-violet-300/60 bg-violet-50/40', icon: 'text-violet-600', badge: 'border-violet-500/30 bg-violet-500/20 text-violet-700', solid: 'bg-violet-600 text-white' },
  gray:   { box: 'border-gray-200 bg-white',            icon: 'text-gray-700',   badge: 'border-gray-300 bg-gray-100 text-gray-600',          solid: 'bg-gray-700 text-white' },
};

const storageKey = (id) => `home-card-collapsed:${id}`;

/** A small solid count pill — the "highlighted number" on a minimised card. */
export function CountPill({ tone = 'amber', children }) {
  return (
    <span className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums ${TONES[tone].solid}`}>
      {children}
    </span>
  );
}

/**
 * The shell of a Home pop-up card (reminders, allocations, approvals…): icon,
 * headline, count badge, and an arrow that minimises the card to that one
 * line. Minimised state is remembered per card on this device
 * (localStorage), so a card you've tucked away stays tucked away.
 * `summary` replaces the count on the minimised line when one number isn't
 * enough (e.g. the Reminders card shows a pill per reminder).
 */
export default function HomeCard({ id, tone = 'amber', icon: Icon, title, count, actions, summary, children }) {
  const t = TONES[tone];
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(storageKey(id)) === '1'; } catch { return false; }
  });
  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem(storageKey(id), c ? '0' : '1'); } catch { /* private mode */ }
    return !c;
  });

  return (
    <div className={`rounded-xl border ${t.box} ${collapsed ? 'px-4 py-2.5' : 'p-5'}`}>
      <div className={`flex items-center gap-2 ${collapsed ? '' : 'mb-1'}`}>
        <button onClick={toggle} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={!collapsed}>
          {Icon && <Icon className={`h-4 w-4 shrink-0 ${t.icon}`} />}
          <h2 className="truncate font-semibold text-gray-900">{title}</h2>
          {collapsed && summary ? (
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">{summary}</span>
          ) : count != null && (
            collapsed
              ? <CountPill tone={tone}>{count}</CountPill>
              : <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${t.badge}`}>{count}</span>
          )}
        </button>
        {!collapsed && actions}
        <button
          onClick={toggle}
          title={collapsed ? 'Expand' : 'Minimise'}
          aria-label={collapsed ? `Expand ${title}` : `Minimise ${title}`}
          className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-black/5 hover:text-gray-700"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </button>
      </div>
      {!collapsed && children}
    </div>
  );
}
