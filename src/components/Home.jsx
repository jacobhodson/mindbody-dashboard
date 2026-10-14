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
import HomeAutomationsPanel from './HomeAutomationsPanel.jsx';
import { useReminders } from '../utils/useReminders.js';
import { useAllClients } from '../utils/useAllClients.js';

export default function Home({
  user, staff, isManager, onViewClient,
  onboardingData, pipelineIds,
  week4Clients, decisions, setDecision,
}) {
  const rem = useReminders();
  const { clientsList } = useAllClients();
  const [tasksVersion, setTasksVersion] = useState(0); // remounts the checklist after a task goes Active/Draft
  // A built-in card waits for its setting so a Draft card doesn't flash up.
  const on = (key) => !rem.loading && rem.cardActive(key);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">
          Hey {staff?.full_name?.split(' ')[0] || 'there'} 👋
        </h1>
        <p className="text-sm text-gray-500">Here's what's due, and how the week's tracking.</p>
      </div>
      <HomeReminders
        rem={rem} clients={clientsList} pipelineIds={pipelineIds}
        staff={staff} isManager={isManager} onViewClient={onViewClient}
      />
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
