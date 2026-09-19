import { useState } from 'react';
import OnboardingCard      from './OnboardingCard.jsx';
import OnboardingTaskModal from './OnboardingTaskModal.jsx';

const WEEK_META = [
  { week: 1, label: 'Week 1', sub: 'Their 1st week',   color: 'text-blue-600',   border: 'border-blue-500/20',   bg: 'bg-blue-500/5'    },
  { week: 2, label: 'Week 2', sub: 'Their 2nd week',   color: 'text-amber-600',  border: 'border-amber-500/20',  bg: 'bg-amber-500/5'   },
  { week: 3, label: 'Week 3', sub: 'Their 3rd week',   color: 'text-violet-600', border: 'border-violet-500/20', bg: 'bg-violet-500/5'  },
  { week: 4, label: 'Week 4', sub: 'Their 4th week',   color: 'text-emerald-600',border: 'border-emerald-500/20',bg: 'bg-emerald-500/5' },
];

export default function OnboardingBoard({
  data,
  isComplete,
  toggleTask,
  contactLog,
  getDecision,
  setDecision,
  tasksByWeek,
  assignmentByMindbodyId,
  staffNameById,
  staffList,
  isManager,
  updateCaseload,
  onSetStartDate,
  onDropToWeek,
}) {
  const [activeTask, setActiveTask] = useState(null);
  const [dragOverWeek, setDragOverWeek] = useState(null);

  const clients = {
    1: data?.week1 || [],
    2: data?.week2 || [],
    3: data?.week3 || [],
    4: data?.week4 || [],
  };

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {WEEK_META.map(({ week, label, sub, color, border, bg }) => {
          const cols = clients[week];
          return (
            <div
              key={week}
              onDragOver={(e) => { e.preventDefault(); setDragOverWeek(week); }}
              onDragLeave={() => setDragOverWeek((w) => (w === week ? null : w))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverWeek(null);
                const clientId = e.dataTransfer.getData('text/plain');
                if (clientId) onDropToWeek?.(clientId, week);
              }}
              className={`flex flex-col shrink-0 rounded-xl border ${border} ${bg} w-72 sm:w-80 xl:flex-1 xl:min-w-64 transition-shadow ${
                dragOverWeek === week ? 'ring-2 ring-offset-1 ring-emerald-500' : ''
              }`}
            >
              {/* Column header */}
              <div className={`flex items-center justify-between px-4 py-3 border-b ${border}`}>
                <div>
                  <p className={`text-sm font-semibold ${color}`}>{label}</p>
                  <p className="text-[11px] text-gray-400">{sub}</p>
                </div>
                <span className={`rounded-full border ${border} px-2 py-0.5 text-xs font-bold ${color}`}>
                  {cols.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2.5 p-3 overflow-y-auto max-h-[70vh]">
                {cols.length === 0 ? (
                  <p className="py-8 text-center text-xs text-gray-300">Drag a client here, or no clients this week</p>
                ) : (
                  cols.map((client) => (
                    <OnboardingCard
                      key={client.id}
                      client={client}
                      isComplete={isComplete}
                      toggleTask={toggleTask}
                      onOpenTask={setActiveTask}
                      contactLog={contactLog}
                      getDecision={getDecision}
                      setDecision={setDecision}
                      tasksByWeek={tasksByWeek}
                      assignment={assignmentByMindbodyId?.[client.id]}
                      staffNameById={staffNameById}
                      staffList={staffList}
                      isManager={isManager}
                      updateCaseload={updateCaseload}
                      onSetStartDate={onSetStartDate}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {activeTask && (
        <OnboardingTaskModal task={activeTask} onClose={() => setActiveTask(null)} />
      )}
    </>
  );
}
