import { useState, useEffect, useMemo } from 'react';
import { Users, ArrowUp, ArrowDown, ArrowRight, Sparkles, RefreshCw, CheckCircle, ChevronDown, Contact, RotateCcw } from 'lucide-react';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import ContactModal          from './ContactModal.jsx';
import WeeklyAttendancePanel from './WeeklyAttendancePanel.jsx';

// calendarWeek is this Mon–Sun to date (it was mislabelled "Last Cal.
// Week"); lastWeek is the previous full Mon–Sun.
const PERIODS = [
  { key: '7days',        label: 'Last 7 Days' },
  { key: 'calendarWeek', label: 'This Week' },
  { key: 'lastWeek',     label: 'Last Week' },
];

const SORTS = [
  { key: 'sessions_desc', label: 'Most sessions' },
  { key: 'sessions_asc',  label: 'Fewest sessions' },
  { key: 'trend_up',      label: 'Trending up most' },
  { key: 'trend_down',    label: 'Trending down most' },
  { key: 'name',          label: 'Name A–Z' },
];

// "Back from Red": from mb-client-analytics. Once reds_daily covers the last
// 4 Mondays (redHistory.source === 'history') it's onMondayReds — on the Red's
// List actioned in one of the last 4 Monday meetings. Until then it's the
// inferred recentRed: a week with no classes in the 4 weeks before this
// window, after attending before it (over-flags around holiday weeks).
const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'up',       label: 'Trending up' },
  { key: 'down',     label: 'Trending down' },
  { key: 'backFromRed', label: 'Back from Red' },
];

const delta = (c) => c.trend?.delta ?? 0;
function sortClients(list, sort) {
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '');
  const out = [...list];
  switch (sort) {
    case 'sessions_asc':  return out.sort((a, b) => a.sessionsThisWeek - b.sessionsThisWeek || byName(a, b));
    case 'trend_up':      return out.sort((a, b) => delta(b) - delta(a) || byName(a, b));
    case 'trend_down':    return out.sort((a, b) => delta(a) - delta(b) || byName(a, b));
    case 'name':          return out.sort(byName);
    default:              return out.sort((a, b) => b.sessionsThisWeek - a.sessionsThisWeek || byName(a, b));
  }
}
// Tooltip text when the client is "Back from Red", else null.
function backFromRed(c, useHistory) {
  if (useHistory) {
    return c.onMondayReds
      ? `On Red's List at the ${c.lastRedMonday ? format(parseISO(c.lastRedMonday), 'EEE d MMM') : 'recent Monday'} meeting — back attending now`
      : null;
  }
  if (!c.recentRed) return null;
  return `No classes ${c.recentRed.weeksAgo === 1 ? 'the week' : `${c.recentRed.weeksAgo} weeks`} before this window — back attending now (inferred from attendance)`;
}
function matchesFilter(c, filter, useHistory) {
  if (filter === 'up') return c.trend?.direction === 'up';
  if (filter === 'down') return c.trend?.direction === 'down';
  if (filter === 'backFromRed') return Boolean(backFromRed(c, useHistory));
  return true;
}

const SEGMENTS = [
  {
    key:    'atRisk',
    label:  'Moderate',
    desc:   '1–2 sessions',
    dot:    'bg-orange-400',
    badge:  'bg-orange-500/10 text-orange-600 border-orange-500/20',
    active: 'border-orange-400 text-orange-600',
    status: 'moderate',
  },
  {
    key:    'engaged',
    label:  'Engaged',
    desc:   '3+ sessions',
    dot:    'bg-emerald-400',
    badge:  'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    active: 'border-emerald-400 text-emerald-600',
    status: 'engaged',
  },
];

function TrendIndicator({ trend }) {
  if (!trend) return null;
  const { direction, avg, delta: d } = trend;
  if (direction === 'new') {
    return (
      <span className="flex items-center gap-0.5 text-xs text-blue-600">
        <Sparkles className="h-3 w-3" />
        <span className="text-gray-500">new</span>
      </span>
    );
  }
  const Icon  = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : ArrowRight;
  const color = direction === 'up' ? 'text-emerald-600' : direction === 'down' ? 'text-red-600' : 'text-gray-600';
  return (
    <span className={`flex items-center gap-0.5 text-xs tabular-nums ${color}`}>
      <Icon className="h-3 w-3" />
      <span className="text-gray-500">
        {(direction === 'up' || direction === 'down') && d != null ? `${d > 0 ? '+' : ''}${d} vs ` : ''}{avg}/wk
      </span>
    </span>
  );
}

export default function FringeClientsTable({ contactLog, onboardingIds = new Set(), onViewClient }) {
  const [period, setPeriod]       = useState('7days');
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [activeTab, setActiveTab]   = useState('atRisk');
  const [selected, setSelected]     = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [sort, setSort]             = useState('sessions_desc');
  const [filter, setFilter]         = useState('all');

  const isContacted   = contactLog?.isContacted  ?? (() => false);
  const logContact    = contactLog?.logContact    ?? null;
  const getClientLogs = contactLog?.getClientLogs ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/mb-client-analytics?period=${period}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });

    return () => { cancelled = true; };
  }, [period]);

  const segments       = data?.fringeSegments || {};
  const useRedHistory  = data?.redHistory?.source === 'history';
  const currentSeg     = SEGMENTS.find((s) => s.key === activeTab);
  // Exclude onboarding clients — they are tracked on the Onboarding tab
  const segmentClients = (segments[activeTab]?.clients || []).filter((c) => !onboardingIds.has(c.id));
  const currentClients = useMemo(
    () => sortClients(segmentClients.filter((c) => matchesFilter(c, filter, useRedHistory)), sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, activeTab, onboardingIds, filter, sort],
  );
  const currentCount   = segmentClients.length;
  const filterCount = (key) => segmentClients.filter((c) => matchesFilter(c, key, useRedHistory)).length;

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gray-600" />
          <h2 className="font-semibold text-gray-900">Fringe Clients</h2>
        </div>

        {/* Period filter */}
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p.key
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300 hover:text-gray-800'
              }`}
            >
              {p.label}
            </button>
          ))}
          {loading && <RefreshCw className="h-3.5 w-3.5 text-gray-500 animate-spin self-center ml-1" />}
        </div>
      </div>

      {/* Segment tabs */}
      <div className="flex border-b border-gray-200">
        {SEGMENTS.map((seg) => {
          // Show the count after filtering out onboarding clients
          const count    = (segments[seg.key]?.clients || []).filter((c) => !onboardingIds.has(c.id)).length;
          const isActive = activeTab === seg.key;
          return (
            <button
              key={seg.key}
              onClick={() => setActiveTab(seg.key)}
              className={`flex-1 px-3 py-3 text-xs font-medium border-b-2 transition-colors ${
                isActive
                  ? `${seg.active} bg-gray-200/40`
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-200/20'
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
        <div className="flex flex-wrap items-center gap-2 px-5 py-2 border-b border-gray-200/60">
          <p className="text-xs text-gray-500 mr-auto">{currentSeg.desc}</p>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                title={f.key === 'backFromRed'
                  ? (useRedHistory
                    ? 'On Red\'s List at one of the last 4 Monday meetings'
                    : 'Had a week with no classes in the 4 weeks before this one, after attending before that — would have been on Red\'s List (inferred until 4 Mondays of Red\'s List history exist)')
                  : undefined}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  filter === f.key ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                {f.label}{!loading && f.key !== 'all' ? ` · ${filterCount(f.key)}` : ''}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort clients"
            className="rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-[11px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {SORTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      )}

      {/* Client list */}
      <div className="overflow-y-auto max-h-80 scrollbar-thin flex-1">
        {loading && (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-200" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="p-5 text-sm text-red-600">Could not load: {error}</p>
        )}

        {!loading && !error && currentClients.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400">{filter === 'all' ? 'No clients in this segment' : 'No clients match this filter'}</p>
        )}

        {!loading && !error && currentClients.map((client) => {
          const fullyUtil    = client.isFullyUtilising;
          const wasContacted = isContacted(client.id);
          const lastLog      = contactLog?.contacted?.[String(client.id)];
          const isExpanded   = expandedId === client.id;

          return (
            <div
              key={client.id}
              className={`border-b border-gray-200/50 last:border-0 ${
                fullyUtil ? 'border-l-2 border-l-emerald-500' : ''
              }`}
            >
              {/* Main row — click to expand */}
              <div
                className={`flex items-center gap-3 px-5 py-2.5 transition-colors cursor-pointer select-none ${
                  fullyUtil
                    ? 'bg-emerald-950/20 hover:bg-emerald-950/30'
                    : 'hover:bg-gray-200/30'
                } ${wasContacted ? 'opacity-60' : ''}`}
                onClick={() => toggleExpand(client.id)}
              >
                {/* Name + trend */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm truncate ${fullyUtil ? 'text-emerald-800 font-medium' : 'text-gray-800'}`}>
                      {client.name || 'Unknown'}
                    </p>
                    {fullyUtil && (
                      <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                        2× ✓
                      </span>
                    )}
                    <TrendIndicator trend={client.trend} />
                    {backFromRed(client, useRedHistory) && (
                      <span
                        title={backFromRed(client, useRedHistory)}
                        className="shrink-0 flex items-center gap-0.5 rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700"
                      >
                        <RotateCcw className="h-2.5 w-2.5" /> Back from Red
                      </span>
                    )}
                    {wasContacted && (
                      <span className="shrink-0 flex items-center gap-1 text-xs text-emerald-500">
                        <CheckCircle className="h-3 w-3" />
                        {lastLog ? formatDistanceToNow(new Date(lastLog.at), { addSuffix: true }) : 'Contacted'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">{client.email || client.phone || '–'}</p>
                </div>

                {/* Session count badge */}
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${
                  fullyUtil ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' : currentSeg?.badge
                }`}>
                  {client.sessionsThisWeek} {client.sessionsThisWeek === 1 ? 'session' : 'sessions'}
                </span>

                {/* View profile */}
                {onViewClient && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onViewClient(client.id); }}
                    title="View client profile"
                    className="shrink-0 rounded-lg border border-gray-300 bg-gray-100 p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors"
                  >
                    <Contact className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Contact button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setSelected(client); }}
                  className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    wasContacted
                      ? 'border-gray-300 bg-gray-200 text-gray-500 hover:bg-gray-300 hover:text-gray-700'
                      : 'border-gray-400 bg-gray-200 text-gray-700 hover:bg-gray-300 hover:text-gray-900'
                  }`}
                >
                  {wasContacted ? 'View log' : 'Contact'}
                </button>

                <ChevronDown className={`shrink-0 h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>

              {/* Expandable attendance panel */}
              {isExpanded && <WeeklyAttendancePanel client={client} status={currentSeg?.status || 'moderate'} />}
            </div>
          );
        })}
      </div>

      {!loading && filter !== 'all' && currentCount > currentClients.length && (
        <div className="px-5 py-3 border-t border-gray-200">
          <p className="text-xs text-gray-400">
            Showing {currentClients.length} of {currentCount}
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
