import { Pencil, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { renderFormatted } from '../utils/richText.js';
import AddProgress from './AddProgress.jsx';

// These two are fed automatically every night by scheduled-daily-refresh.js
// from Mindbody — no manual "Update metric" control for them, and managers
// can't edit/archive them from here (they're not something you create).
const MINDBODY_METRIC_KEYS = new Set(['attendance_visits', 'revenue']);

function ProgressRow({ cadenceLabel, target, actual, lastUpdated, canUpdate, onLog }) {
  const isAtMost = target.direction === 'at_most';
  const pct = target.target_value > 0 ? Math.min(100, Math.round((actual / target.target_value) * 100)) : 0;
  // at_least: green fill, "remaining" counts up to the goal. at_most: the
  // goal is a cap — filling the bar is bad, so it goes red as actual
  // approaches/passes target_value instead of green, and "over" replaces
  // "remaining" once it's breached.
  const over = isAtMost && actual > target.target_value;
  const barColor = isAtMost ? (over ? 'bg-red-600' : pct >= 75 ? 'bg-amber-500' : 'bg-red-400') : 'bg-emerald-500';
  const remaining = isAtMost
    ? Math.abs(target.target_value - actual)
    : Math.max(0, target.target_value - actual);
  const remainingLabel = isAtMost
    ? (over ? `${remaining} over cap` : `${remaining} under cap`)
    : `${remaining} remaining`;

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-xs text-gray-500">{cadenceLabel}{isAtMost && ' (cap)'}</span>
        <span className={`font-semibold tabular-nums ${over ? 'text-red-600' : 'text-gray-900'}`}>
          {actual} / {target.target_value} <span className="text-xs text-gray-400 font-normal">· {pct}%</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className={`text-[10px] shrink-0 ${over ? 'text-red-600 font-medium' : 'text-gray-500'}`}>{remainingLabel}</span>
        {canUpdate && <AddProgress onAdd={(n) => onLog(target.metric_key, n)} />}
        <span className="text-[10px] text-gray-400 shrink-0 ml-auto">
          {lastUpdated ? `Updated ${formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })}` : 'No updates yet'}
        </span>
      </div>
    </div>
  );
}

/**
 * One metric's card. Used by both WinTheWeek.jsx (department columns) and
 * Scoreboard.jsx (flat list); which metrics a given instance sees is decided
 * by the caller (filter `targets` by department before grouping with
 * groupTargetsByMetric).
 *
 * `activeCadence` ('weekly' | 'monthly') is optional — pass it to show just
 * that one cadence's row (Scoreboard's condensed Week/Month tabs); omit it
 * to stack whichever of weekly/monthly exist (WinTheWeek's original layout).
 */
export default function MetricTargetCard({
  metricKey, label, weeklyTarget, monthlyTarget, direction, owners, activeCadence,
  staffList, isManager, staff, actualFor, lastUpdatedFor, onLog, onEdit, onArchive,
  showManageControls = true,
}) {
  const isMindbody = MINDBODY_METRIC_KEYS.has(metricKey);
  const ownerNames = owners.map((id) => staffList.find((s) => s.id === id)?.full_name).filter(Boolean).join('/');
  const canUpdate = !isMindbody && (isManager || owners.includes(staff?.id));

  const rows = [
    !activeCadence || activeCadence === 'weekly'  ? { cadenceLabel: 'This week',  target: weeklyTarget }  : null,
    !activeCadence || activeCadence === 'monthly' ? { cadenceLabel: 'This month', target: monthlyTarget } : null,
  ].filter((r) => r?.target);

  // Nothing to show for the tab that's currently selected (this metric only
  // has the other cadence) — the caller (Scoreboard) already filters these
  // out of the list, but WinTheWeek never sets activeCadence so this never
  // fires for it.
  if (activeCadence && rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{renderFormatted(label)}</p>
          {ownerNames && <p className="text-xs text-gray-500">{ownerNames}</p>}
        </div>
        {isManager && !isMindbody && showManageControls && (
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

      <div className="mt-2.5 space-y-2.5">
        {rows.map(({ cadenceLabel, target }) => (
          <ProgressRow
            key={target.cadence}
            cadenceLabel={cadenceLabel} target={{ ...target, direction }} actual={actualFor(target)}
            lastUpdated={lastUpdatedFor(target)} canUpdate={canUpdate} onLog={onLog}
          />
        ))}
      </div>
    </div>
  );
}
