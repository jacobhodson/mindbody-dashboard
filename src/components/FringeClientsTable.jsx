import { useState } from 'react';
import { Users, ArrowUp, ArrowDown, ArrowRight, Sparkles } from 'lucide-react';

const SEGMENTS = [
  {
    key: 'atRisk',
    label: 'At-Risk',
    desc: '1 session this week',
    dot: 'bg-orange-400',
    badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    active: 'border-orange-400 text-orange-400',
  },
  {
    key: 'moderate',
    label: 'Moderate',
    desc: '2–3 sessions this week',
    dot: 'bg-yellow-400',
    badge: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    active: 'border-yellow-400 text-yellow-400',
  },
  {
    key: 'engaged',
    label: 'Engaged',
    desc: '4+ sessions this week',
    dot: 'bg-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    active: 'border-emerald-400 text-emerald-400',
  },
];

function TrendIndicator({ trend }) {
  if (!trend) return null;
  const { direction, avg } = trend;

  if (direction === 'new') {
    return (
      <span className="flex items-center gap-0.5 text-xs text-blue-400">
        <Sparkles className="h-3 w-3" />
        <span className="text-gray-500">new</span>
      </span>
    );
  }

  const Icon  = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : ArrowRight;
  const color = direction === 'up' ? 'text-emerald-400' : direction === 'down' ? 'text-red-400' : 'text-gray-400';

  return (
    <span className={`flex items-center gap-0.5 text-xs tabular-nums ${color}`}>
      <Icon className="h-3 w-3" />
      <span className="text-gray-500">{avg}/wk</span>
    </span>
  );
}

export default function FringeClientsTable({ data, loading, error }) {
  const [activeTab, setActiveTab] = useState('atRisk');
  const segments = data?.fringeSegments || {};

  const currentSeg    = SEGMENTS.find((s) => s.key === activeTab);
  const currentClients = segments[activeTab]?.clients || [];
  const currentCount   = segments[activeTab]?.count   || 0;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gray-400" />
          <h2 className="font-semibold text-white">Fringe Clients</h2>
        </div>
        <p className="text-xs text-gray-500">Segmented by sessions · last 7 days</p>
      </div>

      {/* Segment tabs */}
      <div className="flex border-b border-gray-800 overflow-x-auto">
        {SEGMENTS.map((seg) => {
          const count = segments[seg.key]?.count || 0;
          const isActive = activeTab === seg.key;
          return (
            <button
              key={seg.key}
              onClick={() => setActiveTab(seg.key)}
              className={`flex-1 min-w-[80px] px-3 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? `${seg.active} bg-gray-800/40`
                  : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/20'
              }`}
            >
              <span className="flex flex-col items-center gap-1">
                <span className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${seg.dot}`} />
                  {seg.label}
                </span>
                {!loading && (
                  <span className="text-[10px] font-bold tabular-nums">{count}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab description */}
      {currentSeg && (
        <div className="px-5 py-2 border-b border-gray-800/60">
          <p className="text-xs text-gray-500">{currentSeg.desc}</p>
        </div>
      )}

      {/* Client list */}
      <div className="overflow-y-auto max-h-80 scrollbar-thin flex-1">
        {loading && (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-800" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="p-5 text-sm text-red-400">Could not load: {error}</p>
        )}

        {!loading && !error && currentClients.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-600">No clients in this segment</p>
        )}

        {!loading && !error && currentClients.map((client) => {
          const fullyUtil = client.isFullyUtilising;
          return (
            <div
              key={client.id}
              className={`flex items-center justify-between px-5 py-2.5 border-b border-gray-800/50 last:border-0 transition-colors ${
                fullyUtil
                  ? 'border-l-2 border-l-emerald-500 bg-emerald-950/20 hover:bg-emerald-950/30'
                  : 'hover:bg-gray-800/30'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm truncate ${fullyUtil ? 'text-emerald-200 font-medium' : 'text-gray-200'}`}>
                    {client.name || 'Unknown'}
                  </p>
                  {fullyUtil && (
                    <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                      2× ✓
                    </span>
                  )}
                  <TrendIndicator trend={client.trend} />
                </div>
                <p className="text-xs text-gray-600 truncate">{client.email || client.phone || '–'}</p>
              </div>
              <span className={`ml-3 shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${
                fullyUtil
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : currentSeg?.badge
              }`}>
                {client.sessionsThisWeek} {client.sessionsThisWeek === 1 ? 'session' : 'sessions'}
              </span>
            </div>
          );
        })}
      </div>

      {!loading && currentCount > currentClients.length && (
        <div className="px-5 py-3 border-t border-gray-800">
          <p className="text-xs text-gray-600">
            Showing {currentClients.length} of {currentCount} clients in this segment
          </p>
        </div>
      )}
    </div>
  );
}
