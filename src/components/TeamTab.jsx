import { useState } from 'react';
import { format } from 'date-fns';
import { Users, LayoutGrid, UserRound } from 'lucide-react';
import { useAllStaff } from '../utils/useAllStaff.js';
import { useCoachMonthlySnapshots } from '../utils/useCoachMonthlySnapshots.js';
import { useTeamTaskStats } from '../utils/useTeamTaskStats.js';
import TeamByMetric from './TeamByMetric.jsx';
import TeamByCoach from './TeamByCoach.jsx';

const MONTHS = Array.from({ length: 12 }, (_, i) => i);

/**
 * Manager-only Team tab — coach performance in one place: LER, group class
 * performance, PT sessions/value, and individual task completion, all
 * split two ways per the ask ("dive into the coach themselves, or dive
 * into the filter of the task"):
 *   - By Coach (TeamByCoach.jsx): pick one coach, see their whole year
 *   - By Metric (TeamByMetric.jsx): pick one metric, compare every coach
 *     for one month
 *
 * The LER/PT/Group figures read from ler_monthly — a real per-coach-per-
 * month database snapshot (scheduled-coach-snapshot.js populates it daily)
 * rather than a live this-month/last-month-only view, so every month of
 * the current year is independently selectable here. History only starts
 * accumulating from whenever that job first ran — see its own header for
 * why earlier months can't be backfilled. Task completion comes from
 * task_completions directly (useTeamTaskStats.js) since that's already
 * historical on its own, no snapshot needed.
 */
export default function TeamTab({ isManager }) {
  const year = new Date().getFullYear();
  const [mode, setMode] = useState('coach'); // 'coach' | 'metric'
  const [monthIndex, setMonthIndex] = useState(new Date().getMonth());

  const { staffList, loading: staffLoading } = useAllStaff();
  const { rows: snapshotRows, loading: snapshotsLoading } = useCoachMonthlySnapshots(isManager, year);
  const { statsFor, loading: tasksLoading } = useTeamTaskStats(isManager);

  if (!isManager) return null;

  const loading = staffLoading || snapshotsLoading || tasksLoading;

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
          </div>

          <select
            value={monthIndex}
            onChange={(e) => setMonthIndex(Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {MONTHS.map((m) => (
              <option key={m} value={m}>{format(new Date(year, m, 1), 'MMMM yyyy')}</option>
            ))}
          </select>
        </div>
      </div>

      {mode === 'metric' ? (
        <TeamByMetric
          staffList={staffList}
          snapshotRows={snapshotRows}
          statsFor={statsFor}
          year={year}
          monthIndex={monthIndex}
          loading={loading}
        />
      ) : (
        <TeamByCoach
          staffList={staffList}
          snapshotRows={snapshotRows}
          statsFor={statsFor}
          year={year}
          monthIndex={monthIndex}
          loading={loading}
        />
      )}
    </div>
  );
}
