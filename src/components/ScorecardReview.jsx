import { useState, useEffect, useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { supabase } from '../lib/supabaseClient.js';
import { useTargets, groupTargetsByMetric } from '../utils/useTargets.js';
import { useRolloverStats } from '../utils/useRolloverStats.js';
import { periodEndFor } from '../utils/periods.js';
import { scoreboardWindow, targetValueFor } from '../utils/scoreboardPeriods.js';
import { AUTO_METRIC_SOURCES } from '../utils/autoMetrics.js';
import { renderFormatted } from '../utils/richText.js';

export const ROLLOVER_KEY = 'rollover_rate';
export const DEFAULT_ROLLOVER_TARGET = 80;

const STATUS = {
  on:   { label: 'On track',  className: 'bg-emerald-50 text-emerald-700' },
  off:  { label: 'Off track', className: 'bg-red-50 text-red-700' },
  none: { label: 'No data',   className: 'bg-gray-100 text-gray-500' },
};

const fmt = (metricKey, n) => (metricKey === 'revenue'
  ? `$${Math.round(n).toLocaleString()}`
  : Math.round(n).toLocaleString());

/**
 * The monthly meeting's scorecard: every Scoreboard metric over the rolling 30
 * days against its target, nothing to enter. The window ends yesterday (syncs
 * run nightly, so today is always partial), or on the last day of the month
 * when looking back at an earlier meeting. Targets are the current ones, as on
 * the Scoreboard. Off-track metrics get a discussion list underneath; one
 * stays listed if it has notes, even once the window moves it back on track.
 */
export default function ScorecardReview({ staff, meetingDate, config, hasDiscussion, renderDiscussion }) {
  const { targets, loading: targetsLoading } = useTargets(staff);
  const { statsForRange, loading: rolloverLoading } = useRolloverStats();
  const [actuals, setActuals] = useState(null);

  const hidden = config?.hidden_metrics || [];
  const rolloverTarget = config?.rollover_target ?? DEFAULT_ROLLOVER_TARGET;

  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const monthEnd = periodEndFor('monthly', meetingDate);
  const win = scoreboardWindow('rolling30', monthEnd < yesterday ? monthEnd : yesterday);

  const metrics = useMemo(
    () => groupTargetsByMetric(targets.filter((t) => !t.department)).filter((m) => !hidden.includes(m.metricKey)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targets, hidden.join(',')],
  );
  const metricKeysKey = metrics.map((m) => m.metricKey).join(',');

  useEffect(() => {
    if (targetsLoading) return undefined;
    if (!metricKeysKey) { setActuals([]); return undefined; }
    let cancelled = false;
    // No lower bound: a metric's first-ever row tells "not tracked yet" from a real 0.
    supabase
      .from('metric_actuals').select('metric_key, metric_date, value')
      .in('metric_key', metricKeysKey.split(',')).is('staff_id', null)
      .lte('metric_date', win.end)
      .then(({ data, error }) => { if (!cancelled) setActuals(error ? [] : data || []); });
    return () => { cancelled = true; };
  }, [metricKeysKey, targetsLoading, win.end]);

  if (targetsLoading || rolloverLoading || actuals === null) {
    return <p className="text-xs text-gray-500">Loading…</p>;
  }

  const rows = metrics.map((m) => {
    const list = actuals.filter((a) => a.metric_key === m.metricKey);
    const target = targetValueFor(m, 'rolling30');
    const actual = list.filter((a) => a.metric_date >= win.start).reduce((sum, a) => sum + Number(a.value), 0);
    const tracked = list.length > 0;
    let status = 'none';
    if (tracked && target != null) {
      status = (m.direction === 'at_most' ? actual <= target : actual >= target) ? 'on' : 'off';
    }
    return {
      key: m.metricKey,
      label: renderFormatted(m.label),
      source: AUTO_METRIC_SOURCES[m.metricKey] || 'Logged by the team',
      targetText: target == null ? '—' : `${m.direction === 'at_most' ? 'Max ' : ''}${fmt(m.metricKey, target)}`,
      actualText: tracked ? fmt(m.metricKey, actual) : '—',
      status,
    };
  });

  if (!hidden.includes(ROLLOVER_KEY)) {
    const s = statsForRange(win.start, win.end);
    rows.push({
      key: ROLLOVER_KEY,
      label: 'Rollover Rate',
      source: 'Onboarding',
      targetText: `${rolloverTarget}%`,
      actualText: s.pct == null ? '—' : `${s.pct}% (${s.rollovers}/${s.decided})`,
      status: s.pct == null ? 'none' : s.pct >= rolloverTarget ? 'on' : 'off',
    });
  }

  const offCount = rows.filter((r) => r.status === 'off').length;
  const toDiscuss = rows.filter((r) => r.status === 'off' || hasDiscussion(r.key));

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        {win.label} · {offCount === 0 ? 'everything on track' : `${offCount} off track`}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
              <th className="pb-2 font-medium">Metric</th>
              <th className="pb-2 text-right font-medium">Target</th>
              <th className="pb-2 text-right font-medium">Last 30 days</th>
              <th className="pb-2 pl-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-2 pr-3">
                  <span className="text-gray-900">{r.label}</span>
                  <span className="block text-[11px] text-gray-400">{r.source}</span>
                </td>
                <td className="py-2 text-right tabular-nums text-gray-500">{r.targetText}</td>
                <td className="py-2 text-right font-medium tabular-nums text-gray-900">{r.actualText}</td>
                <td className="py-2 pl-4">
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[r.status].className}`}>
                    {STATUS[r.status].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="text-xs text-gray-500">No metrics to show.</p>}
      {toDiscuss.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-700">To discuss</h4>
          {toDiscuss.map((r) => (
            <div key={r.key} className="rounded-lg border border-red-100 bg-red-50/40 p-3">
              <h5 className="mb-1.5 text-xs font-semibold text-gray-800">
                {r.label}: {r.actualText} against {r.targetText}
              </h5>
              {renderDiscussion(r.key)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
