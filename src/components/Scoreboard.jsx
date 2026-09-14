import { useState, useMemo } from 'react';
import { BarChart3, Plus } from 'lucide-react';
import { useTargets, groupTargetsByMetric } from '../utils/useTargets.js';
import { useMetricProgress } from '../utils/useMetricProgress.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import { useRolloverStats } from '../utils/useRolloverStats.js';
import MetricTargetCard from './MetricTargetCard.jsx';
import MetricTargetForm from './MetricTargetForm.jsx';
import RolloverRateCard from './RolloverRateCard.jsx';

const CADENCE_TABS = [
  { key: 'weekly',  label: 'Week' },
  { key: 'monthly', label: 'Month' },
];

/**
 * Company-wide KPIs — Attendance and Revenue flow in automatically every
 * night from Mindbody (scheduled-daily-refresh.js); Leads/Sales/Rollovers/
 * Churn/etc are staff-logged the same way Win the Week targets are.
 * Distinguished from WinTheWeek.jsx purely by `department` being null —
 * same underlying targets/metric_actuals, just no department grouping.
 *
 * Condensed vs the original stacked-week+month cards (2026-09-17, per
 * feedback): a Week/Month tab picks one cadence's row per card instead of
 * always showing both — see MetricTargetCard's `activeCadence` prop.
 */
export default function Scoreboard({ staff, isManager }) {
  const { targets, loading: targetsLoading, error, saveMetricTargets, archiveMetric } = useTargets(staff);
  const scoreboardTargets = targets.filter((t) => !t.department);
  const { actualFor, lastUpdatedFor, logProgress } = useMetricProgress(scoreboardTargets);
  const { staffList } = useAllStaff();
  const { statsFor: rolloverStatsFor, loading: rolloverLoading } = useRolloverStats();
  const [adding, setAdding] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [cadenceTab, setCadenceTab] = useState('weekly');

  const metrics = useMemo(() => groupTargetsByMetric(scoreboardTargets), [targets]);
  const rolloverStats = rolloverStatsFor(cadenceTab);

  if (targetsLoading) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-gray-900">Scoreboard</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
            {CADENCE_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setCadenceTab(key)}
                className={`px-3 py-1 font-medium transition-colors ${
                  cadenceTab === key ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {isManager && !adding && (
            <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900">
              <Plus className="h-3.5 w-3.5" /> Add metric
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {metrics.length === 0 && !adding && (
          <p className="text-xs text-gray-500">No metrics tracked yet.</p>
        )}

        {!rolloverLoading && (
          <RolloverRateCard
            cadenceLabel={cadenceTab === 'weekly' ? 'This week' : 'This month'}
            rollovers={rolloverStats.rollovers}
            decided={rolloverStats.decided}
            pct={rolloverStats.pct}
          />
        )}

        {metrics.map((metric) => (
          editingKey === metric.metricKey ? (
            <div key={metric.metricKey} className="sm:col-span-2 xl:col-span-3">
              <MetricTargetForm
                initial={metric}
                staffList={staffList}
                onSubmit={saveMetricTargets}
                onClose={() => setEditingKey(null)}
              />
            </div>
          ) : (
            <MetricTargetCard
              key={metric.metricKey}
              metricKey={metric.metricKey}
              label={metric.label}
              weeklyTarget={metric.weeklyTarget}
              monthlyTarget={metric.monthlyTarget}
              direction={metric.direction}
              activeCadence={cadenceTab}
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
          <div className="sm:col-span-2 xl:col-span-3">
            <MetricTargetForm
              staffList={staffList}
              onSubmit={saveMetricTargets}
              onClose={() => setAdding(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
