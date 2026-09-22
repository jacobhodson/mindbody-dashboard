import { useState, useMemo } from 'react';
import { Target } from 'lucide-react';
import { useTargets, groupTargetsByMetric } from '../utils/useTargets.js';
import { useMetricProgress } from '../utils/useMetricProgress.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import { useRolloverStats } from '../utils/useRolloverStats.js';
import MetricTargetCard from './MetricTargetCard.jsx';
import RolloverRateCard from './RolloverRateCard.jsx';

const TABS = [
  { key: 'win',      label: 'Win the Week' },
  { key: 'followup', label: 'Projects' },
];

// Fixed display order for the Win the Week strip, independent of whatever
// order `targets` happens to load in (2026-09-22: "revenue first, then
// leads, sales, rollovers, attendance, finish with churn"). 'rollover' is a
// sentinel, not a metric_key — it stands for the separately-sourced
// RolloverRateCard (see useRolloverStats.js), slotted into this same order.
// Anything not in this list (a metric nobody's sorted yet) is appended at
// the end in whatever order it loaded, so a newly-added metric never goes
// missing — it just starts at the back until this list is updated.
const WIN_ORDER = ['revenue', 'leads', 'sales', 'rollover', 'attendance_visits', 'churn'];

const DEPARTMENTS = [
  { key: 'operations',  label: 'Operations' },
  { key: 'acquisition', label: 'Acquisition' },
];

/**
 * Home-page mirror of the Scorecard tab's Scoreboard AND Win the Week
 * (2026-09-21 rebuild; split into tabs 2026-09-22 per feedback — the two
 * had been mashed into one flat grid, which buried the operations/
 * acquisition follow-up items among the core scoreboard KPIs). Same data
 * pipeline as Scoreboard.jsx/WinTheWeek.jsx (groupTargetsByMetric +
 * MetricTargetCard + useMetricProgress) so this never drifts out of step
 * with the Scorecard tab — it's the same read, just tabbed and read-only.
 *
 * Tab "Win the Week": the core company KPIs — rollover rate, leads, sales,
 * churn, attendance, revenue, etc — i.e. Scoreboard.jsx's `!department`
 * metrics, plus the Rollover Rate card (computed from onboarding decisions,
 * not a `targets` row, see useRolloverStats.js) since it's one of the KPIs
 * this tab is meant to surface. Laid out as a single horizontally-scrolling
 * row on desktop (2026-09-22 feedback: a 3-column grid of stacked
 * week+month cards wrapped into multiple rows and felt cluttered scrolling
 * past it) rather than wrapping — every card is `compact` (see
 * MetricTargetCard.jsx), so it costs one progress bar's height no matter
 * how many cadences the metric actually has. Cards follow a fixed order
 * (WIN_ORDER above), not load order.
 *
 * Tab "Projects": WinTheWeek.jsx's operations/acquisition targets — the
 * open, project-style items (e.g. "open week referral messages"). Grouped
 * into the same two department columns WinTheWeek.jsx uses; kept as
 * vertical lists (not a single row) since these read like a checklist, not
 * a KPI strip — but still `compact` for the same one-row-per-card reason.
 *
 * Neither tab pins to `activeCadence` — a target that's only ever been
 * given a monthly value (no weekly row) used to vanish here entirely
 * (2026-09-22 bug report: a follow-up item without a "strict weekly"
 * target never showed up in "This week's targets"). `compact` on
 * MetricTargetCard shows the weekly row when one exists (falling back to
 * monthly for a weekly-less metric) plus a one-line badge for whichever
 * cadence isn't primary, so nothing with a target — weekly, monthly, or
 * both — can go missing, and the week/month relationship (this week's
 * number feeds the month's) is visible without doubling every card's
 * height the way stacking both full rows did.
 *
 * showManageControls={false} hides the edit/archive pencil+trash on every
 * card (metric management belongs in the Scorecard tab, not a home-page
 * glance) while still allowing progress logging (AddProgress) for whoever
 * owns a metric.
 */
export default function TargetsPanel({ staff, isManager }) {
  const { targets, loading, error } = useTargets(staff);
  const { actualFor, lastUpdatedFor, logProgress } = useMetricProgress(targets);
  const { staffList } = useAllStaff();
  const { statsFor: rolloverStatsFor, loading: rolloverLoading } = useRolloverStats();
  const [tab, setTab] = useState('win');

  const winMetrics = useMemo(
    () => groupTargetsByMetric(targets.filter((t) => !t.department)),
    [targets],
  );

  // Slots the metric cards (plus the 'rollover' sentinel for RolloverRateCard)
  // into WIN_ORDER's fixed sequence.
  const winSlots = useMemo(() => {
    const byKey = new Map(winMetrics.map((m) => [m.metricKey, m]));
    const ordered = [];
    for (const key of WIN_ORDER) {
      if (key === 'rollover') { ordered.push({ key: 'rollover', type: 'rollover' }); continue; }
      const metric = byKey.get(key);
      if (metric) { ordered.push({ key, type: 'metric', metric }); byKey.delete(key); }
    }
    for (const metric of byKey.values()) ordered.push({ key: metric.metricKey, type: 'metric', metric });
    return ordered;
  }, [winMetrics]);

  const followUpByDept = useMemo(() => {
    const grouped = groupTargetsByMetric(targets.filter((t) => t.department));
    const m = { operations: [], acquisition: [] };
    for (const g of grouped) m[g.department]?.push(g);
    return m;
  }, [targets]);

  if (loading) return null;

  const cardProps = (metric) => ({
    metricKey: metric.metricKey,
    label: metric.label,
    weeklyTarget: metric.weeklyTarget,
    monthlyTarget: metric.monthlyTarget,
    direction: metric.direction,
    owners: metric.owners,
    compact: true,
    staffList,
    isManager,
    staff,
    actualFor,
    lastUpdatedFor,
    onLog: logProgress,
    showManageControls: false,
  });

  const weekRolloverStats  = rolloverStatsFor('weekly');
  const monthRolloverStats = rolloverStatsFor('monthly');

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-gray-900">This week's targets</h3>
        </div>
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                tab === t.key ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {tab === 'win' ? (
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-nowrap sm:items-start sm:overflow-x-auto sm:pb-1">
          {winMetrics.length === 0 && (
            <p className="text-xs text-gray-500">No metrics tracked yet — set these up in the Scorecard tab's Scoreboard.</p>
          )}
          {winSlots.map((slot) => {
            if (slot.type === 'rollover') {
              if (rolloverLoading) return null;
              return (
                <div key="rollover" className="sm:min-w-[190px] sm:flex-1">
                  <RolloverRateCard cadenceLabel="This week" monthPct={monthRolloverStats.pct} {...weekRolloverStats} />
                </div>
              );
            }
            return (
              <div key={slot.key} className="sm:min-w-[190px] sm:flex-1">
                <MetricTargetCard {...cardProps(slot.metric)} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {DEPARTMENTS.map((dept) => (
            <div key={dept.key} className="space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{dept.label}</h4>
              {followUpByDept[dept.key].length === 0 ? (
                <p className="text-xs text-gray-400">No open items.</p>
              ) : (
                followUpByDept[dept.key].map((metric) => (
                  <MetricTargetCard key={metric.metricKey} {...cardProps(metric)} />
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
