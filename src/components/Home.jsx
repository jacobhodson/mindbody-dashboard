import Noticeboard from './Noticeboard.jsx';
import TargetsPanel from './TargetsPanel.jsx';
import TaskChecklist from './TaskChecklist.jsx';
import NewClientsToAllocate from './NewClientsToAllocate.jsx';
import MissingRolloverDecisions from './MissingRolloverDecisions.jsx';

export default function Home({ user, staff, isManager, onViewClient, week4Clients, decisions, setDecision }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">
          Hey {staff?.full_name?.split(' ')[0] || 'there'} 👋
        </h1>
        <p className="text-sm text-gray-500">Here's what's due, and how the week's tracking.</p>
      </div>
      <NewClientsToAllocate onViewClient={onViewClient} />
      <MissingRolloverDecisions week4Clients={week4Clients} decisions={decisions} setDecision={setDecision} onViewClient={onViewClient} />
      <Noticeboard staff={staff} isManager={isManager} />
      <TargetsPanel staff={staff} isManager={isManager} />
      <TaskChecklist user={user} staff={staff} isManager={isManager} />
    </div>
  );
}
