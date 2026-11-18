import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Trophy, Cake, PartyPopper, Pencil, Check, X, CheckCircle } from 'lucide-react';
import {
  useMilestones, upcomingMilestones, recentMilestoneHits, occurrenceIn,
  DEFAULT_MILESTONE_TARGETS, parseDate, startOfDay,
} from '../utils/useMilestones.js';

const DAY = 86400000;
const WITHIN_OPTIONS = [1, 2, 3, 5];

// Card accents: hits/today in our emerald, upcoming in amber, past in grey.
const TONES = {
  hit:      { card: 'border-gray-200',  head: 'bg-white',     title: 'text-gray-900',   chip: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  upcoming: { card: 'border-amber-200', head: 'bg-amber-50',  title: 'text-amber-900',  chip: 'bg-amber-100 text-amber-800 border border-amber-200' },
  today:    { card: 'border-emerald-300', head: 'bg-emerald-50', title: 'text-emerald-900', chip: 'bg-emerald-100 text-emerald-800 border border-emerald-200' },
  past:     { card: 'border-gray-200',  head: 'bg-gray-50',   title: 'text-gray-600',   chip: 'bg-gray-100 text-gray-600' },
};

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function addDays(d, n) { return new Date(d.getTime() + n * DAY); }
function endOfWeek(d) { return addDays(d, (7 - d.getDay()) % 7); } // Sunday
function monthRange(d, offset) {
  return [new Date(d.getFullYear(), d.getMonth() + offset, 1), new Date(d.getFullYear(), d.getMonth() + offset + 1, 0)];
}

function readPref(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private window */ }
}

function displayName(person, mode) {
  if (mode === 'full') return person.name;
  const last = (person.last_name || '').trim();
  return `${(person.first_name || '').trim()}${last ? ` ${last[0].toUpperCase()}.` : ''}` || person.name;
}

// ── Building blocks ─────────────────────────────────────────────────────────

function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-md px-3 py-1.5 transition-colors ${
            value === o.key ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800'
          } ${o.key === 'upcoming' && value === o.key ? '!text-amber-700' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function GroupCard({ title, count, tone = 'hit', rows }) {
  const t = TONES[tone];
  return (
    <div className={`rounded-xl border bg-white overflow-hidden ${t.card}`}>
      <div className={`flex items-baseline justify-between gap-3 px-4 py-3 border-b border-gray-200/70 ${t.head}`}>
        <h3 className={`text-lg font-semibold ${t.title}`}>{title}</h3>
        <span className="text-xs text-gray-500 shrink-0">{count} {count === 1 ? 'member' : 'members'}</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-100 last:border-0">
          <div className="min-w-0">
            <button
              onClick={r.onClick}
              className="text-sm font-medium text-gray-800 hover:text-emerald-700 hover:underline truncate text-left max-w-full"
            >
              {r.name}
            </button>
            {r.sub && <p className="text-xs text-gray-500">{r.sub}</p>}
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${r.chipTone ? TONES[r.chipTone].chip : 'text-gray-500'}`}>
            {r.right}
          </span>
        </div>
      ))}
    </div>
  );
}

function CardGrid({ groups, emptyMessage, loading }) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100" />)}
      </div>
    );
  }
  if (!groups.length) {
    return (
      <div className="py-12 text-center">
        <CheckCircle className="h-6 w-6 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 items-start">
      {groups.map(({ key, ...g }) => <GroupCard key={key} {...g} count={g.rows.length} />)}
    </div>
  );
}

function Section({ icon: Icon, title, subtitle, actions, children }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-200">
        <div className="flex items-start gap-2.5">
          <Icon className="h-4 w-4 text-gray-500 mt-1" />
          <div>
            <h2 className="font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
        </div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function TargetsEditor({ targets, onSave }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const start = () => { setText(targets.join(', ')); setError(null); setEditing(true); };
  const save = async () => {
    const list = [...new Set(text.split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
    if (!list.length) { setError('Add at least one number'); return; }
    setSaving(true);
    const res = await onSave(list);
    setSaving(false);
    if (res?.error) setError(res.error); else setEditing(false);
  };

  if (!editing) {
    return (
      <button onClick={start} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
        <Pencil className="h-3 w-3" /> Edit targets
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        className="w-64 max-w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
        placeholder="10, 25, 50, 100"
        autoFocus
      />
      <button onClick={save} disabled={saving} className="rounded-md p-1 text-emerald-700 hover:bg-emerald-50" title="Save"><Check className="h-4 w-4" /></button>
      <button onClick={() => setEditing(false)} className="rounded-md p-1 text-gray-500 hover:bg-gray-100" title="Cancel"><X className="h-4 w-4" /></button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

function relDay(date, today) {
  const d = Math.round((date - today) / DAY);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  return format(date, 'EEE d MMM');
}

// ── Page ────────────────────────────────────────────────────────────────────

const VISIT_PERIODS = [
  { key: 'upcoming',  label: 'Upcoming' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
];
const DATE_PERIODS = [
  { key: 'week',      label: 'This week' },
  { key: 'month',     label: 'This month' },
  { key: 'nextMonth', label: 'Next month' },
  { key: 'past',      label: 'Just had' },
];
const NAME_MODES = [
  { key: 'short', label: 'First name + initial' },
  { key: 'full',  label: 'Full names' },
];

export default function MilestonesTab({ pipelineIds, onViewClient, appSettings, staff, isManager }) {
  const { people, sessionRows, coverage, loading, error } = useMilestones({ pipelineIds });
  const [tab, setTabState]         = useState(() => readPref('milestones-tab', 'visits'));
  const [visitPeriod, setVisitPeriod] = useState('upcoming');
  const [datePeriod, setDatePeriod]   = useState('week');
  const [within, setWithin]        = useState('3');
  const [nameMode, setNameModeState] = useState(() => readPref('milestones-names', 'short'));
  const [showLapsed, setShowLapsed] = useState(false);

  const setTab = (v) => { setTabState(v); writePref('milestones-tab', v); };
  const setNameMode = (v) => { setNameModeState(v); writePref('milestones-names', v); };

  const today = useMemo(() => startOfDay(new Date()), []);
  const targets = appSettings?.settings?.milestone_targets?.length
    ? appSettings.settings.milestone_targets
    : DEFAULT_MILESTONE_TARGETS;

  const view = (p) => () => onViewClient(p.mindbody_id);

  // Visit milestones: upcoming (amber) or hits in a month, one card per milestone.
  const upcoming = useMemo(() => upcomingMilestones(sessionRows, targets, Number(within), today), [sessionRows, targets, within, today]);
  const visitGroups = useMemo(() => {
    const byN = new Map();
    if (visitPeriod === 'upcoming') {
      for (const u of upcoming) {
        if (!byN.has(u.next)) byN.set(u.next, []);
        byN.get(u.next).push({
          key: u.mindbody_id,
          name: displayName(u.client, nameMode),
          onClick: view(u.client),
          sub: `${u.total} so far`,
          right: `${u.remaining} to go${u.eta ? ` · ~${format(u.eta, 'EEE d MMM')}` : ''}`,
          chipTone: 'upcoming',
        });
      }
    } else {
      const [start, end] = monthRange(today, visitPeriod === 'thisMonth' ? 0 : -1);
      for (const h of recentMilestoneHits(sessionRows, start, end)) {
        if (!byN.has(h.n)) byN.set(h.n, []);
        byN.get(h.n).push({
          key: `${h.mindbody_id}-${h.n}`,
          name: displayName(h.client, nameMode),
          onClick: view(h.client),
          right: format(h.date, 'EEE d MMM'),
        });
      }
    }
    return [...byN.entries()].sort((a, b) => b[0] - a[0]).map(([n, rows]) => ({
      key: n, title: `${ordinal(n)} visit`, rows, tone: visitPeriod === 'upcoming' ? 'upcoming' : 'hit',
    }));
  }, [visitPeriod, upcoming, sessionRows, nameMode, today]);

  const dateRange = useMemo(() => {
    if (datePeriod === 'week') return [today, endOfWeek(today)];
    if (datePeriod === 'month') return [today, monthRange(today, 0)[1]];
    if (datePeriod === 'nextMonth') return monthRange(today, 1);
    return [addDays(today, -7), addDays(today, -1)];
  }, [datePeriod, today]);

  // Birthdays: one card per day.
  const birthdayEntries = useMemo(() => people
    .filter((p) => showLapsed || p.simple !== 'Inactive')
    .map((p) => {
      const origin = parseDate(p.birth_date);
      if (!origin || origin.getFullYear() <= 1900) return null;
      const hit = occurrenceIn(origin, dateRange[0], dateRange[1]);
      return hit && { person: p, ...hit };
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date), [people, showLapsed, dateRange]);

  const birthdayGroups = useMemo(() => {
    const byDay = new Map();
    for (const e of birthdayEntries) {
      const k = e.date.getTime();
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(e);
    }
    return [...byDay.entries()].map(([k, list]) => {
      const date = new Date(k);
      const tone = date < today ? 'past' : date.getTime() === today.getTime() ? 'today' : 'upcoming';
      return {
        key: k,
        title: relDay(date, today) === format(date, 'EEE d MMM') ? format(date, 'EEE d MMM') : `${relDay(date, today)} · ${format(date, 'd MMM')}`,
        tone,
        rows: list.map((e) => ({
          key: e.person.id,
          name: displayName(e.person, nameMode),
          onClick: view(e.person),
          sub: e.person.simple === 'Inactive' ? 'Lapsed member' : null,
          right: tone === 'past' ? `Turned ${e.years}` : `Turning ${e.years}`,
          chipTone: tone,
        })),
      };
    });
  }, [birthdayEntries, nameMode, today]);

  // Anniversaries: one card per number of years. start_date = real start for
  // members imported from the old system; otherwise Mindbody's creation date.
  const anniversaryGroups = useMemo(() => {
    const byYears = new Map();
    for (const p of people) {
      if (p.simple === 'Inactive') continue;
      const hit = occurrenceIn(parseDate(p.start_date || p.creation_date), dateRange[0], dateRange[1]);
      if (!hit || hit.years < 1) continue;
      if (!byYears.has(hit.years)) byYears.set(hit.years, []);
      byYears.get(hit.years).push({ person: p, ...hit });
    }
    return [...byYears.entries()].sort((a, b) => b[0] - a[0]).map(([years, list]) => ({
      key: years,
      title: `${years} ${years === 1 ? 'year' : 'years'}`,
      tone: datePeriod === 'past' ? 'past' : 'upcoming',
      rows: list.sort((a, b) => a.date - b.date).map((e) => {
        const isToday = e.date.getTime() === today.getTime();
        return {
          key: e.person.id,
          name: displayName(e.person, nameMode),
          onClick: view(e.person),
          right: relDay(e.date, today),
          chipTone: isToday ? 'today' : e.date < today ? 'past' : 'upcoming',
        };
      }),
    }));
  }, [people, dateRange, datePeriod, nameMode, today]);

  const count = (groups) => groups.reduce((n, g) => n + g.rows.length, 0);
  const periodLabel = DATE_PERIODS.find((p) => p.key === datePeriod)?.label.toLowerCase();

  const TABS = [
    { key: 'visits',        label: 'Visit milestones', short: 'Visits', Icon: Trophy },
    { key: 'birthdays',     label: 'Birthdays',        Icon: Cake },
    { key: 'anniversaries', label: 'Anniversaries',    Icon: PartyPopper },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Milestones</h1>
        <p className="text-sm text-gray-500">Mindbody data · visits, birthdays and anniversaries to celebrate on the floor</p>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">Could not load: {error}</p>}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(({ key, label, short, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-3 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-emerald-600 text-gray-900 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Icon className="hidden sm:block h-4 w-4" />
            {short ? <><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span></> : label}
            {key === 'visits' && !loading && upcoming.length > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800" title="Upcoming milestones">
                {upcoming.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {tab === 'visits'
          ? <Segmented options={VISIT_PERIODS} value={visitPeriod} onChange={setVisitPeriod} />
          : <Segmented options={DATE_PERIODS} value={datePeriod} onChange={setDatePeriod} />}
        <Segmented options={NAME_MODES} value={nameMode} onChange={setNameMode} />
        {tab === 'visits' && visitPeriod === 'upcoming' && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            within
            <Segmented options={WITHIN_OPTIONS.map((n) => ({ key: String(n), label: String(n) }))} value={within} onChange={setWithin} />
            sessions
          </div>
        )}
        {tab === 'birthdays' && (
          <label className="flex items-center gap-1.5 text-sm text-gray-500">
            <input type="checkbox" checked={showLapsed} onChange={(e) => setShowLapsed(e.target.checked)} />
            Include lapsed members
          </label>
        )}
      </div>

      {tab === 'visits' && (
        <Section
          icon={Trophy}
          title={visitPeriod === 'upcoming' ? 'Coming up' : 'Visit milestones'}
          subtitle={`${visitPeriod === 'upcoming'
            ? `Within ${within} session${within === '1' ? '' : 's'} · "~" dates use each client's last 4 weeks`
            : format(monthRange(today, visitPeriod === 'thisMonth' ? 0 : -1)[0], 'MMMM yyyy')} · targets ${targets.join(', ')}`}
          actions={isManager && (
            <TargetsEditor targets={targets} onSave={(list) => appSettings.save({ milestone_targets: list }, staff?.id)} />
          )}
        >
          {coverage.partial && (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Check-in history only goes back to {format(coverage.historyFrom, 'd MMM yyyy')} (Mindbody starts {format(coverage.gymStart, 'd MMM yyyy')}),
              so session counts are short for longer-standing members until the history backfill runs.
            </p>
          )}
          <CardGrid
            loading={loading}
            groups={visitGroups}
            emptyMessage={visitPeriod === 'upcoming'
              ? `Nobody within ${within} session${within === '1' ? '' : 's'} of a milestone`
              : 'No milestones hit in this month'}
          />
        </Section>
      )}

      {tab === 'birthdays' && (
        <Section icon={Cake} title="Birthdays" subtitle={`${count(birthdayGroups)} ${periodLabel}${showLapsed ? ' · including lapsed members' : ' · active and trial members'}`}>
          <CardGrid loading={loading} groups={birthdayGroups} emptyMessage={`No birthdays ${periodLabel}`} />
        </Section>
      )}

      {tab === 'anniversaries' && (
        <Section icon={PartyPopper} title="Anniversaries" subtitle={`${count(anniversaryGroups)} ${periodLabel} · active members, from their start date`}>
          <CardGrid loading={loading} groups={anniversaryGroups} emptyMessage={`No anniversaries ${periodLabel}`} />
        </Section>
      )}
    </div>
  );
}
