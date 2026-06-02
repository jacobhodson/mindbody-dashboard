import { useState } from 'react';
import { TrendingDown, Search, CheckCircle, ArrowUp, ArrowDown, ArrowRight, Sparkles } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import ContactModal from './ContactModal.jsx';

function TrendBadge({ trend }) {
  if (!trend) return null;
  const { direction, avg } = trend;

  if (direction === 'new') {
    return (
      <span className="flex items-center gap-1 text-xs text-blue-400">
        <Sparkles className="h-3 w-3" />
        New
      </span>
    );
  }

  const Icon  = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : ArrowRight;
  const color = direction === 'up' ? 'text-emerald-400' : direction === 'down' ? 'text-red-400' : 'text-gray-400';

  return (
    <span className={`flex items-center gap-0.5 text-xs tabular-nums ${color}`}>
      <Icon className="h-3 w-3" />
      <span className="text-gray-500">avg {avg}/wk</span>
    </span>
  );
}

export default function RedsList({ data, loading, error, contactLog, onboardingIds = new Set() }) {
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState(null);

  // Exclude clients currently in the onboarding pipeline — they're tracked separately
  const clients = (data?.reds || []).filter((c) => !onboardingIds.has(c.id));

  const isContacted   = contactLog?.isContacted  ?? (() => false);
  const logContact    = contactLog?.logContact    ?? null;
  const getClientLogs = contactLog?.getClientLogs ?? null;

  const filtered = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    );
  });

  // Count how many in this list are in the 7-day window
  const contactedCount = clients.filter((c) => isContacted(c.id)).length;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-red-400" />
          <h2 className="font-semibold text-white">Red's List</h2>
          {!loading && (
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400 border border-red-500/20">
              {clients.length}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">Active recently · missed this week</p>
      </div>

      {/* Search */}
      <div className="px-5 py-3 border-b border-gray-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or phone…"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-8 pr-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:border-red-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto max-h-96 scrollbar-thin">
        {loading && (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-800" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="p-5 text-sm text-red-400">Could not load: {error}</p>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="py-12 text-center">
            <CheckCircle className="h-8 w-8 text-emerald-500/40 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              {search ? 'No matches found' : "Red's list is clear"}
            </p>
          </div>
        )}

        {!loading && !error && filtered.map((client) => {
          const wasContacted = isContacted(client.id);
          const lastLog = contactLog?.contacted?.[String(client.id)];

          return (
            <div
              key={client.id}
              className={`flex items-center justify-between px-5 py-3 border-b border-gray-800/60 last:border-0 hover:bg-gray-800/40 transition-colors ${wasContacted ? 'opacity-60' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-200 truncate">{client.name || 'Unknown'}</p>
                  <TrendBadge trend={client.trend} />
                  {wasContacted && (
                    <span className="shrink-0 flex items-center gap-1 text-xs text-emerald-500">
                      <CheckCircle className="h-3 w-3" />
                      {lastLog ? formatDistanceToNow(new Date(lastLog.at), { addSuffix: true }) : 'Contacted'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {client.email || client.phone || 'No contact details'}
                  {client.service && (
                    <span className="ml-2 text-gray-600">{client.service}</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setSelected(client)}
                className={`ml-4 shrink-0 rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                  wasContacted
                    ? 'border-gray-700 bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
                    : 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                }`}
              >
                {wasContacted ? 'View log' : 'Contact'}
              </button>
            </div>
          );
        })}
      </div>

      {!loading && clients.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-800">
          <p className="text-xs text-gray-600">
            Showing {filtered.length} of {clients.length} · {contactedCount} contacted in last 7 days
          </p>
        </div>
      )}

      {selected && (
        <ContactModal
          client={selected}
          onClose={() => setSelected(null)}
          onContacted={() => {}}
          logContact={logContact}
          getClientLogs={getClientLogs}
        />
      )}
    </div>
  );
}
