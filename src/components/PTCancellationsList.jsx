import { useState, useEffect, useMemo, useCallback } from 'react';
import { CalendarX, CheckCircle, Contact } from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, subWeeks, subDays, differenceInMinutes, formatDistanceToNow } from 'date-fns';
import { supabase } from '../lib/supabaseClient.js';
import ContactModal from './ContactModal.jsx';

/**
 * PT / Semi-Private sessions that were cancelled, from
 * `appointment_cancellations`. Mindbody's API never returns cancelled
 * appointments, so scheduled-mb-mirror.js records a booking when it drops out
 * of the feed (within about an hour in the daytime). Mindbody also doesn't
 * say who cancelled — staff tag each one Client / Staff here.
 *
 * Periods filter on the session's scheduled time (Sydney wall clock).
 */

const PERIODS = [
  { key: 'thisWeek', label: 'This week'   },
  { key: 'lastWeek', label: 'Last week'   },
  { key: '7days',    label: 'Last 7 days' },
];
const BY_FILTERS = [
  { key: 'all',      label: 'All'      },
  { key: 'client',   label: 'Client'   },
  { key: 'staff',    label: 'Staff'    },
  { key: 'untagged', label: 'Untagged' },
];

const ts = (d) => format(d, "yyyy-MM-dd'T'HH:mm:ss");

function periodRange(key, now = new Date()) {
  if (key === 'lastWeek') {
    const lw = subWeeks(now, 1);
    return [startOfWeek(lw, { weekStartsOn: 1 }), endOfWeek(lw, { weekStartsOn: 1 })];
  }
  if (key === '7days') return [subDays(now, 7), now];
  return [startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 })];
}

// How far ahead it was cancelled — only when the sync caught it promptly
// (seen-to-gone gap under 3h), otherwise the estimate would be misleading.
function noticeLabel(row) {
  if (!row.last_seen_at || !row.detected_at) return null;
  const seen = new Date(row.last_seen_at);
  const gone = new Date(row.detected_at);
  if (differenceInMinutes(gone, seen) > 180) return null;
  const start = parseISO(row.start_local);
  const mins  = differenceInMinutes(start, gone);
  if (mins < 0) return 'Removed after the session';
  if (mins < 60) return 'Cancelled under 1h before';
  if (mins < 48 * 60) return `Cancelled ~${Math.round(mins / 60)}h before`;
  return `Cancelled ~${Math.round(mins / 1440)}d before`;
}

function useCancellations() {
  const [rows, setRows]       = useState([]);
  const [clients, setClients] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // One fetch covers all three periods (last Monday → this Sunday).
        const now  = new Date();
        const from = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
        const to   = endOfWeek(now, { weekStartsOn: 1 });
        const { data, error: e } = await supabase
          .from('appointment_cancellations')
          .select('appointment_id, client_mindbody_id, session_type_name, session_category, staff_name, start_local, last_status, last_seen_at, detected_at, cancelled_by, tagged_at')
          .in('session_category', ['pt', 'sp'])
          .gte('start_local', ts(from))
          .lte('start_local', ts(to))
          .order('start_local', { ascending: false });
        if (e) throw e;
        const ids = [...new Set((data || []).map((r) => r.client_mindbody_id).filter(Boolean))];
        let map = {};
        if (ids.length) {
          const { data: cs, error: ce } = await supabase
            .from('clients')
            .select('mindbody_id, first_name, last_name, email, mobile_phone, home_phone')
            .in('mindbody_id', ids);
          if (ce) throw ce;
          map = Object.fromEntries((cs || []).map((c) => [c.mindbody_id, c]));
        }
        if (!alive) return;
        setRows(data || []);
        setClients(map);
      } catch (e) {
        if (alive) setError(e.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const setTag = useCallback(async (appointmentId, value) => {
    let prev;
    setRows((rs) => rs.map((r) => {
      if (r.appointment_id !== appointmentId) return r;
      prev = r.cancelled_by;
      return { ...r, cancelled_by: value };
    }));
    const { error: e } = await supabase
      .from('appointment_cancellations')
      .update({ cancelled_by: value })
      .eq('appointment_id', appointmentId);
    if (e) {
      setRows((rs) => rs.map((r) => (r.appointment_id === appointmentId ? { ...r, cancelled_by: prev } : r)));
      alert(`Couldn't save the tag: ${e.message}`);
    }
  }, []);

  return { rows, clients, loading, error, setTag };
}

export default function PTCancellationsList({ contactLog, onViewClient }) {
  const { rows, clients, loading, error, setTag } = useCancellations();
  const [period, setPeriod]     = useState('thisWeek');
  const [byFilter, setByFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const isContacted   = contactLog?.isContacted  ?? (() => false);
  const logContact    = contactLog?.logContact    ?? null;
  const getClientLogs = contactLog?.getClientLogs ?? null;

  const inPeriod = useMemo(() => {
    const [from, to] = periodRange(period).map(ts);
    return rows.filter((r) => r.start_local >= from && r.start_local <= to);
  }, [rows, period]);

  const counts = useMemo(() => ({
    all:      inPeriod.length,
    client:   inPeriod.filter((r) => r.cancelled_by === 'client').length,
    staff:    inPeriod.filter((r) => r.cancelled_by === 'staff').length,
    untagged: inPeriod.filter((r) => !r.cancelled_by).length,
  }), [inPeriod]);

  const visible = byFilter === 'all'
    ? inPeriod
    : inPeriod.filter((r) => (byFilter === 'untagged' ? !r.cancelled_by : r.cancelled_by === byFilter));

  const toClient = (r) => {
    const c = clients[r.client_mindbody_id];
    const name = c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : '';
    return {
      id:    r.client_mindbody_id,
      name:  name || `Client ${r.client_mindbody_id}`,
      email: c?.email || '',
      phone: c?.mobile_phone || c?.home_phone || '',
    };
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white flex flex-col">
      <div className="flex items-center justify-between gap-3 flex-wrap px-5 pt-5 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <CalendarX className="h-4 w-4 text-amber-600" />
          <h2 className="font-semibold text-gray-900">Cancelled Sessions</h2>
          {!loading && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-500/20">
              {inPeriod.length}
            </span>
          )}
        </div>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`px-3 py-1.5 transition-colors ${
                period === key ? 'bg-gray-300 text-gray-900' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-2 border-b border-gray-200 flex items-center gap-2 text-xs">
        <span className="text-gray-500">Cancelled by</span>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          {BY_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setByFilter(key)}
              className={`px-3 py-1 transition-colors ${
                byFilter === key ? 'bg-gray-300 text-gray-900' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}
            >
              {label}{!loading && <span className="ml-1 text-gray-400 tabular-nums">{counts[key]}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-y-auto max-h-96 scrollbar-thin">
        {loading && (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-200" />
            ))}
          </div>
        )}

        {error && !loading && <p className="p-5 text-sm text-red-600">Could not load: {error}</p>}

        {!loading && !error && visible.length === 0 && (
          <div className="py-10 text-center">
            <CheckCircle className="h-7 w-7 text-emerald-500/40 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No cancelled sessions here</p>
          </div>
        )}

        {!loading && !error && visible.map((r) => {
          const client       = toClient(r);
          const wasContacted = isContacted(client.id);
          const lastLog      = contactLog?.contacted?.[String(client.id)];
          const notice       = noticeLabel(r);
          return (
            <div
              key={r.appointment_id}
              className={`flex items-center justify-between px-5 py-3 border-b border-gray-200/60 last:border-0 ${wasContacted ? 'opacity-60' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-800 truncate">{client.name}</p>
                  {r.session_type_name && (
                    <span className="shrink-0 text-[10px] font-medium text-gray-400 bg-gray-200 rounded px-1.5 py-0.5">
                      {r.session_type_name}
                    </span>
                  )}
                  {r.last_status === 'NoShow' && (
                    <span className="shrink-0 text-[10px] font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5" title="It was marked as a no-show before it was removed">
                      Was no-show
                    </span>
                  )}
                  {wasContacted && (
                    <span className="shrink-0 flex items-center gap-1 text-xs text-emerald-500">
                      <CheckCircle className="h-3 w-3" />
                      {lastLog ? formatDistanceToNow(new Date(lastLog.at), { addSuffix: true }) : 'Contacted'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {format(parseISO(r.start_local), 'EEE d MMM, h:mmaaa')}
                  {r.staff_name && <span className="ml-2 text-gray-400">· {r.staff_name}</span>}
                  {notice && <span className="ml-2 text-gray-400">· {notice}</span>}
                </p>
              </div>

              <div className="flex items-center gap-2 ml-4 shrink-0">
                <div className="flex rounded-lg border border-gray-300 overflow-hidden text-[11px]" title="Who cancelled? Mindbody doesn't record it, so tag it here.">
                  {[
                    { key: 'client', label: 'Client' },
                    { key: 'staff',  label: 'Staff'  },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setTag(r.appointment_id, r.cancelled_by === key ? null : key)}
                      className={`px-2 py-1 transition-colors ${
                        r.cancelled_by === key
                          ? 'bg-amber-500/20 text-amber-800'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {onViewClient && (
                  <button
                    onClick={() => onViewClient(client.id)}
                    title="View client profile"
                    className="rounded-lg border border-gray-300 bg-gray-100 p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors"
                  >
                    <Contact className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setSelected(client)}
                  className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                    wasContacted
                      ? 'border-gray-300 bg-gray-200 text-gray-500 hover:bg-gray-300 hover:text-gray-700'
                      : 'border-red-500/30 bg-red-500/10 text-red-600 hover:bg-red-500/20'
                  }`}
                >
                  {wasContacted ? 'View log' : 'Contact'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

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
