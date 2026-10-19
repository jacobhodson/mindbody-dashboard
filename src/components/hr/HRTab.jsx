import { useState, useMemo } from 'react';
import {
  Plus, ChevronLeft, ChevronRight, Grid3x3, GanttChart, CalendarDays, Table2, BarChart3, Check, Ban, Search, X,
} from 'lucide-react';
import {
  format, parseISO, addDays, addWeeks, addMonths, addYears, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear,
} from 'date-fns';
import { useLeave } from '../../utils/useLeave.js';
import { useAllStaff } from '../../utils/useAllStaff.js';
import {
  LEAVE_TYPES, LEAVE_STATUSES, typeMeta, iso, overlaps, formatRange, plannerStaff,
} from '../../utils/leave.js';
import LeaveForm from './LeaveForm.jsx';
import AvailabilityGrid from './AvailabilityGrid.jsx';
import LeaveTimeline from './LeaveTimeline.jsx';
import LeaveCalendar from './LeaveCalendar.jsx';
import LeaveTable from './LeaveTable.jsx';
import LeaveStats from './LeaveStats.jsx';
import LeaveBalances from './LeaveBalances.jsx';

const VIEWS = [
  { key: 'availability', label: 'Availability', Icon: Grid3x3 },
  { key: 'timeline',     label: 'Timeline',     Icon: GanttChart },
  { key: 'calendar',     label: 'Calendar',     Icon: CalendarDays },
  { key: 'table',        label: 'Table',        Icon: Table2 },
  { key: 'stats',        label: 'Stats',        Icon: BarChart3 },
];

// Period presets. Each knows its window around an anchor date and how far
// the ◀ ▶ buttons step.
const RANGES = {
  week:    { label: 'Week',     win: (a) => [startOfWeek(a, { weekStartsOn: 1 }), endOfWeek(a, { weekStartsOn: 1 })], step: (a, n) => addWeeks(a, n) },
  twoWeek: { label: '2 weeks',  win: (a) => [startOfWeek(a, { weekStartsOn: 1 }), addDays(startOfWeek(a, { weekStartsOn: 1 }), 13)], step: (a, n) => addWeeks(a, 2 * n) },
  month:   { label: 'Month',    win: (a) => [startOfMonth(a), endOfMonth(a)], step: (a, n) => addMonths(a, n) },
  quarter: { label: 'Quarter',  win: (a) => [startOfQuarter(a), endOfQuarter(a)], step: (a, n) => addMonths(a, 3 * n) },
  year:    { label: 'Year',     win: (a) => [startOfYear(a), endOfYear(a)], step: (a, n) => addYears(a, n) },
  custom:  { label: 'Custom' },
  all:     { label: 'All time' },
};
// Grid/timeline/calendar need real dates on screen, so "All time" isn't offered there.
const DATED_VIEWS = new Set(['availability', 'timeline', 'calendar']);

const pref = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const savePref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

/**
 * HR tab — the Leave Planner, with Xero leave balances underneath (replaces Notion's "Annual Leave Planner").
 * Anyone can request leave for themselves and see everyone's; managers
 * approve/decline and can add leave for anyone. One shared filter bar
 * (period, people, type, status, search) drives five views:
 *  - Availability: people × days, green = in, coloured = away (the Google
 *    Sheet layout — shows who IS available, not just who's off)
 *  - Timeline: bars per person across the period
 *  - Calendar: month grid
 *  - Table: sortable list ("Next up" etc.)
 *  - Stats: days taken per person by type
 */
export default function HRTab({ staff, isManager }) {
  const leave = useLeave();
  const { staffList } = useAllStaff();
  const people = useMemo(() => plannerStaff(staffList), [staffList]);
  const nameById = useMemo(() => Object.fromEntries(staffList.map((s) => [s.id, s.full_name])), [staffList]);

  const [view, setViewState] = useState(() => pref('hr-leave-view', 'availability'));
  const [range, setRange]    = useState('month');
  const [anchor, setAnchor]  = useState(() => new Date());
  const [custom, setCustom]  = useState(() => ({ from: iso(startOfMonth(new Date())), to: iso(endOfMonth(addMonths(new Date(), 2))) }));
  const [personIds, setPersonIds] = useState([]); // empty = everyone
  const [types, setTypes]         = useState([]); // empty = all types
  const [statuses, setStatuses]   = useState(['pending', 'approved']);
  const [search, setSearch]       = useState('');
  const [form, setForm]           = useState(null); // { id } | { defaults }

  const setView = (v) => {
    setViewState(v); savePref('hr-leave-view', v);
    if (DATED_VIEWS.has(v) && range === 'all') setRange('month');
  };

  // Calendar is always a month; everything else uses the chosen window.
  const effRange = view === 'calendar' ? 'month' : range;
  const [from, to] = useMemo(() => {
    if (effRange === 'all') return ['0000-01-01', '9999-12-31'];
    if (effRange === 'custom') return [custom.from, custom.to < custom.from ? custom.from : custom.to];
    const [a, b] = RANGES[effRange].win(anchor);
    return [iso(a), iso(b)];
  }, [effRange, anchor, custom]);

  const periodLabel = useMemo(() => {
    if (effRange === 'all') return 'All dates';
    const a = parseISO(from); const b = parseISO(to);
    if (effRange === 'month') return format(a, 'MMMM yyyy');
    if (effRange === 'year') return format(a, 'yyyy');
    if (effRange === 'quarter') return `Q${Math.floor(a.getMonth() / 3) + 1} ${format(a, 'yyyy')} (${format(a, 'MMM')}–${format(b, 'MMM')})`;
    return formatRange({ start_date: from, end_date: to });
  }, [effRange, from, to]);

  const stepper = RANGES[effRange]?.step;

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => leave.requests.filter((r) =>
    (personIds.length === 0 || personIds.includes(r.staff_id))
    && (types.length === 0 || types.includes(r.leave_type))
    && statuses.includes(r.status)
    && overlaps(r, from, to)
    && (!q || `${r.title} ${r.notes || ''} ${nameById[r.staff_id] || ''}`.toLowerCase().includes(q))
  ), [leave.requests, personIds, types, statuses, from, to, q, nameById]);

  const shownPeople = useMemo(
    () => (personIds.length ? people.filter((p) => personIds.includes(p.id)) : people),
    [people, personIds],
  );

  const pending = useMemo(
    () => leave.requests.filter((r) => r.status === 'pending').sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [leave.requests],
  );

  const openNew = (defaults = {}) => setForm({ defaults });
  const openRequest = (r) => setForm({ id: r.id });
  const formRequest = form?.id ? leave.requests.find((r) => r.id === form.id) : null;

  const toggle = (list, setList, v) => setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const filtersOn = personIds.length > 0 || types.length > 0 || statuses.length !== 2 || !statuses.includes('approved') || q;

  const viewProps = {
    requests: filtered, people: shownPeople, from, to, nameById, staff, isManager,
    onOpen: openRequest, onNew: openNew,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">HR · Leave Planner</h1>
          <p className="text-sm text-gray-500">
            Request leave, and see who's in and who's away before you book.
          </p>
        </div>
        <button
          onClick={() => openNew()}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
        >
          <Plus className="h-4 w-4" /> Request leave
        </button>
      </div>

      {isManager && pending.length > 0 && (
        <PendingApprovals pending={pending} nameById={nameById} onOpen={openRequest} onDecide={(r, status) => leave.updateRequest(r.id, { status })} />
      )}

      {/* View switcher */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit">
        {VIEWS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              view === key ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {stepper && (
            <div className="flex items-center gap-1">
              <button onClick={() => setAnchor((a) => stepper(a, -1))} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100" aria-label="Previous">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setAnchor(new Date())} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">Today</button>
              <button onClick={() => setAnchor((a) => stepper(a, 1))} className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100" aria-label="Next">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
          <span className="text-sm font-semibold text-gray-900 min-w-[8rem]">{periodLabel}</span>
          {view !== 'calendar' && (
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-800"
            >
              {Object.entries(RANGES)
                .filter(([k]) => !(k === 'all' && DATED_VIEWS.has(view)))
                .map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
            </select>
          )}
          {effRange === 'custom' && (
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="rounded-lg border border-gray-300 bg-gray-50 px-2 py-1" />
              <span>to</span>
              <input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="rounded-lg border border-gray-300 bg-gray-50 px-2 py-1" />
            </div>
          )}
          <select
            value={anchor.getMonth()}
            onChange={(e) => { const d = new Date(anchor); d.setDate(1); d.setMonth(Number(e.target.value)); setAnchor(d); if (range === 'custom' || range === 'all') setRange('month'); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-800"
            title="Jump to month"
          >
            {Array.from({ length: 12 }, (_, m) => <option key={m} value={m}>{format(new Date(2000, m, 1), 'MMMM')}</option>)}
          </select>
          <select
            value={anchor.getFullYear()}
            onChange={(e) => { const d = new Date(anchor); d.setFullYear(Number(e.target.value)); setAnchor(d); }}
            className="rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-800"
            title="Jump to year"
          >
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description / notes"
              className="w-52 rounded-lg border border-gray-300 bg-gray-50 py-1 pl-7 pr-2 text-xs text-gray-800"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mr-1">Team</span>
          {people.map((p) => (
            <Chip key={p.id} active={personIds.includes(p.id)} onClick={() => toggle(personIds, setPersonIds, p.id)}>{p.full_name}</Chip>
          ))}
          <button
            onClick={() => setPersonIds(personIds.length === 1 && personIds[0] === staff?.id ? [] : [staff?.id])}
            className="ml-1 text-[11px] text-emerald-700 hover:underline"
          >
            {personIds.length === 1 && personIds[0] === staff?.id ? 'Everyone' : 'Just me'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mr-1">Type</span>
          {LEAVE_TYPES.map((t) => (
            <Chip key={t.key} active={types.includes(t.key)} onClick={() => toggle(types, setTypes, t.key)}>
              <span className={`inline-block h-2 w-2 rounded-full ${t.dot}`} /> {t.label}
            </Chip>
          ))}
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 ml-3 mr-1">Status</span>
          {LEAVE_STATUSES.map((s) => (
            <Chip key={s.key} active={statuses.includes(s.key)} onClick={() => toggle(statuses, setStatuses, s.key)}>{s.label}</Chip>
          ))}
          {filtersOn && (
            <button
              onClick={() => { setPersonIds([]); setTypes([]); setStatuses(['pending', 'approved']); setSearch(''); }}
              className="ml-2 flex items-center gap-0.5 text-[11px] text-gray-500 hover:text-gray-800"
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {leave.error && <p className="text-xs text-red-600">{leave.error}</p>}
      {leave.loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          {view === 'availability' && <AvailabilityGrid {...viewProps} />}
          {view === 'timeline'     && <LeaveTimeline {...viewProps} />}
          {view === 'calendar'     && <LeaveCalendar {...viewProps} />}
          {view === 'table'        && <LeaveTable {...viewProps} />}
          {view === 'stats'        && <LeaveStats {...viewProps} periodLabel={periodLabel} />}
        </>
      )}

      <Legend />

      <LeaveBalances people={people} requests={leave.requests} staff={staff} isManager={isManager} />

      {form && (
        <LeaveForm
          request={formRequest}
          defaults={form.defaults}
          staff={staff}
          staffList={people}
          isManager={isManager}
          nameById={nameById}
          onSave={(fields) => (formRequest ? leave.updateRequest(formRequest.id, fields) : leave.createRequest(fields))}
          onDelete={() => leave.deleteRequest(formRequest.id)}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
        active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
      <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-emerald-100 border border-emerald-200" /> Available</span>
      {LEAVE_TYPES.map((t) => (
        <span key={t.key} className="flex items-center gap-1"><span className={`inline-block h-3 w-3 rounded-sm ${t.bar}`} /> {t.label}</span>
      ))}
      <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-sky-500 leave-pending" /> Pending approval (striped)</span>
    </div>
  );
}

function PendingApprovals({ pending, nameById, onOpen, onDecide }) {
  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-semibold text-gray-900 text-sm">Awaiting approval</h2>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{pending.length}</span>
      </div>
      <div className="space-y-2">
        {pending.map((r) => {
          const t = typeMeta(r.leave_type);
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
              <button onClick={() => onOpen(r)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-gray-900 hover:underline">
                  {nameById[r.staff_id] || 'Unknown'} · {r.title}
                </p>
                <p className="text-xs text-gray-500">
                  <span className={`mr-1.5 rounded border px-1.5 py-px ${t.soft}`}>{t.short}</span>
                  {formatRange(r)}{r.work_days != null && ` · ${Number(r.work_days)} work day${Number(r.work_days) === 1 ? '' : 's'}`}
                </p>
              </button>
              <div className="flex shrink-0 gap-1.5">
                <button onClick={() => onDecide(r, 'approved')} className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20">
                  <Check className="h-3.5 w-3.5" /> Approve
                </button>
                <button onClick={() => onDecide(r, 'declined')} className="flex items-center gap-1 rounded-lg border border-gray-300 bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200">
                  <Ban className="h-3.5 w-3.5" /> Decline
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
