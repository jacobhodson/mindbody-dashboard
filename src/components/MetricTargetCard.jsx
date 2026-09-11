import { Pencil, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { renderFormatted } from '../utils/richText.js';
import AddProgress from './AddProgress.jsx';

// These two are fed automatically every night by scheduled-daily-refresh.js
// from Mindbody — no manual "Update metric" control for them, and managers
// can't edit/archive them from here (they're not something you create).
const MINDBODY_METRIC_KEYS = new Set(['attendance_visits', 'revenue']);

function ProgressRow({ cadenceLabel, target, actual, lastUpdated, canUpdate, onLog }) {
  const remaining = Math.max(0, target.target_value - actual);
  const pct = target.target_value > 0 ? Math.min(100, Math.round((actual / target.target_value) * 100)) : 0;

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-xs text-gray-500">{cadenceLabel}</span>
        <span className="font-semibold tabular-nums text-gray-900">{actual} / {target.target_value}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-[10px] text-gray-500 shrink-0">{remaining} remaining</span>
        {canUpdate && <AddProgress onAdd={(n) => onLog(target.metric_key, n)} />}
        <span className="text-[10px] text-gray-400 shrink-0 ml-auto">
          {lastUpdated ? `Updated ${formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })}` : 'No updates yet'}
        </span>
      </div>
    </div>
  );
}

/**
 * One metric's card — combines its weekly and/or monthly target row into
 * one card with a progress bar per cadence that exists. Used by both
 * WinTheWeek.jsx (department columns) and Scoreboard.jsx (flat list); which
 * metrics a given instance sees is decided by the caller (filter `targets`
 * by department before grouping with groupTargetsByMetric).
 */
export default function MetricTargetCard({
  metricKey, label, weeklyTarget, monthlyTarget, owners,
  staffList, isManager, staff, actualFor, lastUpdatedFor, onLog, onEdit, onArchive,
}) {
  const isMindbody = MINDBODY_METRIC_KEYS.has(metricKey);
  const ownerNames = owners.map((id) => staffList.find((s) => s.id === id)?.full_name).filter(Boolean).join('/');
  const canUpdate = !isMindbody && (isManager || owners.includes(staff?.id));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{renderFormatted(label)}</p>
          {ownerNames && <p className="text-xs text-gray-500">{ownerNames}</p>}
        </div>
        {isManager && !isMindbody && (
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={onEdit} className="text-gray-400 hover:text-gray-700"><Pencil className="h-3.5 w-3.5" /></button>
            <button
              onClick={() => { if (window.confirm(`Archive "${label}"?`)) onArchive(); }}
              className="text-gray-400 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {weeklyTarget && (
          <ProgressRow
            cadenceLabel="This week" target={weeklyTarget} actual={actualFor(weeklyTarget)}
            lastUpdated={lastUpdatedFor(weeklyTarget)} canUpdate={canUpdate} onLog={onLog}
          />
        )}
        {monthlyTarget && (
          <ProgressRow
            cadenceLabel="This month" target={monthlyTarget} actual={actualFor(monthlyTarget)}
            lastUpdated={lastUpdatedFor(monthlyTarget)} canUpdate={canUpdate} onLog={onLog}
          />
        )}
      </div>
    </div>
  );
}
