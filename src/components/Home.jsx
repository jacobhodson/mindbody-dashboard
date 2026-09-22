import Noticeboard from './Noticeboard.jsx';
import TargetsPanel from './TargetsPanel.jsx';
import TaskChecklist from './TaskChecklist.jsx';
import StaffNeedingXeroMapping from './StaffNeedingXeroMapping.jsx';
import NewClientsToAllocate from './NewClientsToAllocate.jsx';
import PipelineClientsToAllocate from './PipelineClientsToAllocate.jsx';
import MyPipelineTasks from './MyPipelineTasks.jsx';
import MissingRolloverDecisions from './MissingRolloverDecisions.jsx';

export default function Home({
  user, staff, isManager, onViewClient,
  onboardingData, pipelineIds,
  week4Clients, decisions, setDecision,
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">
          Hey {staff?.full_name?.split(' ')[0] || 'there'} 👋
        </h1>
        <p className="text-sm text-gray-500">Here's what's due, and how the week's tracking.</p>
      </div>
      <StaffNeedingXeroMapping isManager={isManager} />
      <NewClientsToAllocate onViewClient={onViewClient} />
      <PipelineClientsToAllocate pipelineIds={pipelineIds} isManager={isManager} onViewClient={onViewClient} />
      <MyPipelineTasks staff={staff} data={onboardingData} decisions={decisions} onViewClient={onViewClient} />
      <MissingRolloverDecisions week4Clients={week4Clients} decisions={decisions} setDecision={setDecision} onViewClient={onViewClient} />
      <Noticeboard staff={staff} isManager={isManager} />
      <TargetsPanel staff={staff} isManager={isManager} />
      <TaskChecklist user={user} staff={staff} isManager={isManager} />
    </div>
  );
}
