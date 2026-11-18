import { useState } from 'react';
import Noticeboard from './Noticeboard.jsx';
import TargetsPanel from './TargetsPanel.jsx';
import TaskChecklist from './TaskChecklist.jsx';
import StaffNeedingXeroMapping from './StaffNeedingXeroMapping.jsx';
import NewClientsToAllocate from './NewClientsToAllocate.jsx';
import PipelineClientsToAllocate from './PipelineClientsToAllocate.jsx';
import MyPipelineTasks from './MyPipelineTasks.jsx';
import MissingRolloverDecisions from './MissingRolloverDecisions.jsx';
import HomeReminders from './HomeReminders.jsx';
import LeaveApprovalsCard from './hr/LeaveApprovalsCard.jsx';
import TerminationReviewCard from './TerminationReviewCard.jsx';
import MyLeaveCard from './hr/MyLeaveCard.jsx';
import HomeAutomationsPanel from './HomeAutomationsPanel.jsx';
import DebitAdjustmentForm from './admin/DebitAdjustmentForm.jsx';
import DebitAdjustmentsCard from './admin/DebitAdjustmentsCard.jsx';
import { CalendarClock } from 'lucide-react';
import { useReminders } from '../utils/useReminders.js';
import { useAllClients } from '../utils/useAllClients.js';

export default function Home({
  user, staff, isManager, onViewClient,
  onboardingData, pipelineIds,
  week4Clients, decisions, setDecision, onOpenHR, onOpenAdmin,
}) {
  const [debitFormOpen, setDebitFormOpen] = useState(false);
  const [debitVersion, setDebitVersion] = useState(0); // refreshes the office-admin card after a submit
  const rem = useReminders();
  const { clientsList } = useAllClients();
  const [tasksVersion, setTasksVersion] = useState(0); // remounts the checklist after a task goes Active/Draft
  // A built-in card waits for its setting so a Draft card doesn't flash up.
  const on = (key) => !rem.loading && rem.cardActive(key);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            Hey {staff?.full_name?.split(' ')[0] || 'there'} 👋
          </h1>
          <p className="text-sm text-gray-500">Here's what's due, and how the week's tracking.</p>
        </div>
        <button
          onClick={() => setDebitFormOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <CalendarClock className="h-4 w-4 text-violet-600" /> Debit adjustment
        </button>
      </div>
      {debitFormOpen && (
        <DebitAdjustmentForm
          clients={clientsList}
          onSubmitted={() => setDebitVersion((v) => v + 1)}
          onClose={() => setDebitFormOpen(false)}
        />
      )}
      <DebitAdjustmentsCard refreshKey={debitVersion} enabled={!!staff?.is_office_admin} onOpenAdmin={onOpenAdmin} />
      <HomeReminders
        rem={rem} clients={clientsList} pipelineIds={pipelineIds}
        staff={staff} isManager={isManager} onViewClient={onViewClient}
      />
      {isManager && on('leave_approvals') && <LeaveApprovalsCard isManager={isManager} onOpenHR={onOpenHR} />}
      {isManager && on('termination_review') && <TerminationReviewCard isManager={isManager} onViewClient={onViewClient} />}
      {on('my_leave') && <MyLeaveCard staff={staff} onOpenHR={onOpenHR} />}
      {on('xero_mapping') && <StaffNeedingXeroMapping isManager={isManager} />}
      {on('new_clients') && <NewClientsToAllocate onViewClient={onViewClient} />}
      {on('pipeline_clients') && <PipelineClientsToAllocate pipelineIds={pipelineIds} isManager={isManager} onViewClient={onViewClient} />}
      {on('my_pipeline') && <MyPipelineTasks staff={staff} data={onboardingData} decisions={decisions} onViewClient={onViewClient} />}
      {on('missing_rollovers') && <MissingRolloverDecisions week4Clients={week4Clients} decisions={decisions} setDecision={setDecision} onViewClient={onViewClient} />}
      <Noticeboard staff={staff} isManager={isManager} />
      <TargetsPanel staff={staff} isManager={isManager} />
      <TaskChecklist key={tasksVersion} user={user} staff={staff} isManager={isManager} />
      {isManager && (
        <HomeAutomationsPanel
          rem={rem} clients={clientsList} pipelineIds={pipelineIds}
          onTasksChanged={() => setTasksVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}
