import { useState, useMemo } from 'react';
import { BarChart3, Plus } from 'lucide-react';
import { useTargets, groupTargetsByMetric } from '../utils/useTargets.js';
import { useMetricProgress } from '../utils/useMetricProgress.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import MetricTargetCard from './MetricTargetCard.jsx';
import MetricTargetForm from './MetricTargetForm.jsx';

/**
 * Company-wide KPIs — Attendance and Revenue flow in automatically every
 * night from Mindbody (scheduled-daily-refresh.js); Leads/Sales/Rollovers/
 * Churn/etc are staff-logged the same way Win the Week targets are.
 * Distinguished from WinTheWeek.jsx purely by `department` being null —
 * same underlying targets/metric_actuals, just no department grouping.
 */
export default function Scoreboard({ staff, isManager }) {
  const { targets, loading: targetsLoading, error, saveMetricTargets, archiveMetric } = useTargets(staff);
  const scoreboardTargets = targets.filter((t) => !t.department);
  const { actualFor, lastUpdatedFor, logProgress } = useMetricProgress(scoreboardTargets);
  const { staffList } = useAllStaff();
  const [adding, setAdding] = useState(false);
  const [editingKey, setEditingKey] = useState(null);

  const metrics = useMemo(() => groupTargetsByMetric(scoreboardTargets), [targets]);

  if (targetsLoading) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-gray-900">Scoreboard</h3>
        </div>
        {isManager && !adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900">
            <Plus className="h-3.5 w-3.5" /> Add metric
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <div className="space-y-3">
        {metrics.length === 0 && !adding && (
          <p className="text-xs text-gray-500">No metrics tracked yet.</p>
        )}

        {metrics.map((metric) => (
          editingKey === metric.metricKey ? (
            <MetricTargetForm
              key={metric.metricKey}
              initial={metric}
              staffList={staffList}
              onSubmit={saveMetricTargets}
              onClose={() => setEditingKey(null)}
            />
          ) : (
            <MetricTargetCard
              key={metric.metricKey}
              metricKey={metric.metricKey}
              label={metric.label}
              weeklyTarget={metric.weeklyTarget}
              monthlyTarget={metric.monthlyTarget}
              owners={metric.owners}
              staffList={staffList}
              isManager={isManager}
              staff={staff}
              actualFor={actualFor}
              lastUpdatedFor={lastUpdatedFor}
              onLog={logProgress}
              onEdit={() => setEditingKey(metric.metricKey)}
              onArchive={() => archiveMetric(metric.metricKey)}
            />
          )
        ))}

        {isManager && adding && (
          <MetricTargetForm
            staffList={staffList}
            onSubmit={saveMetricTargets}
            onClose={() => setAdding(false)}
          />
        )}
      </div>
    </div>
  );
}
