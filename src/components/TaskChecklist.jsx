import { useMemo, useState } from 'react';
import { Check, User, Users, Plus, X, ArrowRight } from 'lucide-react';
import { useTeamTasks } from '../utils/useTeamTasks.js';
import { useAllStaff } from '../utils/useAllStaff.js';

const CADENCE_LABEL = { daily: 'Today', weekly: 'This week', monthly: 'This month' };
const CADENCE_ORDER = ['daily', 'weekly', 'monthly'];

function ContactLogForm({ onSubmit, onCancel }) {
  const [clientName, setClientName] = useState('');
  const [note, setNote]             = useState('');
  const [busy, setBusy]              = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!clientName.trim()) return;
    setBusy(true);
    await onSubmit({ clientName: clientName.trim(), note: note.trim() });
    setBusy(false);
    setClientName('');
    setNote('');
  };

  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-center">
      <input
        type="text"
        required
        placeholder="Client name"
        value={clientName}
        onChange={(e) => setClientName(e.target.value)}
        className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <input
        type="text"
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <div className="flex gap-1.5 shrink-0">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
        >
          Log
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function TaskRow({ template, completion, onToggle, onLogContact, assignedName }) {
  const done = Boolean(completion);
  const [logging, setLogging] = useState(false);

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        {template.task_type === 'contact_log' ? (
          <button
            onClick={() => setLogging((v) => !v)}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
              done
                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-600'
                : 'border-gray-400 text-transparent hover:border-gray-600'
            }`}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </button>
        ) : (
          <button
            onClick={() => onToggle(template)}
            aria-pressed={done}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
              done
                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-600'
                : 'border-gray-400 text-transparent hover:border-gray-600'
            }`}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
              {template.label}
            </span>
            {template.scope === 'team' ? (
              <Users className="h-3.5 w-3.5 text-gray-400" title="Team task" />
            ) : (
              <User className="h-3.5 w-3.5 text-gray-400" title="Individual task" />
            )}
            {template.target_type === 'count' && (
              <span className="text-[10px] text-gray-500">
                target: {template.target_value} {template.unit || ''}
              </span>
            )}
            {template.task_type === 'contact_log' && (
              <span className="text-[10px] text-gray-500">client contact</span>
            )}
            {assignedName && (
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-700">
                <ArrowRight className="h-3 w-3" /> {assignedName}
              </span>
            )}
          </div>
          {template.description && (
            <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
          )}
          {template.task_type === 'contact_log' && logging && (
            <ContactLogForm
              onSubmit={async (payload) => { await onLogContact(template, payload); setLogging(false); }}
              onCancel={() => setLogging(false)}
            />
          )}
        </div>
      </div>
    </li>
  );
}

function CreateTaskForm({ isManager, staff, onCreate, onClose }) {
  const [label, setLabel]           = useState('');
  const [description, setDescription] = useState('');
  const [cadence, setCadence]       = useState('daily');
  const [taskType, setTaskType]     = useState('checkbox');
  const [assignMode, setAssignMode] = useState('personal'); // personal | team | assigned
  const [assignee, setAssignee]     = useState('');
  const [busy, setBusy]             = useState(false);
  const { staffList } = useAllStaff();

  const submit = async (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    if (assignMode === 'assigned' && !assignee) return;
    setBusy(true);
    await onCreate({
      label: label.trim(),
      description: description.trim(),
      cadence,
      task_type: taskType,
      scope: isManager && assignMode === 'team' ? 'team' : 'individual',
      isManager,
      assignedStaffId: assignMode === 'assigned' ? assignee : null,
    });
    setBusy(false);
    onClose();
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">New task</h3>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700">
          <X className="h-4 w-4" />
        </button>
      </div>
      <input
        type="text"
        required
        placeholder="What needs doing?"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <input
        type="text"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <div className="flex flex-wrap gap-3 text-sm">
        <select value={cadence} onChange={(e) => setCadence(e.target.value)} className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-gray-900">
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <select value={taskType} onChange={(e) => setTaskType(e.target.value)} className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-gray-900">
          <option value="checkbox">Checkbox</option>
          <option value="contact_log">Client contact log</option>
        </select>
        {isManager && (
          <select value={assignMode} onChange={(e) => setAssignMode(e.target.value)} className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-gray-900">
            <option value="personal">Just for me</option>
            <option value="team">Team task (shared)</option>
            <option value="assigned">Assign to…</option>
          </select>
        )}
        {isManager && assignMode === 'assigned' && (
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-gray-900">
            <option value="">Choose a person…</option>
            {staffList.filter((s) => s.id !== staff?.id).map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        )}
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
      >
        Add task
      </button>
    </form>
  );
}

export default function TaskChecklist({ user, staff, isManager }) {
  const { templates, loading, error, toggle, completionFor, logContactTask, createTask } = useTeamTasks(user, staff);
  const [showCreate, setShowCreate] = useState(false);
  const { staffList } = useAllStaff();

  const staffNameById = useMemo(() => {
    const m = {};
    for (const s of staffList) m[s.id] = s.full_name;
    return m;
  }, [staffList]);

  const grouped = useMemo(() => {
    const g = { daily: [], weekly: [], monthly: [] };
    for (const t of templates) g[t.cadence]?.push(t);
    return g;
  }, [templates]);

  if (loading) {
    return <p className="text-sm text-gray-500">Loading your tasks…</p>;
  }

  if (!staff) {
    return (
      <p className="text-sm text-red-600">
        Signed in, but no staff record found for this account yet — ask a manager to check Supabase.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Tasks</h2>
          <p className="text-xs text-gray-500">Check off what you've done — it's logged automatically.</p>
        </div>
        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Create task
          </button>
        )}
      </div>

      {showCreate && (
        <CreateTaskForm isManager={isManager} staff={staff} onCreate={createTask} onClose={() => setShowCreate(false)} />
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {CADENCE_ORDER.map((cadence) => {
        const list = grouped[cadence];
        if (!list.length) return null;
        return (
          <div key={cadence} className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-800">{CADENCE_LABEL[cadence]}</h3>
            </div>
            <ul className="divide-y divide-gray-200 px-4">
              {list.map((template) => (
                <TaskRow
                  key={template.id}
                  template={template}
                  completion={completionFor(template)}
                  onToggle={toggle}
                  onLogContact={logContactTask}
                  assignedName={
                    isManager && template.assigned_staff_id && template.assigned_staff_id !== staff?.id
                      ? staffNameById[template.assigned_staff_id]
                      : null
                  }
                />
              ))}
            </ul>
          </div>
        );
      })}

      {templates.length === 0 && (
        <p className="text-sm text-gray-500">
          No tasks yet — create one above, or a manager can add some in the Supabase Table Editor (task_templates).
        </p>
      )}
    </div>
  );
}
