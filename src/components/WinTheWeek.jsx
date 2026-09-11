import { useState, useMemo } from 'react';
import { Target, Plus } from 'lucide-react';
import { useTargets, groupTargetsByMetric } from '../utils/useTargets.js';
import { useMetricProgress } from '../utils/useMetricProgress.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import MetricTargetCard from './MetricTargetCard.jsx';
import MetricTargetForm from './MetricTargetForm.jsx';

const DEPARTMENTS = [
  { key: 'operations',  label: 'Operations' },
  { key: 'acquisition', label: 'Acquisition' },
];

export default function WinTheWeek({ staff, isManager }) {
  const { targets, loading: targetsLoading, error, saveMetricTargets, archiveMetric } = useTargets(staff);
  const { actualFor, lastUpdatedFor, logProgress } = useMetricProgress(targets.filter((t) => t.department));
  const { staffList } = useAllStaff();
  const [addingTo, setAddingTo] = useState(null);   // department key, or null
  const [editingKey, setEditingKey] = useState(null); // metric_key, or null

  const byDepartment = useMemo(() => {
    const grouped = groupTargetsByMetric(targets.filter((t) => t.department));
    const m = { operations: [], acquisition: [] };
    for (const g of grouped) m[g.department]?.push(g);
    return m;
  }, [targets]);

  if (targetsLoading) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-gray-900">Win the Week</h3>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {DEPARTMENTS.map((dept) => (
          <div key={dept.key} className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{dept.label}</h4>
              {isManager && addingTo !== dept.key && (
                <button onClick={() => setAddingTo(dept.key)} className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900">
                  <Plus className="h-3.5 w-3.5" /> Add target
                </button>
              )}
            </div>

            {byDepartment[dept.key].length === 0 && addingTo !== dept.key && (
              <p className="text-xs text-gray-400">No targets yet.</p>
            )}

            {byDepartment[dept.key].map((metric) => (
              editingKey === metric.metricKey ? (
                <MetricTargetForm
                  key={metric.metricKey}
                  initial={metric}
                  department={dept.key}
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

            {isManager && addingTo === dept.key && (
              <MetricTargetForm
                department={dept.key}
                staffList={staffList}
                onSubmit={saveMetricTargets}
                onClose={() => setAddingTo(null)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
