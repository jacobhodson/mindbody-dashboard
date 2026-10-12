import { useState, useMemo, useEffect, useCallback } from 'react';
import { BarChart3, Plus, LayoutGrid, Table2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabaseClient.js';
import { useTargets, groupTargetsByMetric } from '../utils/useTargets.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import { useRolloverStats } from '../utils/useRolloverStats.js';
import { addMetricProgress, setMetricTotal, onMetricActualsChanged } from '../utils/metricActuals.js';
import { SCOREBOARD_VIEWS, scoreboardWindow, scoreboardWindows, targetValueFor } from '../utils/scoreboardPeriods.js';
import MetricTargetCard from './MetricTargetCard.jsx';
import MetricTargetForm from './MetricTargetForm.jsx';
import RolloverRateCard from './RolloverRateCard.jsx';
import ScoreboardTable from './ScoreboardTable.jsx';

const TABLE_COLUMNS = 6;

/**
 * Company-wide KPIs — Attendance and Revenue flow in automatically every
 * night from Mindbody (scheduled-daily-refresh.js); Leads/Sales/Rollovers/
 * Churn/etc are staff-logged the same way Win the Week targets are.
 * Distinguished from WinTheWeek.jsx purely by `department` being null —
 * same underlying targets/metric_actuals, just no department grouping.
 *
 * Follows the Scorecard's date navigator via `anchor` (yyyy-MM-dd: today
 * for the current period, else the selected period's last day), so paging
 * back shows what was actually hit then. Week / Month / Rolling 30 days
 * pick the window; Cards shows that one window, Table shows the last
 * TABLE_COLUMNS windows side by side (managers can correct past totals
 * there — see setMetricTotal).
 *
 * Targets are the current target values — `targets` rows are edited in
 * place, so there's no record of what a target was in a past period.
 */
export default function Scoreboard({ staff, isManager, anchor, defaultView = 'weekly' }) {
  const { targets, loading: targetsLoading, error, saveMetricTargets, archiveMetric } = useTargets(staff);
  const scoreboardTargets = useMemo(() => targets.filter((t) => !t.department), [targets]);
  const metrics = useMemo(() => groupTargetsByMetric(scoreboardTargets), [scoreboardTargets]);
  const { staffList } = useAllStaff();
  const { statsForRange: rolloverStatsFor, loading: rolloverLoading } = useRolloverStats();
  const [adding, setAdding] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [view, setView]     = useState(defaultView);
  const [layout, setLayout] = useState('cards'); // 'cards' | 'table'

  // Follow the Scorecard's Daily/Weekly/Monthly switch.
  useEffect(() => { setView(defaultView); }, [defaultView]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const anchorDate = anchor || today;
  const current = scoreboardWindow(view, anchorDate);
  const columns = useMemo(() => scoreboardWindows(view, anchorDate, TABLE_COLUMNS), [view, anchorDate]);
  const isPast = !current.inProgress;

  // One fetch covering every window either layout might show. No lower
  // bound: the ledger is small (a couple of rows a day), and knowing each
  // metric's first-ever row lets the table show "—" rather than a red 0
  // for periods from before that metric was tracked.
  const metricKeys = metrics.map((m) => m.metricKey);
  const metricKeysKey = metricKeys.join(',');
  const fetchEnd   = columns[columns.length - 1].end;
  const [actuals, setActuals] = useState([]);

  const loadActuals = useCallback(async () => {
    if (!metricKeys.length) { setActuals([]); return; }
    const { data, error: err } = await supabase
      .from('metric_actuals').select('metric_key, metric_date, value, synced_at')
      .in('metric_key', metricKeys).is('staff_id', null)
      .lte('metric_date', fetchEnd);
    if (!err) setActuals(data || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricKeysKey, fetchEnd]);

  useEffect(() => { loadActuals(); }, [loadActuals]);
  useEffect(() => onMetricActualsChanged(loadActuals), [loadActuals]);

  const sumFor = useCallback((metricKey, w) => actuals
    .filter((a) => a.metric_key === metricKey && a.metric_date >= w.start && a.metric_date <= w.end)
    .reduce((sum, r) => sum + Number(r.value), 0), [actuals]);

  const firstDateFor = useMemo(() => {
    const m = {};
    for (const a of actuals) if (!m[a.metric_key] || a.metric_date < m[a.metric_key]) m[a.metric_key] = a.metric_date;
    return m;
  }, [actuals]);

  const lastUpdatedIn = useCallback((metricKey, w) => actuals
    .filter((a) => a.metric_key === metricKey && a.metric_date >= w.start && a.metric_date <= w.end)
    .reduce((latest, r) => (!latest || r.synced_at > latest ? r.synced_at : latest), null), [actuals]);

  // Card "Update metric" adds to the selected window — its last day, or
  // today while it's still in progress.
  const logDate = current.end < today ? current.end : today;
  const logProgress = useCallback(
    (metricKey, delta) => addMetricProgress(metricKey, delta, 'manual', logDate),
    [logDate],
  );

  if (targetsLoading) return null;

  const rolloverCurrent = rolloverStatsFor(current.start, current.end);
  const periodLabel = current.inProgress && view !== 'rolling30'
    ? (view === 'weekly' ? 'This week' : 'This month')
    : current.label;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-gray-900">Scoreboard</h3>
          <span className="text-xs text-gray-500">
            {layout === 'table'
              ? `${columns[0].shortLabel} → ${columns[columns.length - 1].shortLabel}`
              : current.label}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
            {SCOREBOARD_VIEWS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`px-3 py-1 font-medium transition-colors ${
                  view === key ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
            {[{ key: 'cards', label: 'Cards', Icon: LayoutGrid }, { key: 'table', label: 'Table', Icon: Table2 }].map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setLayout(key)}
                title={label}
                className={`flex items-center gap-1 px-2.5 py-1 font-medium transition-colors ${
                  layout === key ? 'bg-gray-800 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
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

      {layout === 'table' ? (
        <ScoreboardTable
          metrics={metrics}
          view={view}
          columns={columns}
          sumFor={sumFor}
          firstDateFor={firstDateFor}
          targetValueFor={targetValueFor}
          rolloverStatsFor={rolloverLoading ? null : rolloverStatsFor}
          isManager={isManager}
          onSetTotal={(metricKey, w, value) => setMetricTotal(metricKey, w.start, w.end, value)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {metrics.length === 0 && !adding && (
            <p className="text-xs text-gray-500">No metrics tracked yet.</p>
          )}

          {!rolloverLoading && (
            <RolloverRateCard
              cadenceLabel={periodLabel}
              rollovers={rolloverCurrent.rollovers}
              decided={rolloverCurrent.decided}
              pct={rolloverCurrent.pct}
            />
          )}

          {metrics.map((metric) => {
            if (editingKey === metric.metricKey) {
              return (
                <div key={metric.metricKey} className="sm:col-span-2 xl:col-span-3">
                  <MetricTargetForm
                    initial={metric}
                    staffList={staffList}
                    onSubmit={saveMetricTargets}
                    onClose={() => setEditingKey(null)}
                  />
                </div>
              );
            }

            // Rolling 30 has no target row of its own — show it through the
            // card's monthly slot with the derived 30-day target.
            const rollingTargetValue = view === 'rolling30' ? targetValueFor(metric, 'rolling30') : null;
            const baseRow = metric.monthlyTarget || metric.weeklyTarget;
            const cardMonthly = view === 'rolling30'
              ? (rollingTargetValue != null && baseRow ? { ...baseRow, cadence: 'monthly', target_value: rollingTargetValue } : null)
              : metric.monthlyTarget;

            return (
              <MetricTargetCard
                key={metric.metricKey}
                metricKey={metric.metricKey}
                label={metric.label}
                weeklyTarget={view === 'rolling30' ? null : metric.weeklyTarget}
                monthlyTarget={cardMonthly}
                direction={metric.direction}
                activeCadence={view === 'rolling30' ? 'monthly' : view}
                periodLabel={periodLabel}
                managerOnlyUpdates={isPast}
                owners={metric.owners}
                staffList={staffList}
                isManager={isManager}
                staff={staff}
                actualFor={(t) => Math.round(sumFor(t.metric_key, current) * 100) / 100}
                lastUpdatedFor={(t) => lastUpdatedIn(t.metric_key, current)}
                onLog={logProgress}
                onEdit={() => setEditingKey(metric.metricKey)}
                onArchive={() => archiveMetric(metric.metricKey)}
              />
            );
          })}
        </div>
      )}

      {isManager && adding && (
        <div className="mt-2.5">
          <MetricTargetForm
            staffList={staffList}
            onSubmit={saveMetricTargets}
            onClose={() => setAdding(false)}
          />
        </div>
      )}
    </div>
  );
}
