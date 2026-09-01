import { useState } from 'react';
import { TrendingDown, CheckCircle, ChevronDown } from 'lucide-react';
import { differenceInDays, parseISO, format } from 'date-fns';
import ContactModal          from './ContactModal.jsx';
import WeeklyAttendancePanel from './WeeklyAttendancePanel.jsx';

export default function PTRedsList({ data, loading, error, contactLog }) {
  const [selected, setSelected]     = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const clients = data?.ptReds || [];

  const isContacted   = contactLog?.isContacted  ?? (() => false);
  const logContact    = contactLog?.logContact    ?? null;
  const getClientLogs = contactLog?.getClientLogs ?? null;

  const toggleExpand = (id) => setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="rounded-xl border border-gray-200 bg-white flex flex-col">
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-red-600" />
          <h2 className="font-semibold text-gray-900">PT Red's List</h2>
          {!loading && (
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 border border-red-500/20">
              {clients.length}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">Had PT/SP last week · missed this week</p>
      </div>

      <div className="overflow-y-auto max-h-80 scrollbar-thin">
        {loading && (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-200" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="p-5 text-sm text-red-600">Could not load: {error}</p>
        )}

        {!loading && !error && clients.length === 0 && (
          <div className="py-10 text-center">
            <CheckCircle className="h-7 w-7 text-emerald-500/40 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No PT clients missed this week</p>
          </div>
        )}

        {!loading && !error && clients.map((client) => {
          const wasContacted = isContacted(client.id);
          const isExpanded   = expandedId === client.id;
          const lastSeen     = client.lastSession
            ? (() => {
                const days = differenceInDays(new Date(), parseISO(client.lastSession));
                if (days === 0) return 'Last seen today';
                if (days === 1) return 'Last seen yesterday';
                if (days < 14) return `Last seen ${days}d ago`;
                return `Last seen ${format(parseISO(client.lastSession), 'd MMM')}`;
              })()
            : null;

          return (
            <div key={client.id} className="border-b border-gray-200/60 last:border-0">
              <div
                className={`flex items-center justify-between px-5 py-3 hover:bg-gray-200/40 transition-colors cursor-pointer select-none ${wasContacted ? 'opacity-60' : ''}`}
                onClick={() => toggleExpand(client.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-800 truncate">{client.name || 'Unknown'}</p>
                    {client.service && (
                      <span className="shrink-0 text-[10px] font-medium text-gray-400 bg-gray-200 rounded px-1.5 py-0.5">
                        {client.service}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {client.email || client.phone || 'No contact details'}
                    {lastSeen && <span className="ml-2 text-gray-400">{lastSeen}</span>}
                    {client.staffName && <span className="ml-2 text-gray-400">· {client.staffName}</span>}
                  </p>
                </div>

                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelected(client); }}
                    className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                      wasContacted
                        ? 'border-gray-300 bg-gray-200 text-gray-500 hover:bg-gray-300 hover:text-gray-700'
                        : 'border-red-500/30 bg-red-500/10 text-red-600 hover:bg-red-500/20'
                    }`}
                  >
                    {wasContacted ? 'View log' : 'Contact'}
                  </button>
                  <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {isExpanded && <WeeklyAttendancePanel client={client} status="red" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
