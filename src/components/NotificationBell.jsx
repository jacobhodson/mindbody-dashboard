import { useState, useRef, useEffect } from 'react';
import { Bell, CheckSquare, Plane, CalendarClock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNotifications } from '../utils/useNotifications.js';
import DigestControls from './DigestControls.jsx';

const KIND = {
  task_assigned:   { Icon: CheckSquare,   tone: 'bg-emerald-100 text-emerald-700' },
  leave_decided:   { Icon: Plane,         tone: 'bg-sky-100 text-sky-700' },
  leave_requested: { Icon: CalendarClock, tone: 'bg-amber-100 text-amber-700' },
};

/**
 * Header bell: tasks someone else assigned you, decisions on your leave, and
 * (managers) new leave requests. Only ever your own — see notifications RLS.
 * Clicking one marks it read and jumps to the tab it's about.
 */
export default function NotificationBell({ onNavigate, staff, isManager }) {
  const { items, unread, loading, markRead, markAllRead, clearRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const go = (n) => {
    markRead(n.id);
    setOpen(false);
    if (n.link_tab) onNavigate?.(n.link_tab, n.link_id);
  };

  const hasRead = items.some((n) => n.read_at);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center rounded-lg bg-gray-200 px-2.5 py-1.5 text-gray-700 hover:bg-gray-300 hover:text-gray-900 transition-colors"
        aria-label={unread ? `Notifications (${unread} unread)` : 'Notifications'}
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-[1.1rem] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-[1.1rem] text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            <div className="flex gap-3 text-xs">
              {unread > 0 && <button onClick={markAllRead} className="text-emerald-700 hover:underline">Mark all read</button>}
              {hasRead && <button onClick={clearRead} className="text-gray-500 hover:text-gray-800">Clear read</button>}
            </div>
          </div>
          <div className="max-h-[26rem] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">You're all caught up.</p>
            ) : items.map((n) => {
              const k = KIND[n.kind] || KIND.task_assigned;
              return (
                <button
                  key={n.id}
                  onClick={() => go(n)}
                  className={`flex w-full gap-3 border-b border-gray-50 px-4 py-3 text-left hover:bg-gray-50 ${n.read_at ? '' : 'bg-emerald-50/40'}`}
                >
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${k.tone}`}>
                    <k.Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.read_at ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>{n.title}</span>
                    {n.body && <span className="block line-clamp-2 text-xs text-gray-500">{n.body}</span>}
                    <span className="block text-[11px] text-gray-400">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                  </span>
                  {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
                </button>
              );
            })}
          </div>
          {staff && <DigestControls staff={staff} isManager={isManager} />}
        </div>
      )}
    </div>
  );
}
