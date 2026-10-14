import { useState } from 'react';
import { Check, Plus, Pencil, Trash2, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useTaskNotes } from '../utils/useTaskNotes.js';
import { TaskNotesToggle, TaskNotesPanel } from './TaskNotes.jsx';
import { PlaybookChip, PlaybookPicker } from '../utils/playbookLink.jsx';

const inputClass = 'rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';

/**
 * Task rows + "add task" form for rock tasks and meeting to-dos. Pass the
 * relevant slice of useLinkedTasks() in; `extraFields` is merged into every
 * new task (e.g. { rock_id } or { meeting_id }). `sourceLabel(task)` adds a
 * small grey tag per row (e.g. which rock a meeting to-do belongs to).
 */
export default function LinkedTaskList({
  tasks, linked, staff, staffList, isManager, extraFields = {}, defaultDue,
  emptyText = 'No tasks yet.', addLabel = 'Add task', sourceLabel, canAdd = true,
}) {
  const [adding, setAdding] = useState(false);
  const nameById = Object.fromEntries(staffList.map((s) => [s.id, s.full_name]));
  const taskNotes = useTaskNotes(tasks.map((t) => t.id));

  return (
    <div>
      {tasks.length === 0 && !adding && <p className="text-xs text-gray-500">{emptyText}</p>}
      <ul className="divide-y divide-gray-100">
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            done={!!linked.completionFor(t)}
            canToggle={linked.canToggle(t)}
            canEdit={linked.canEdit(t)}
            assigneeName={nameById[t.assigned_staff_id]}
            source={sourceLabel?.(t)}
            staffList={staffList}
            notes={{ taskNotes, staff, isManager, nameById }}
            onToggle={() => linked.toggle(t)}
            onUpdate={(patch) => linked.updateTask(t, patch)}
            onDelete={() => { if (window.confirm(`Delete "${t.label}"?`)) linked.deleteTask(t.id); }}
          />
        ))}
      </ul>
      {canAdd && (adding ? (
        <TaskForm
          staff={staff}
          staffList={staffList}
          initial={{ label: '', assignee: staff?.id || '', due_date: defaultDue }}
          submitLabel="Add"
          onCancel={() => setAdding(false)}
          onSubmit={async (fields) => {
            const created = await linked.addTask({ ...fields, ...extraFields });
            if (created) setAdding(false);
          }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-500/10"
        >
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </button>
      ))}
    </div>
  );
}

function TaskRow({ task, done, canToggle, canEdit, assigneeName, source, staffList, notes, onToggle, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  const overdue = !done && task.due_date && task.due_date < today;

  if (editing) {
    return (
      <li className="py-2">
        <TaskForm
          staffList={staffList}
          initial={{ label: task.label, assignee: task.assigned_staff_id || '', due_date: task.due_date, playbook_page_id: task.playbook_page_id }}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={async ({ label, assignee, due_date, playbook_page_id }) => {
            const saved = await onUpdate({ label, assigned_staff_id: assignee || null, due_date, playbook_page_id });
            if (saved) setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-2.5 py-2">
      <button
        onClick={onToggle}
        disabled={!canToggle}
        title={canToggle ? (done ? 'Mark not done' : 'Mark done') : 'Only the assignee or a manager can tick this off'}
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300 bg-white hover:border-emerald-500'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {done && <Check className="h-3 w-3" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{task.label}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
          {!done && task.board_status === 'doing' && <span className="rounded bg-sky-50 px-1.5 py-0.5 font-medium text-sky-700">Doing</span>}
          <span>{assigneeName || 'Unassigned'}</span>
          {task.due_date && (
            <span className={overdue ? 'font-medium text-red-600' : ''}>
              Due {format(parseISO(task.due_date), 'd MMM yyyy')}{overdue ? ' · overdue' : ''}
            </span>
          )}
          {source && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{source}</span>}
          <PlaybookChip pageId={task.playbook_page_id} />
          <TaskNotesToggle
            count={notes.taskNotes.notesFor(task.id).length}
            open={notesOpen}
            onClick={() => setNotesOpen((o) => !o)}
          />
        </div>
        {notesOpen && (
          <TaskNotesPanel
            templateId={task.id}
            taskNotes={notes.taskNotes}
            staff={notes.staff}
            isManager={notes.isManager}
            nameById={notes.nameById}
          />
        )}
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button onClick={() => setEditing(true)} title="Edit" className="text-gray-400 hover:text-gray-700">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} title="Delete" className="text-gray-400 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}

export function TaskForm({ staffList, initial, submitLabel, onSubmit, onCancel, stacked = false }) {
  const [label, setLabel]       = useState(initial.label);
  const [assignee, setAssignee] = useState(initial.assignee);
  const [dueDate, setDueDate]   = useState(initial.due_date || '');
  const [playbookPageId, setPlaybookPageId] = useState(initial.playbook_page_id || null);
  const [busy, setBusy]         = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!label.trim() || !dueDate) return;
    setBusy(true);
    await onSubmit({ label: label.trim(), assignee, due_date: dueDate, playbook_page_id: playbookPageId });
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className={`mt-2 flex flex-col gap-1.5 ${stacked ? '' : 'sm:flex-row sm:items-center'}`}>
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="What needs doing?"
        aria-label="Task"
        className={`${inputClass} min-w-0 flex-1`}
      />
      <select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee" className={inputClass}>
        <option value="">Unassigned</option>
        {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
      </select>
      <input
        type="date"
        required
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        aria-label="Due date"
        className={inputClass}
      />
      <PlaybookPicker value={playbookPageId} onChange={setPlaybookPageId} className={`${inputClass} ${stacked ? '' : 'sm:max-w-[10rem]'}`} />
      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={busy || !label.trim() || !dueDate}
          className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </form>
  );
}
