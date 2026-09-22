import { useMemo, useState } from 'react';
import { Check, User, Users, Plus, X, ArrowRight, Pencil, Trash2, CalendarDays, Target } from 'lucide-react';
import { useTeamTasks, resolveAssignmentFields } from '../utils/useTeamTasks.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import { useAllClients } from '../utils/useAllClients.js';
import { useTargets, groupTargetsByMetric } from '../utils/useTargets.js';
import { renderFormatted } from '../utils/richText.js';
import { dueDateFor } from '../utils/periods.js';
import { format, parseISO } from 'date-fns';
import RichTextField from './RichTextField.jsx';
import AddProgress from './AddProgress.jsx';

const CADENCE_LABEL = { daily: 'Today', weekly: 'This week', monthly: 'This month', once: 'One-off tasks' };
const CADENCE_ORDER = ['daily', 'weekly', 'monthly', 'once'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// A client's full name, resolved against a typed name via useAllClients — used
// by both ContactLogForm and TaskForm's <datalist>-backed client pickers so a
// typed name (matched against Mindbody's roster mirror) resolves to a real
// clients.id for linkage, while still degrading gracefully to a free-text
// name if nothing matches (existing contact-log behaviour, unchanged).
function useClientNameLookup() {
  const { clientsList } = useAllClients();
  const byName = useMemo(() => {
    const m = {};
    for (const c of clientsList) {
      const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
      if (name) m[name] = c.id;
    }
    return m;
  }, [clientsList]);
  return { clientsList, resolve: (name) => byName[name] || null };
}

function ContactLogForm({ onSubmit, onCancel }) {
  const [clientName, setClientName] = useState('');
  const [note, setNote]             = useState('');
  const [busy, setBusy]              = useState(false);
  const { clientsList, resolve }     = useClientNameLookup();

  const submit = async (e) => {
    e.preventDefault();
    if (!clientName.trim()) return;
    setBusy(true);
    await onSubmit({ clientName: clientName.trim(), note: note.trim(), clientId: resolve(clientName.trim()) });
    setBusy(false);
    setClientName('');
    setNote('');
  };

  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-center">
      <input
        type="text"
        required
        list="client-name-options"
        placeholder="Client name"
        value={clientName}
        onChange={(e) => setClientName(e.target.value)}
        className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <datalist id="client-name-options">
        {clientsList.map((c) => (
          <option key={c.id} value={`${c.first_name || ''} ${c.last_name || ''}`.trim()} />
        ))}
      </datalist>
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

// Where a task's assignment currently stands, in the shape TaskForm edits.
function assignStateFor(template) {
  if (template.scope === 'team') return { assignMode: 'team', assignee: '' };
  if (template.assigned_staff_id) return { assignMode: 'assigned', assignee: template.assigned_staff_id };
  return { assignMode: 'personal', assignee: '' };
}

// Shared by "Create task" and each row's "Edit" — same fields either way,
// just pre-filled from `initial` and a different submit label when editing.
function TaskForm({ initial, isManager, staff, onSubmit, onClose, submitLabel = 'Add task' }) {
  const [label, setLabel]             = useState(initial?.label || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [cadence, setCadence]         = useState(initial?.cadence || 'daily');
  const [taskType, setTaskType]       = useState(initial?.task_type || 'checkbox');
  const [assignMode, setAssignMode]   = useState(initial?.assignMode || 'personal');
  const [assignee, setAssignee]       = useState(initial?.assignee || '');
  const [dueDate, setDueDate]         = useState(initial?.due_date || '');
  const [dueDay, setDueDay]           = useState(initial?.due_day || '');
  const [clientName, setClientName]   = useState(initial?.clientName || '');
  const [linkedTargetId, setLinkedTargetId] = useState(initial?.linked_target_id || '');
  const [targetType, setTargetType]   = useState(initial?.target_type || 'boolean');
  const [targetValue, setTargetValue] = useState(initial?.target_type === 'count' ? initial.target_value : '');
  const [unit, setUnit]               = useState(initial?.unit || '');
  const [busy, setBusy]               = useState(false);
  const { staffList } = useAllStaff();
  const { clientsList, resolve: resolveClientId } = useClientNameLookup();
  const { targets } = useTargets(staff);
  // One option per metric (not per weekly/monthly row) — covers both Win
  // the Week and Scoreboard metrics, since completing a task should count
  // toward whichever cadence(s) that metric currently tracks.
  const linkableMetrics = groupTargetsByMetric(targets).map((m) => ({
    id: (m.weeklyTarget || m.monthlyTarget).id,
    label: m.label,
    metric_key: m.metricKey,
  }));

  const submit = async (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    if (assignMode === 'assigned' && !assignee) return;
    if (cadence === 'once' && !dueDate) return;
    if (targetType === 'count' && !targetValue) return;
    setBusy(true);
    const linkedTarget = linkableMetrics.find((t) => t.id === linkedTargetId);
    await onSubmit({
      label: label.trim(),
      description: description.trim(),
      cadence,
      task_type: taskType,
      target_type: targetType,
      target_value: targetType === 'count' ? Number(targetValue) : 1,
      unit: targetType === 'count' ? (unit.trim() || null) : null,
      isManager,
      assignMode,
      assignee: assignMode === 'assigned' ? assignee : null,
      due_date: cadence === 'once' ? dueDate : null,
      due_day: (cadence === 'weekly' || cadence === 'monthly') && dueDay ? Number(dueDay) : null,
      client_id: clientName.trim() ? resolveClientId(clientName.trim()) : null,
      linked_target_id: linkedTarget?.id || null,
      linked_metric_key: linkedTarget?.metric_key || null,
    });
    setBusy(false);
    onClose();
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{initial ? 'Edit task' : 'New task'}</h3>
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
      <RichTextField value={description} onChange={setDescription} placeholder="Notes (optional)" multiline />
      <div className="flex flex-wrap gap-3 text-sm">
        <select value={cadence} onChange={(e) => { setCadence(e.target.value); setDueDay(''); }} className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-gray-900">
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="once">Once-off</option>
        </select>
        {cadence === 'once' && (
          <input
            type="date"
            required
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-gray-900"
          />
        )}
        {cadence === 'weekly' && (
          <select value={dueDay} onChange={(e) => setDueDay(e.target.value)} className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-gray-900">
            <option value="">Due end of week</option>
            {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>Due {d}</option>)}
          </select>
        )}
        {cadence === 'monthly' && (
          <select value={dueDay} onChange={(e) => setDueDay(e.target.value)} className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-gray-900">
            <option value="">Due end of month</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Due day {d}</option>)}
          </select>
        )}
        <select value={taskType} onChange={(e) => setTaskType(e.target.value)} className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-gray-900">
          <option value="checkbox">Checkbox</option>
          <option value="contact_log">Client contact log</option>
        </select>
        <select value={targetType} onChange={(e) => setTargetType(e.target.value)} className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-gray-900">
          <option value="boolean">Done / not done</option>
          <option value="count">Log a number (e.g. Sales Dials)</option>
        </select>
        {targetType === 'count' && (
          <>
            <input
              type="number"
              required
              min="1"
              placeholder="Target (e.g. 100)"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="w-32 rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-gray-900"
            />
            <input
              type="text"
              placeholder="Unit (optional, e.g. dials)"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-40 rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-gray-900 placeholder-gray-400"
            />
          </>
        )}
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
        <input
          type="text"
          list="task-form-client-options"
          placeholder="Link to client (optional)"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-gray-900 placeholder-gray-400"
        />
        <datalist id="task-form-client-options">
          {clientsList.map((c) => (
            <option key={c.id} value={`${c.first_name || ''} ${c.last_name || ''}`.trim()} />
          ))}
        </datalist>
        {isManager && (
          <select
            value={linkedTargetId}
            onChange={(e) => setLinkedTargetId(e.target.value)}
            className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-gray-900"
          >
            <option value="">Count toward target… (optional)</option>
            {linkableMetrics.map((t) => (
              <option key={t.id} value={t.id}>{t.label || t.metric_key}</option>
            ))}
          </select>
        )}
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
      >
        {submitLabel}
      </button>
    </form>
  );
}

function TaskRow({ template, completion, onToggle, onLogCount, onLogContact, onUpdate, onDelete, assignedName, isManager, staff, canEdit, linkedClientName, linkedTargetLabel }) {
  const isCount = template.target_type === 'count';
  const countValue = completion?.value ?? 0;
  const done = isCount ? countValue >= template.target_value : Boolean(completion);
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="py-3">
        <TaskForm
          initial={{
            label: template.label,
            description: template.description || '',
            cadence: template.cadence,
            task_type: template.task_type,
            due_date: template.due_date || '',
            due_day: template.due_day || '',
            clientName: linkedClientName || '',
            linked_target_id: template.linked_target_id || '',
            target_type: template.target_type,
            target_value: template.target_value,
            unit: template.unit || '',
            ...assignStateFor(template),
          }}
          isManager={isManager}
          staff={staff}
          submitLabel="Save"
          onClose={() => setEditing(false)}
          onSubmit={async (fields) => onUpdate(template, fields)}
        />
      </li>
    );
  }

  const dueDate = dueDateFor(template);

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        {isCount ? (
          <div
            aria-hidden="true"
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
              done ? 'border-emerald-500 bg-emerald-500/20 text-emerald-600' : 'border-gray-400 text-transparent'
            }`}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </div>
        ) : (
          <button
            onClick={() => (template.task_type === 'contact_log' ? setLogging((v) => !v) : onToggle(template))}
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
            {isCount && (
              <span className={`text-[10px] font-medium tabular-nums ${done ? 'text-emerald-600' : 'text-gray-500'}`}>
                {countValue} / {template.target_value} {template.unit || ''}
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
            {linkedClientName && (
              <span className="flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                {linkedClientName}
              </span>
            )}
            {linkedTargetLabel && (
              <span className="flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700" title="Completing this adds to the linked Win the Week target">
                <Target className="h-2.5 w-2.5" /> {linkedTargetLabel}
              </span>
            )}
            {dueDate && (
              <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                <CalendarDays className="h-3 w-3" /> Due {format(parseISO(dueDate), 'EEE d MMM')}
              </span>
            )}
          </div>
          {template.description && (
            <p className="text-xs text-gray-500 mt-0.5">{renderFormatted(template.description)}</p>
          )}
          {isCount && (
            <div className="mt-1.5 max-w-xs">
              <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${template.target_value > 0 ? Math.min(100, Math.round((countValue / template.target_value) * 100)) : 0}%` }}
                />
              </div>
              <div className="mt-1">
                <AddProgress label="Log progress" onAdd={(n) => onLogCount(template, n)} />
              </div>
            </div>
          )}
          {template.task_type === 'contact_log' && logging && (
            <ContactLogForm
              onSubmit={async (payload) => { await onLogContact(template, payload); setLogging(false); }}
              onCancel={() => setLogging(false)}
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canEdit && (
            <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-gray-700">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {isManager && (
            <button
              onClick={() => { if (window.confirm(`Delete "${template.label}"? This can't be undone.`)) onDelete(template); }}
              className="text-gray-400 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function TaskChecklist({ user, staff, isManager }) {
  const { templates, loading, error, toggle, completionFor, logCount, logContactTask, createTask, updateTask, deleteTask } = useTeamTasks(user, staff);
  const [showCreate, setShowCreate] = useState(false);
  // Managers only — non-managers' `templates` is already scoped to just
  // their own + team tasks by RLS (see useTeamTasks.js), so this toggle
  // would have nothing to filter for them. Managers, on the other hand,
  // can read every individual's personal tasks (is_manager() is one of the
  // RLS `select` conditions on task_templates) and used to always see them
  // all mixed together with no way to tell whose was whose — defaulting to
  // 'mine' keeps the home page focused on what THIS manager owes, with an
  // explicit "Full team" switch for the standup-style check-in view.
  const [viewScope, setViewScope] = useState('mine'); // 'mine' | 'team'
  const { staffList } = useAllStaff();
  const { clientsList } = useAllClients();
  const { targets } = useTargets(staff);

  const staffNameById = useMemo(() => {
    const m = {};
    for (const s of staffList) m[s.id] = s.full_name;
    return m;
  }, [staffList]);

  const clientNameById = useMemo(() => {
    const m = {};
    for (const c of clientsList) m[c.id] = `${c.first_name || ''} ${c.last_name || ''}`.trim();
    return m;
  }, [clientsList]);

  const targetLabelById = useMemo(() => {
    const m = {};
    for (const t of targets) m[t.id] = t.label || t.metric_key;
    return m;
  }, [targets]);

  // What this list actually shows — everyone (non-managers, always, via
  // RLS) sees team-scope tasks plus whatever's theirs (owned or assigned);
  // a manager viewing 'team' sees every template RLS hands them, unfiltered.
  const visibleTemplates = useMemo(() => {
    if (isManager && viewScope === 'team') return templates;
    return templates.filter((t) => t.scope === 'team' || t.owner_staff_id === staff?.id || t.assigned_staff_id === staff?.id);
  }, [templates, isManager, viewScope, staff]);

  const grouped = useMemo(() => {
    const g = { daily: [], weekly: [], monthly: [], once: [] };
    for (const t of visibleTemplates) g[t.cadence]?.push(t);
    g.once.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
    return g;
  }, [visibleTemplates]);

  const handleUpdate = async (template, fields) => {
    await updateTask(template.id, {
      label: fields.label,
      description: fields.description || null,
      cadence: fields.cadence,
      task_type: fields.task_type,
      target_type: fields.target_type,
      target_value: fields.target_value,
      unit: fields.unit || null,
      due_date: fields.cadence === 'once' ? fields.due_date : null,
      due_day: (fields.cadence === 'weekly' || fields.cadence === 'monthly') ? fields.due_day : null,
      client_id: fields.client_id || null,
      linked_target_id: fields.linked_target_id || null,
      linked_metric_key: fields.linked_metric_key || null,
      ...resolveAssignmentFields({ isManager, assignMode: fields.assignMode, assignee: fields.assignee, staffId: staff.id }),
    });
  };

  const handleDelete = async (template) => { await deleteTask(template.id); };

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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Tasks</h2>
          <p className="text-xs text-gray-500">
            {isManager && viewScope === 'team'
              ? "The whole team's tasks — check off what's done."
              : "Check off what you've done — it's logged automatically."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isManager && (
            <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
              <button
                onClick={() => setViewScope('mine')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewScope === 'mine' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <User className="h-3.5 w-3.5" /> My tasks
              </button>
              <button
                onClick={() => setViewScope('team')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewScope === 'team' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Users className="h-3.5 w-3.5" /> Full team
              </button>
            </div>
          )}
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
      </div>

      {showCreate && (
        <TaskForm isManager={isManager} staff={staff} onSubmit={createTask} onClose={() => setShowCreate(false)} />
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
                  onLogCount={logCount}
                  onLogContact={logContactTask}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  isManager={isManager}
                  staff={staff}
                  canEdit={isManager || template.owner_staff_id === staff?.id}
                  assignedName={
                    isManager && template.assigned_staff_id && template.assigned_staff_id !== staff?.id
                      ? staffNameById[template.assigned_staff_id]
                      : null
                  }
                  linkedClientName={template.client_id ? clientNameById[template.client_id] : null}
                  linkedTargetLabel={template.linked_target_id ? targetLabelById[template.linked_target_id] : null}
                />
              ))}
            </ul>
          </div>
        );
      })}

      {visibleTemplates.length === 0 && (
        <p className="text-sm text-gray-500">
          {isManager && viewScope === 'mine' && templates.length > 0
            ? 'Nothing just for you right now — switch to "Full team" to see everyone\'s tasks.'
            : 'No tasks yet — create one above, or a manager can add some in the Supabase Table Editor (task_templates).'}
        </p>
      )}
    </div>
  );
}
