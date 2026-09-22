import { useState } from 'react';
import { Users, LayoutGrid, UserRound, Wallet } from 'lucide-react';
import { useAllStaff } from '../utils/useAllStaff.js';
import { useCoachMonthlySnapshots } from '../utils/useCoachMonthlySnapshots.js';
import { useCoachRolling30 } from '../utils/useCoachRolling30.js';
import { useTeamTaskStats } from '../utils/useTeamTaskStats.js';
import { monthKeyFor, monthOptions } from '../utils/snapshotPeriods.js';
import TeamByMetric from './TeamByMetric.jsx';
import TeamByCoach from './TeamByCoach.jsx';
import TeamWages from './TeamWages.jsx';

/**
 * Manager-only Team tab — coach performance in one place: LER, group class
 * performance, PT sessions/value, and individual task completion, split two
 * ways ("dive into the coach themselves, or dive into the filter of the
 * task"):
 *   - By Coach (TeamByCoach.jsx): pick one coach, see their whole year
 *   - By Metric (TeamByMetric.jsx): pick one metric, compare every coach —
 *     year average, last-3-months average and every month in one table
 *   - Wages (TeamWages.jsx): the wage LER uses per coach per month, with
 *     manual per-month overrides that feed LER here and on Finance
 *
 * By Coach's period is a calendar month (ler_monthly — a real per-coach-per-
 * month snapshot, every month of the year, wage overrides applied); By Metric
 * also shows a Rolling 30 Days column (coach_rolling30, refreshed nightly).
 * Both tables are written by scheduled-coach-snapshot.js. Task completion
 * comes from task_completions directly (useTeamTaskStats.js) for the same
 * date range — it's already historical on its own, no snapshot needed.
 */
export default function TeamTab({ isManager }) {
  const year = new Date().getFullYear();
  const [mode, setMode]     = useState('coach'); // 'coach' | 'metric' | 'wages'
  const [period, setPeriod] = useState(monthKeyFor(new Date())); // 'm:yyyy-MM' (By Coach's month)

  const { staffList, loading: staffLoading } = useAllStaff();
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
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
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
              onClick={() => setMode('wages')}
              className={`flex items-center gap-1 px-3 py-1.5 font-medium transition-colors ${
                mode === 'wages' ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Wallet className="h-3.5 w-3.5" /> Wages
            </button>
          </div>

          {/* By Metric and Wages show every month at once, so only By Coach needs a period */}
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
      {mode === 'wages' && (
        <TeamWages {...shared} isManager={isManager} reloadMonthly={reloadMonthly} reloadRolling={reloadRolling} />
      )}
    </div>
  );
}
