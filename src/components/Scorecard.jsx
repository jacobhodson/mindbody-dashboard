import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Check, X as XIcon, Target } from 'lucide-react';
import { useScorecard } from '../utils/useScorecard.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import { periodStartForOffset, periodLabel } from '../utils/periods.js';

const CADENCES = [
  { key: 'daily',   label: 'Daily' },
  { key: 'weekly',  label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

export default function Scorecard() {
  const [cadence, setCadence] = useState('weekly');
  const [offset, setOffset]   = useState(0);
  const periodStart = periodStartForOffset(cadence, offset);

  const { staffList } = useAllStaff();
  const staffNameById = useMemo(() => {
    const m = {};
    for (const s of staffList) m[s.id] = s.full_name;
    return m;
  }, [staffList]);

  const {
    loading, error, teamTemplates, individualTemplates,
    teamDoneCount, individualCompletions, targets, completionFor, actualFor,
  } = useScorecard(cadence, periodStart);

  const changeCadence = (c) => { setCadence(c); setOffset(0); };

  // Per-person rate: for each staff member, how many individual-task
  // completions they logged this period vs. how many open individual
  // templates existed (a rough denominator — assigned tasks count 1:1,
  // "open" ones are available to everyone so the denominator is the same
  // template count for each person).
  const perPerson = useMemo(() => {
    const counts = {};
    for (const c of individualCompletions) {
      counts[c.staff_id] = (counts[c.staff_id] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([staffId, count]) => ({ staffId, name: staffNameById[staffId] || 'Unknown', count }))
      .sort((a, b) => b.count - a.count);
  }, [individualCompletions, staffNameById]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Scorecard</h1>
        <p className="text-sm text-gray-500">
          Task completion history, plus targets for the period. Attendance and revenue
          targets show real Mindbody-tracked actuals; other targets show their configured
          value only until they're synced too.
        </p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {CADENCES.map((c) => (
            <button
              key={c.key}
              onClick={() => changeCadence(c.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                cadence === c.key ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setOffset((o) => o - 1)} className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-600 hover:bg-gray-100">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-gray-900 min-w-[10rem] text-center">
            {periodLabel(cadence, periodStart)}
          </span>
          <button
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset >= 0}
            className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Team tasks</h3>
            {teamTemplates.length === 0 ? (
              <p className="text-xs text-gray-500">No team tasks for this cadence.</p>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-2">{teamDoneCount}/{teamTemplates.length} done</p>
                <ul className="space-y-1.5">
                  {teamTemplates.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      {completionFor(t)
                        ? <Check className="h-4 w-4 text-emerald-600 shrink-0" strokeWidth={3} />
                        : <XIcon className="h-4 w-4 text-gray-300 shrink-0" strokeWidth={3} />}
                      <span className="text-gray-800">{t.label}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Individual tasks</h3>
            {individualTemplates.length === 0 ? (
              <p className="text-xs text-gray-500">No individual tasks for this cadence.</p>
            ) : perPerson.length === 0 ? (
              <p className="text-xs text-gray-500">Nobody logged anything this period.</p>
            ) : (
              <ul className="space-y-1.5">
                {perPerson.map((p) => (
                  <li key={p.staffId} className="flex items-center justify-between text-sm">
                    <span className="text-gray-800">{p.name}</span>
                    <span className="text-gray-500 tabular-nums">{p.count} completed</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-gray-900">Targets for this period</h3>
            </div>
            {targets.length === 0 ? (
              <p className="text-xs text-gray-500">No targets were active this period.</p>
            ) : (
              <ul className="space-y-1.5">
                {targets.map((t) => {
                  const actual = actualFor(t);
                  const hit    = actual != null && actual >= t.target_value;
                  return (
                    <li key={t.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-800">{t.label || t.metric_key}</span>
                      {actual == null ? (
                        <span className="text-gray-500 tabular-nums">target: {t.target_value.toLocaleString()}</span>
                      ) : (
                        <span className={`tabular-nums font-medium ${hit ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {actual.toLocaleString()} <span className="text-gray-400 font-normal">/ {t.target_value.toLocaleString()}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
