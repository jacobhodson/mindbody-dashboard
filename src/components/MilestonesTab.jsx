import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Trophy, Cake, Star, Pencil, Check, X, CheckCircle } from 'lucide-react';
import {
  useMilestones, upcomingMilestones, recentMilestoneHits, yearlyBucket,
  DATE_BUCKETS, DEFAULT_MILESTONE_TARGETS, parseDate, startOfDay,
} from '../utils/useMilestones.js';

const WITHIN_OPTIONS = [1, 2, 3, 5];
const HIT_WINDOWS = [
  { key: 'week', label: 'This week' },
  { key: '14',   label: '14 days' },
  { key: '30',   label: '30 days' },
];

function sinceFor(key, today) {
  if (key === 'week') {
    const d = new Date(today);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return d;
  }
  return new Date(today.getTime() - Number(key) * 86400000);
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-md px-2.5 py-1 transition-colors ${
            value === o.key ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Panel({ icon: Icon, iconClass, title, subtitle, actions, children }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${iconClass}`} />
          <h2 className="font-semibold text-gray-900">{title}</h2>
          {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Empty({ message }) {
  return (
    <div className="py-8 text-center">
      <CheckCircle className="h-6 w-6 text-gray-300 mx-auto mb-2" />
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

function Row({ name, onClick, sub, chip }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-gray-200/60 last:border-0">
      <div className="min-w-0">
        <button onClick={onClick} className="text-sm font-medium text-gray-800 hover:text-emerald-700 hover:underline truncate text-left">
          {name}
        </button>
        <p className="text-xs text-gray-500">{sub}</p>
      </div>
      {chip}
    </div>
  );
}

function Chip({ tone = 'gray', children }) {
  const tones = {
    gray:    'bg-gray-100 text-gray-600',
    emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    amber:   'bg-amber-50 text-amber-700 border border-amber-200',
    pink:    'bg-pink-50 text-pink-700 border border-pink-200',
  };
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

function SkeletonRows() {
  return (
    <div className="space-y-2 p-5">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />)}
    </div>
  );
}

function StatTile({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
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
    <div className="flex items-center gap-1.5">
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

function dayLabel(info) {
  if (info.days === 0) return 'Today';
  if (info.days === 1) return 'Tomorrow';
  if (info.days === -1) return 'Yesterday';
  if (info.days < 0) return `${-info.days}d ago`;
  return `in ${info.days}d`;
}

function YearlyList({ entries, emptyMessage, sub, onViewClient }) {
  const grouped = DATE_BUCKETS
    .map((b) => ({ ...b, items: entries.filter((e) => e.info.bucket === b.key) }))
    .filter((g) => g.items.length);
  if (!grouped.length) return <Empty message={emptyMessage} />;
  return grouped.map((g) => (
    <div key={g.key}>
      <p className="px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-50 border-b border-gray-200/60">
        {g.label} <span className="font-normal normal-case tracking-normal text-gray-400">· {g.items.length}{g.hint ? ` · ${g.hint}` : ''}</span>
      </p>
      {g.items.map((e) => (
        <Row
          key={e.person.id}
          name={e.person.name}
          onClick={() => onViewClient(e.person.mindbody_id)}
          sub={`${format(e.info.date, 'EEE d MMM')} · ${sub(e)}${e.person.simple === 'Inactive' ? ' · lapsed' : ''}`}
          chip={<Chip tone={e.info.bucket === 'today' ? 'emerald' : e.info.bucket === 'past' ? 'gray' : 'pink'}>{dayLabel(e.info)}</Chip>}
        />
      ))}
    </div>
  ));
}

export default function MilestonesTab({ pipelineIds, onViewClient, appSettings, staff, isManager }) {
  const { people, sessionRows, coverage, loading, error } = useMilestones({ pipelineIds });
  const [within, setWithin]       = useState('3');
  const [hitWindow, setHitWindow] = useState('14');
  const [showLapsed, setShowLapsed] = useState(false);

  const targets = appSettings?.settings?.milestone_targets?.length
    ? appSettings.settings.milestone_targets
    : DEFAULT_MILESTONE_TARGETS;
  const today = useMemo(() => startOfDay(new Date()), []);

  const upcoming = useMemo(() => upcomingMilestones(sessionRows, targets, Number(within), today), [sessionRows, targets, within, today]);
  const hits     = useMemo(() => recentMilestoneHits(sessionRows, sinceFor(hitWindow, today)), [sessionRows, hitWindow, today]);

  const birthdays = useMemo(() => people
    .filter((p) => showLapsed || p.simple !== 'Inactive')
    .map((p) => ({ person: p, info: yearlyBucket(parseDate(p.birth_date), today) }))
    .filter((e) => e.info && parseDate(e.person.birth_date).getFullYear() > 1900)
    .sort((a, b) => a.info.days - b.info.days), [people, showLapsed, today]);

  const anniversaries = useMemo(() => people
    .filter((p) => p.simple !== 'Inactive')
    // start_date = real start (set for members imported from the old system); else Mindbody's creation date.
    .map((p) => ({ person: p, info: yearlyBucket(parseDate(p.start_date || p.creation_date), today) }))
    .filter((e) => e.info && e.info.years >= 1)
    .sort((a, b) => a.info.days - b.info.days), [people, today]);

  const weekCount = (list) => list.filter((e) => e.info.bucket === 'today' || e.info.bucket === 'week').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Milestones</h1>
        <p className="text-sm text-gray-500">Session milestones, birthdays and anniversaries to celebrate on the floor.</p>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">Could not load: {error}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={`Milestones within ${within}`} value={loading ? '–' : upcoming.length} tone="text-amber-600" />
        <StatTile label="Milestones just hit"           value={loading ? '–' : hits.length}     tone="text-emerald-600" />
        <StatTile label="Birthdays this week"           value={loading ? '–' : weekCount(birthdays)} tone="text-pink-600" />
        <StatTile label="Anniversaries this week"       value={loading ? '–' : weekCount(anniversaries)} tone="text-violet-600" />
      </div>

      <Panel
        icon={Trophy}
        iconClass="text-amber-500"
        title="Session milestones"
        subtitle={`Targets: ${targets.join(', ')}`}
        actions={isManager && (
          <TargetsEditor targets={targets} onSave={(list) => appSettings.save({ milestone_targets: list }, staff?.id)} />
        )}
      >
        {coverage.partial && (
          <p className="px-5 py-2.5 text-xs text-amber-800 bg-amber-50 border-b border-amber-200">
            Check-in history only goes back to {format(coverage.historyFrom, 'd MMM yyyy')} (Mindbody starts {format(coverage.gymStart, 'd MMM yyyy')}),
            so session counts are short for longer-standing members until the history backfill runs.
          </p>
        )}
        <div className="grid md:grid-cols-2 md:divide-x divide-gray-200">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-gray-200">
              <p className="text-sm font-medium text-gray-700">Coming up</p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                within
                <Segmented options={WITHIN_OPTIONS.map((n) => ({ key: String(n), label: String(n) }))} value={within} onChange={setWithin} />
                sessions
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loading ? <SkeletonRows /> : upcoming.length === 0
                ? <Empty message={`Nobody within ${within} session${within === '1' ? '' : 's'} of a milestone`} />
                : upcoming.map((u) => (
                    <Row
                      key={u.mindbody_id}
                      name={u.client.name}
                      onClick={() => onViewClient(u.mindbody_id)}
                      sub={`${u.total} sessions · ${u.remaining} to go${u.eta ? ` · likely ~${format(u.eta, 'EEE d MMM')}` : ''}`}
                      chip={<Chip tone="amber">{u.next}</Chip>}
                    />
                  ))}
            </div>
          </div>
          <div className="border-t md:border-t-0 border-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-gray-200">
              <p className="text-sm font-medium text-gray-700">Just hit</p>
              <Segmented options={HIT_WINDOWS} value={hitWindow} onChange={setHitWindow} />
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loading ? <SkeletonRows /> : hits.length === 0
                ? <Empty message="No milestones hit in this window" />
                : hits.map((h) => (
                    <Row
                      key={`${h.mindbody_id}-${h.n}`}
                      name={h.client.name}
                      onClick={() => onViewClient(h.mindbody_id)}
                      sub={`Hit ${h.n} on ${format(h.date, 'EEE d MMM')} · now ${h.total_visits}`}
                      chip={<Chip tone="emerald">{h.n}</Chip>}
                    />
                  ))}
            </div>
          </div>
        </div>
        <p className="px-5 py-2.5 text-xs text-gray-400 border-t border-gray-200">
          Counts every signed-in class and completed appointment in Mindbody. "Likely" dates use each client's last 4 weeks of visits.
        </p>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          icon={Cake}
          iconClass="text-pink-500"
          title="Birthdays"
          actions={(
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              <input type="checkbox" checked={showLapsed} onChange={(e) => setShowLapsed(e.target.checked)} />
              Include lapsed members
            </label>
          )}
        >
          <div className="max-h-[32rem] overflow-y-auto">
            {loading ? <SkeletonRows /> : (
              <YearlyList
                entries={birthdays}
                emptyMessage="No birthdays from last week to the end of next month"
                sub={(e) => (e.info.bucket === 'past' ? `turned ${e.info.years}` : `turning ${e.info.years}`)}
                onViewClient={onViewClient}
              />
            )}
          </div>
        </Panel>

        <Panel icon={Star} iconClass="text-violet-500" title="Anniversaries" subtitle="Active members">
          <div className="max-h-[32rem] overflow-y-auto">
            {loading ? <SkeletonRows /> : (
              <YearlyList
                entries={anniversaries}
                emptyMessage="No anniversaries from last week to the end of next month"
                sub={(e) => `${e.info.years} ${e.info.years === 1 ? 'year' : 'years'}`}
                onViewClient={onViewClient}
              />
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
