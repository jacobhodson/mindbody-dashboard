import { useMemo } from 'react';
import { ListChecks } from 'lucide-react';
import { useAllClients } from '../utils/useAllClients.js';
import { useOnboardingTaskTemplates } from '../utils/useOnboardingTaskTemplates.js';
import { useOnboardingTasks } from '../utils/useOnboardingTasks.js';

// Short-program products get removed from the pipeline on no-rollover —
// same rule OnboardingTab.jsx applies to the kanban board.
const SHORT_PRODUCTS = new Set(['3-Session', '14-Day']);

const WEEK_CLASS = {
  1: 'text-blue-600 border-blue-500/20 bg-blue-500/5',
  2: 'text-amber-600 border-amber-500/20 bg-amber-500/5',
  3: 'text-violet-600 border-violet-500/20 bg-violet-500/5',
  4: 'text-emerald-600 border-emerald-500/20 bg-emerald-500/5',
};

// Home-page personal reminder: this coach's own caseload (assigned_staff_id
// — Group Program clients are deliberately excluded, they're nobody's
// individual reminder) who are currently in the onboarding pipeline, and
// what's left to do for each one's *current* week — a shorter, action-first
// slice of the same data OnboardingTab.jsx's kanban shows. Both managers and
// coaches get this, scoped to their own assignments only (not the whole
// team), per the ask.
//
// Checking a task off here writes to the same onboarding_task_completions
// table via the same useOnboardingTasks() hook OnboardingCard.jsx uses, so
// it's already ticked there next time that tab is opened, and vice versa.
export default function MyPipelineTasks({ staff, data, decisions, onViewClient }) {
  const { clientsList } = useAllClients();
  const { templates: taskTemplates, tasksByWeek } = useOnboardingTaskTemplates();
  const { isComplete, toggleTask } = useOnboardingTasks(staff, taskTemplates);

  const myClients = useMemo(() => {
    if (!staff || !data) return [];
    const myMindbodyIds = new Set(
      clientsList.filter((c) => c.assigned_staff_id === staff.id).map((c) => c.mindbody_id)
    );
    if (myMindbodyIds.size === 0) return [];

    const all = [...(data.week1 || []), ...(data.week2 || []), ...(data.week3 || []), ...(data.week4 || [])];
    return all
      .filter((c) => myMindbodyIds.has(c.id))
      .filter((c) => decisions[c.id]?.decision !== 'removed')
      .filter((c) => {
        if (!SHORT_PRODUCTS.has(c.shortProduct)) return true;
        return decisions[c.id]?.decision !== 'no-rollover';
      })
      .sort((a, b) => a.week - b.week || (a.name || '').localeCompare(b.name || ''));
  }, [staff, data, decisions, clientsList]);

  if (myClients.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-1">
        <ListChecks className="h-4 w-4 text-gray-700" />
        <h2 className="font-semibold text-gray-900">My Pipeline This Week</h2>
        <span className="rounded-full border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
          {myClients.length}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-4">Your onboarding clients, and what's left for their current week.</p>

      <div className="space-y-3">
        {myClients.map((client) => {
          const weekTasks = tasksByWeek?.[client.week] || [];
          const doneCount = weekTasks.filter((t) => isComplete(client.id, t.id)).length;
          const weekClass = WEEK_CLASS[client.week] || 'text-gray-600 border-gray-300 bg-gray-100';
          return (
            <div key={client.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <button onClick={() => onViewClient?.(client.id)} className="text-left min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate hover:underline">{client.name || 'Unknown'}</p>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${weekClass}`}>
                    Week {client.week}
                  </span>
                  {weekTasks.length > 0 && (
                    <span className="text-[10px] text-gray-400 tabular-nums">{doneCount}/{weekTasks.length}</span>
                  )}
                </div>
              </div>

              {weekTasks.length === 0 ? (
                <p className="text-xs text-gray-400">No tasks set for this week</p>
              ) : (
                <div className="space-y-1">
                  {weekTasks.map((task) => {
                    const done = isComplete(client.id, task.id);
                    return (
                      <label key={task.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() => toggleTask(client.id, task.id)}
                          className="h-3.5 w-3.5 shrink-0 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className={`text-xs leading-snug ${done ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                          {task.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
