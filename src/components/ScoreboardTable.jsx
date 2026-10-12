import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { renderFormatted } from '../utils/richText.js';

// Fed nightly from Mindbody (see MetricTargetCard.jsx) — never hand-edited.
const MINDBODY_METRIC_KEYS = new Set(['attendance_visits', 'revenue']);

function fmt(metricKey, n) {
  const rounded = Math.round(n);
  return metricKey === 'revenue' ? `$${rounded.toLocaleString()}` : rounded.toLocaleString();
}

// hit / missed / in-progress colouring. at_most metrics (caps, e.g. churn)
// are hit when at or under target.
function cellTone(actual, target, direction, inProgress) {
  if (target == null) return 'text-gray-700';
  const hit = direction === 'at_most' ? actual <= target : actual >= target;
  if (hit) return 'bg-emerald-500/10 text-emerald-700';
  if (inProgress) return 'text-gray-700';
  return 'bg-red-500/10 text-red-700';
}

function EditCell({ initial, onSave, onCancel }) {
  const [value, setValue] = useState(String(Math.round(initial)));
  const [busy, setBusy]   = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (value === '' || Number(value) < 0) return;
    setBusy(true);
    await onSave(Number(value));
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="flex items-center justify-end gap-1">
      <input
        type="number" min="0" autoFocus value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
        className="w-20 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-right text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <button type="submit" disabled={busy} className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
        Save
      </button>
    </form>
  );
}

/**
 * Metrics × periods grid for the Scoreboard's Table layout. Each cell is
 * actual / target for that window, green when hit, red when missed (once
 * the window has finished). Managers can click a week/month cell to set its
 * total; Rolling 30 windows aren't editable (they overlap calendar periods,
 * so there's no single total to set) and Mindbody-fed metrics never are.
 */
export default function ScoreboardTable({ metrics, view, columns, sumFor, firstDateFor, targetValueFor, rolloverStatsFor, isManager, onSetTotal }) {
  const [editing, setEditing] = useState(null); // `${metricKey}|${start}`
  const [saveError, setSaveError] = useState(null);

  const canEditCell = (metricKey) => isManager && view !== 'rolling30' && !MINDBODY_METRIC_KEYS.has(metricKey);

  const save = async (metricKey, w, value) => {
    setSaveError(null);
    try {
      await onSetTotal(metricKey, w, value);
      setEditing(null);
    } catch (e) {
      setSaveError(e.message);
    }
  };

  return (
    <div>
      {saveError && <p className="text-xs text-red-600 mb-2">Could not save: {saveError}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2 pr-3 text-left font-medium">Metric</th>
              <th className="px-2 py-2 text-right font-medium">Target</th>
              {columns.map((w) => (
                <th key={w.start} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                  {w.shortLabel}
                  {w.inProgress && <span className="block text-[10px] font-normal text-gray-400">in progress</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200/60">
            {metrics.length === 0 && (
              <tr><td colSpan={columns.length + 2} className="py-4 text-center text-gray-400">No metrics tracked yet.</td></tr>
            )}

            {metrics.map((metric) => {
              const target = targetValueFor(metric, view);
              const editable = canEditCell(metric.metricKey);
              return (
                <tr key={metric.metricKey}>
                  <td className="py-2 pr-3 text-gray-900 font-medium">
                    {renderFormatted(metric.label)}
                    {metric.direction === 'at_most' && <span className="ml-1 text-[10px] font-normal text-gray-400">(cap)</span>}
                  </td>
                  <td className="px-2 py-2 text-right text-gray-500 tabular-nums">
                    {target == null ? '—' : fmt(metric.metricKey, target)}
                  </td>
                  {columns.map((w) => {
                    const key = `${metric.metricKey}|${w.start}`;
                    const actual = sumFor(metric.metricKey, w);
                    // Window ended before this metric's first-ever entry:
                    // not tracked yet, so not a miss.
                    const first = firstDateFor[metric.metricKey];
                    const untracked = !first || w.end < first;
                    if (editing === key) {
                      return (
                        <td key={w.start} className="px-2 py-1.5">
                          <EditCell initial={actual} onSave={(v) => save(metric.metricKey, w, v)} onCancel={() => setEditing(null)} />
                        </td>
                      );
                    }
                    return (
                      <td key={w.start} className="px-1 py-1.5 text-right">
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => setEditing(key)}
                          title={editable ? 'Click to correct this total' : undefined}
                          className={`group inline-flex items-center gap-1 rounded px-1.5 py-0.5 tabular-nums font-medium ${untracked ? 'text-gray-300' : cellTone(actual, target, metric.direction, w.inProgress)} ${editable ? 'hover:ring-1 hover:ring-gray-300 cursor-pointer' : 'cursor-default'}`}
                        >
                          {editable && <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60" />}
                          {untracked ? '—' : fmt(metric.metricKey, actual)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {rolloverStatsFor && (
              <tr>
                <td className="py-2 pr-3 text-gray-900 font-medium">
                  Rollover Rate <span className="text-[10px] font-normal text-gray-400">(from onboarding)</span>
                </td>
                <td className="px-2 py-2 text-right text-gray-400">—</td>
                {columns.map((w) => {
                  const s = rolloverStatsFor(w.start, w.end);
                  return (
                    <td key={w.start} className="px-2 py-2 text-right tabular-nums text-gray-700" title={`${s.rollovers} of ${s.decided} rolled over`}>
                      {s.pct == null ? '—' : `${s.pct}%`}
                      {s.decided > 0 && <span className="block text-[10px] text-gray-400">{s.rollovers}/{s.decided}</span>}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-gray-400">
        Green = target hit, red = missed, — = not tracked yet. Targets shown are the current targets.
        {view === 'rolling30' && ' Rolling 30 uses the monthly target (or the weekly target scaled to 30 days).'}
        {isManager && view !== 'rolling30' && ' Managers: click a number to correct that period’s total (Attendance and Revenue come from Mindbody and can’t be edited).'}
      </p>
    </div>
  );
}
