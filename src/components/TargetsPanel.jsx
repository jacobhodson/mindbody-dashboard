import { useMemo } from 'react';
import { Target } from 'lucide-react';
import { useTargets, groupTargetsByMetric } from '../utils/useTargets.js';
import { useMetricProgress } from '../utils/useMetricProgress.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import MetricTargetCard from './MetricTargetCard.jsx';

/**
 * Home-page mirror of the Scorecard tab's Scoreboard AND Win the Week,
 * pinned to the weekly cadence — "This week's targets" (2026-09-21 rebuild,
 * widened 2026-09-22 to include Win the Week). Used to be its own separate
 * raw target list (plain numbers, no progress bars, its own "New target"
 * form) that had drifted out of step with how Scoreboard.jsx actually
 * displays the same underlying `targets` rows. Now it's the exact same data
 * pipeline (groupTargetsByMetric + MetricTargetCard + useMetricProgress) —
 * nothing here to independently drift out of sync with the Scorecard tab
 * ever again, because it's the same read.
 *
 * Deliberately NOT filtered by `department` anymore: Win the Week's
 * operations/acquisition targets (e.g. "open week referral messages") need
 * to show up here too, so the week's open Win the Week items are visible
 * without a trip to the Scorecard tab. activeCadence="weekly" on
 * MetricTargetCard already does the trimming that matters here — a metric
 * with no weekly row (monthly-only) renders nothing, so this panel only
 * ever shows what's actually due *this week*, whichever tab it came from.
 *
 * showManageControls={false} hides the edit/archive pencil+trash (metric
 * management belongs in the Scorecard tab, not a home-page glance) while
 * still allowing progress logging (AddProgress) for whoever owns a metric.
 */
export default function TargetsPanel({ staff, isManager }) {
  const { targets, loading, error } = useTargets(staff);
  const { actualFor, lastUpdatedFor, logProgress } = useMetricProgress(targets);
  const { staffList } = useAllStaff();

  // Filtered to metrics that actually have a weekly row — a monthly-only
  // metric (some Win the Week acquisition targets are monthly, not weekly)
  // would otherwise count toward `metrics.length` here while its
  // MetricTargetCard renders nothing (activeCadence="weekly" with no
  // weekly row), leaving a card-less gap with no "nothing to show" message.
  const metrics = useMemo(() => groupTargetsByMetric(targets).filter((m) => m.weeklyTarget), [targets]);

  if (loading) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <Target className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-gray-900">This week's targets</h3>
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {metrics.length === 0 ? (
        <p className="text-xs text-gray-500">No metrics tracked yet — set these up in the Scorecard tab's Scoreboard.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {metrics.map((metric) => (
            <MetricTargetCard
              key={metric.metricKey}
              metricKey={metric.metricKey}
              label={metric.label}
              weeklyTarget={metric.weeklyTarget}
              monthlyTarget={metric.monthlyTarget}
              direction={metric.direction}
              activeCadence="weekly"
              owners={metric.owners}
              staffList={staffList}
              isManager={isManager}
              staff={staff}
              actualFor={actualFor}
              lastUpdatedFor={lastUpdatedFor}
              onLog={logProgress}
              showManageControls={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
