import { useMemo } from 'react';
import { Target } from 'lucide-react';
import { useTargets, groupTargetsByMetric } from '../utils/useTargets.js';
import { useMetricProgress } from '../utils/useMetricProgress.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import MetricTargetCard from './MetricTargetCard.jsx';

/**
 * Home-page mirror of the Scorecard tab's Scoreboard, pinned to the weekly
 * cadence — "This week's targets" (2026-09-21 rebuild). Used to be its own
 * separate raw target list (plain numbers, no progress bars, its own
 * "New target" form) that had drifted out of step with how Scoreboard.jsx
 * actually displays the same underlying `targets` rows. Now it's the exact
 * same data pipeline (groupTargetsByMetric + MetricTargetCard +
 * useMetricProgress) filtered to `!department` (Scoreboard's own metrics,
 * not WinTheWeek's) — nothing here to independently drift out of sync
 * with the Scorecard tab ever again, because it's the same read.
 *
 * showManageControls={false} hides the edit/archive pencil+trash (metric
 * management belongs in the Scorecard tab, not a home-page glance) while
 * still allowing progress logging (AddProgress) for whoever owns a metric.
 */
export default function TargetsPanel({ staff, isManager }) {
  const { targets, loading, error } = useTargets(staff);
  const scoreboardTargets = targets.filter((t) => !t.department);
  const { actualFor, lastUpdatedFor, logProgress } = useMetricProgress(scoreboardTargets);
  const { staffList } = useAllStaff();

  const metrics = useMemo(() => groupTargetsByMetric(scoreboardTargets), [targets]);

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
