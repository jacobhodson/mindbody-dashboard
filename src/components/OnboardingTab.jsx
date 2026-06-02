import { RefreshCw, Users2, AlertTriangle } from 'lucide-react';
import OnboardingBoard from './OnboardingBoard.jsx';
import OnboardingReds  from './OnboardingReds.jsx';
import { useOnboardingTasks } from '../utils/useOnboardingTasks.js';

function StatPill({ label, value, color = 'text-gray-300' }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 text-center">
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function OnboardingTab({ data, loading, error, contactLog }) {
  const { isComplete, toggleTask } = useOnboardingTasks();

  const summary      = data?.summary    || {};
  const pipelineReds = data?.pipelineReds || [];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-800" />
          ))}
        </div>
        <div className="flex gap-4 overflow-x-auto">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="shrink-0 w-72 h-64 animate-pulse rounded-xl bg-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
        <p className="text-sm text-red-400">Could not load onboarding data: {error}</p>
      </div>
    );
  }

  const isEmpty = !data || (
    (data.week1?.length || 0) +
    (data.week2?.length || 0) +
    (data.week3?.length || 0) +
    (data.week4?.length || 0) === 0
  );

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatPill label="In pipeline"  value={summary.total      ?? 0} color="text-white" />
        <StatPill label="At risk"      value={summary.atRisk     ?? 0} color={summary.atRisk > 0 ? 'text-red-400' : 'text-gray-300'} />
        <StatPill label="Week 1"       value={summary.week1Count ?? 0} color="text-blue-400" />
        <StatPill label="Week 2"       value={summary.week2Count ?? 0} color="text-amber-400" />
        <StatPill label="Week 3"       value={summary.week3Count ?? 0} color="text-violet-400" />
        <StatPill label="Week 4"       value={summary.week4Count ?? 0} color="text-emerald-400" />
      </div>

      {/* Pipeline reds */}
      {pipelineReds.length > 0 && (
        <OnboardingReds clients={pipelineReds} contactLog={contactLog} />
      )}

      {/* Kanban board */}
      {isEmpty ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 py-20 text-center">
          <Users2 className="h-10 w-10 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">No active onboarding clients</p>
          <p className="text-xs text-gray-600 mt-1">
            Clients appear here when they purchase a 3-Session Pass, 14-Day Pass,<br />
            4-Week Kickstarter, Strong Dad or Strong Mum Transformation.
          </p>
        </div>
      ) : (
        <OnboardingBoard data={data} isComplete={isComplete} toggleTask={toggleTask} />
      )}
    </div>
  );
}
