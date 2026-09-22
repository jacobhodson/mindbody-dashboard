import { Pencil, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { renderFormatted } from '../utils/richText.js';
import AddProgress from './AddProgress.jsx';

// These two are fed automatically every night by scheduled-daily-refresh.js
// from Mindbody — no manual "Update metric" control for them, and managers
// can't edit/archive them from here (they're not something you create).
const MINDBODY_METRIC_KEYS = new Set(['attendance_visits', 'revenue']);

// Compact mode's stand-in for a second ProgressRow — the secondary cadence
// (whichever of weekly/monthly ISN'T the primary row) shown as one small
// line instead of its own bar + remaining + "Log progress" control, so a
// metric with both cadences set doesn't cost double the card height.
function SecondaryCadenceBadge({ cadenceLabel, target, direction, actual }) {
  const isAtMost = direction === 'at_most';
  const pct = target.target_value > 0 ? Math.round((actual / target.target_value) * 100) : 0;
  const over = isAtMost && actual > target.target_value;
  return (
    <p className={`mt-1.5 text-[10px] tabular-nums ${over ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
      {cadenceLabel}: {actual}/{target.target_value} · {pct}%{over ? ' over' : ''}
    </p>
  );
}

function ProgressRow({ cadenceLabel, target, actual, lastUpdated, canUpdate, onLog, subtleUpdateButton }) {
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
        {canUpdate && <AddProgress onAdd={(n) => onLog(target.metric_key, n)} subtle={subtleUpdateButton} />}
        <span className="text-[10px] text-gray-400 shrink-0 ml-auto">
          {lastUpdated ? `Updated ${formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })}` : 'No updates yet'}
        </span>
      </div>
    </div>
  );
}

/**
 * One metric's card. Used by WinTheWeek.jsx (department columns),
 * Scoreboard.jsx (flat list), and TargetsPanel.jsx (home page); which
 * metrics a given instance sees is decided by the caller (filter `targets`
 * by department before grouping with groupTargetsByMetric).
 *
 * `activeCadence` ('weekly' | 'monthly') is optional — pass it to show just
 * that one cadence's row (Scoreboard's condensed Week/Month tabs); omit it
 * to stack whichever of weekly/monthly exist (WinTheWeek's original layout).
 *
 * `compact` (home page only, 2026-09-22): shows just ONE full progress row
 * — weekly if the metric has it, monthly as a fallback for a weekly-less
 * metric — plus, if the *other* cadence also has a target, one small
 * SecondaryCadenceBadge line instead of a second full row. Home used to
 * stack both cadences in full (like WinTheWeek's default), which made a
 * grid of 5-6 of these wrap across multiple rows and feel cluttered while
 * scrolling — compact keeps every card to one progress-bar's height while
 * still surfacing "how's the month tracking" at a glance.
 */
export default function MetricTargetCard({
  metricKey, label, weeklyTarget, monthlyTarget, direction, owners, activeCadence, compact,
  staffList, isManager, staff, actualFor, lastUpdatedFor, onLog, onEdit, onArchive,
  showManageControls = true,
}) {
  const isMindbody = MINDBODY_METRIC_KEYS.has(metricKey);
  const ownerNames = owners.map((id) => staffList.find((s) => s.id === id)?.full_name).filter(Boolean).join('/');
  const canUpdate = !isMindbody && (isManager || owners.includes(staff?.id));

  const primaryTarget = compact ? (weeklyTarget || monthlyTarget) : null;
  const primaryLabel  = compact ? (primaryTarget === weeklyTarget ? 'This week' : 'This month') : null;
  const secondaryTarget = compact && primaryTarget
    ? (primaryTarget === weeklyTarget ? monthlyTarget : weeklyTarget)
    : null;
  const secondaryLabel = secondaryTarget === monthlyTarget ? 'Month' : 'Week';

  const rows = compact
    ? [primaryTarget ? { cadenceLabel: primaryLabel, target: primaryTarget } : null].filter((r) => r?.target)
    : [
        !activeCadence || activeCadence === 'weekly'  ? { cadenceLabel: 'This week',  target: weeklyTarget }  : null,
        !activeCadence || activeCadence === 'monthly' ? { cadenceLabel: 'This month', target: monthlyTarget } : null,
      ].filter((r) => r?.target);

  // Nothing to show for the tab that's currently selected (this metric only
  // has the other cadence) — the caller (Scoreboard) already filters these
  // out of the list, but WinTheWeek/TargetsPanel never set activeCadence so
  // this never fires for them.
  if (activeCadence && rows.length === 0) return null;
  if (compact && rows.length === 0) return null; // metric has neither cadence — shouldn't happen, but don't render an empty card

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
            subtleUpdateButton={compact}
          />
        ))}
      </div>

      {compact && secondaryTarget && (
        <SecondaryCadenceBadge
          cadenceLabel={secondaryLabel}
          target={secondaryTarget}
          direction={direction}
          actual={actualFor(secondaryTarget)}
        />
      )}
    </div>
  );
}
