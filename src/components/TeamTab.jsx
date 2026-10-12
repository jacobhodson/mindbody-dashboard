import { useState } from 'react';
import { Users, LayoutGrid, UserRound, Wallet, CalendarDays, Dumbbell, Contact } from 'lucide-react';
import { useAllStaff } from '../utils/useAllStaff.js';
import { useCoachMonthlySnapshots } from '../utils/useCoachMonthlySnapshots.js';
import { useCoachRolling30 } from '../utils/useCoachRolling30.js';
import { useTeamTaskStats } from '../utils/useTeamTaskStats.js';
import { monthKeyFor, monthOptions } from '../utils/snapshotPeriods.js';
import TeamByMetric from './TeamByMetric.jsx';
import TeamByCoach from './TeamByCoach.jsx';
import TeamWages from './TeamWages.jsx';
import GroupPerformanceTable from './GroupPerformanceTable.jsx';
import CoachPerformanceTable from './CoachPerformanceTable.jsx';
import ClientCaseload from './ClientCaseload.jsx';

/**
 * Manager-only Team tab — coach performance in one place: LER, group class
 * performance, PT sessions/value, and individual task completion, split two
 * ways ("dive into the coach themselves, or dive into the filter of the
 * task"):
 *   - By Coach (TeamByCoach.jsx): pick one coach, see their whole year
 *   - By Metric (TeamByMetric.jsx): pick one metric, compare every coach —
 *     year average, last-3-months average and every month in one table
 *   - Group Classes (GroupPerformanceTable.jsx): live group-class $ value and
 *     session counts per coach for this/last week and month (moved here from
 *     the Finances tab, 2026-10-13)
 *   - PT Sessions (CoachPerformanceTable.jsx): signed-off PT/semi-private
 *     $ value and session counts per coach (moved here from the Personal
 *     Training tab, 2026-10-13 — fed by the same mb-pt-analytics data)
 *   - Client Caseload (ClientCaseload.jsx): active clients assigned to each
 *     coach on the Clients tab
 *   - Wages (TeamWages.jsx): the wage LER uses per coach per month, with
 *     manual per-month overrides, plus each coach's Xero mapping and standing
 *     wage (moved here from the Finances tab's LER table, 2026-10-13)
 *
 * By Coach's period is a calendar month (ler_monthly — a real per-coach-per-
 * month snapshot, every month of the year, wage overrides applied); By Metric
 * also shows a Rolling 30 Days column (coach_rolling30, refreshed nightly).
 * Both tables are written by scheduled-coach-snapshot.js. Task completion
 * comes from task_completions directly (useTeamTaskStats.js) for the same
 * date range — it's already historical on its own, no snapshot needed.
 */
export default function TeamTab({ isManager, currentStaffId, ptData, ptLoading, ptError, pipelineIds, onViewClient }) {
  const year = new Date().getFullYear();
  const [mode, setMode]     = useState('coach'); // 'coach' | 'metric' | 'group' | 'pt' | 'caseload' | 'wages'
  const [period, setPeriod] = useState(monthKeyFor(new Date())); // 'm:yyyy-MM' (By Coach's month)

  const { staffList, loading: staffLoading, reload: reloadStaff } = useAllStaff();
  const { rows: monthlyRows, loading: monthlyLoading, reload: reloadMonthly } = useCoachMonthlySnapshots(isManager, year);
  const { latest: rollingLatest, loading: rollingLoading, reload: reloadRolling } = useCoachRolling30(isManager);
  const { statsFor, loading: tasksLoading } = useTeamTaskStats(isManager);

  if (!isManager) return null;

  const loading = staffLoading || monthlyLoading || rollingLoading || tasksLoading;
  const shared = { staffList, monthlyRows, rollingLatest, statsFor, period, year, loading };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600" /> Team
          </h1>
          <p className="text-sm text-gray-500">Coach performance — LER, group classes, PT sessions, and task completion.</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex flex-wrap rounded-lg border border-gray-300 overflow-hidden text-xs">
            <button
              onClick={() => setMode('coach')}
              className={`flex items-center gap-1 px-3 py-1.5 font-medium transition-colors ${
                mode === 'coach' ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <UserRound className="h-3.5 w-3.5" /> By Coach
            </button>
            <button
              onClick={() => setMode('metric')}
              className={`flex items-center gap-1 px-3 py-1.5 font-medium transition-colors ${
                mode === 'metric' ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> By Metric
            </button>
            <button
              onClick={() => setMode('group')}
              className={`flex items-center gap-1 px-3 py-1.5 font-medium transition-colors ${
                mode === 'group' ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Group Classes
            </button>
            <button
              onClick={() => setMode('pt')}
              className={`flex items-center gap-1 px-3 py-1.5 font-medium transition-colors ${
                mode === 'pt' ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Dumbbell className="h-3.5 w-3.5" /> PT Sessions
            </button>
            <button
              onClick={() => setMode('caseload')}
              className={`flex items-center gap-1 px-3 py-1.5 font-medium transition-colors ${
                mode === 'caseload' ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Contact className="h-3.5 w-3.5" /> Client Caseload
            </button>
            <button
              onClick={() => setMode('wages')}
              className={`flex items-center gap-1 px-3 py-1.5 font-medium transition-colors ${
                mode === 'wages' ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Wallet className="h-3.5 w-3.5" /> Wages
            </button>
          </div>

          {/* By Metric and Wages show every month at once, Group Classes / PT Sessions have their own period tabs, and Caseload is a live count, so only By Coach needs a period */}
          {mode === 'coach' && (
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {monthOptions(year).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          )}
        </div>
      </div>

      {mode === 'metric' && <TeamByMetric {...shared} />}
      {mode === 'coach' && <TeamByCoach {...shared} />}
      {mode === 'group' && <GroupPerformanceTable isManager={isManager} />}
      {mode === 'pt' && <CoachPerformanceTable data={ptData} loading={ptLoading} error={ptError} isManager={isManager} />}
      {mode === 'caseload' && <ClientCaseload staffList={staffList} pipelineIds={pipelineIds} onViewClient={onViewClient} />}
      {mode === 'wages' && (
        <TeamWages
          {...shared}
          isManager={isManager}
          currentStaffId={currentStaffId}
          reloadStaff={reloadStaff}
          reloadMonthly={reloadMonthly}
          reloadRolling={reloadRolling}
        />
      )}
    </div>
  );
}
