import { useState } from 'react';
import { Plus, Pencil, Trash2, CalendarDays, User, ArrowRightLeft } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useTaskNotes } from '../utils/useTaskNotes.js';
import { PlaybookChip } from '../utils/playbookLink.jsx';
import { TaskNotesToggle, TaskNotesPanel } from './TaskNotes.jsx';
import { TaskForm } from './LinkedTaskList.jsx';

const COLUMNS = [
  { key: 'todo',  label: 'To Do', dot: 'bg-gray-400',    tint: 'bg-gray-50' },
  { key: 'doing', label: 'Doing', dot: 'bg-sky-500',     tint: 'bg-sky-50/60' },
  { key: 'done',  label: 'Done',  dot: 'bg-emerald-500', tint: 'bg-emerald-50/60' },
];

/**
 * Kanban view of a rock's tasks — the same tasks as the list view (pass the
 * same useLinkedTasks() result). Drag a card between columns on desktop, or
 * use its move menu (works on touch). Moving to Done ticks the task off;
 * To Do ↔ Doing sets task_templates.board_status.
 */
export default function RockTaskBoard({ tasks, linked, staff, staffList, isManager, extraFields, defaultDue }) {
  const nameById = Object.fromEntries(staffList.map((s) => [s.id, s.full_name]));
  const taskNotes = useTaskNotes(tasks.map((t) => t.id));
  const [dragId, setDragId]   = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [addingIn, setAddingIn] = useState(null);

  // Ticking needs the assignee/manager; To Do ↔ Doing needs edit rights.
  const canMove = (task, to) => {
    const from = linked.columnFor(task);
    if (from === to) return false;
    // Does this move also change board_status (the To Do / Doing flag)?
    const statusChanges = to !== 'done' && (task.board_status === 'doing') !== (to === 'doing');
    if (statusChanges && !linked.canEdit(task)) return false;
    if ((from === 'done' || to === 'done') && !linked.canToggle(task)) return false;
    return true;
  };

  const drop = (col) => {
    const task = tasks.find((t) => t.id === dragId);
    setDragId(null); setOverCol(null);
    if (task && canMove(task, col)) linked.moveTask(task, col);
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const list = tasks.filter((t) => linked.columnFor(t) === col.key);
        const dragTask = dragId && tasks.find((t) => t.id === dragId);
        const droppable = dragTask && canMove(dragTask, col.key);
        return (
          <div
            key={col.key}
            onDragOver={(e) => { if (droppable) { e.preventDefault(); setOverCol(col.key); } }}
            onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
            onDrop={(e) => { e.preventDefault(); drop(col.key); }}
            className={`flex min-h-[8rem] flex-col rounded-xl p-2 transition-colors ${col.tint} ${
              overCol === col.key ? 'ring-2 ring-emerald-400' : ''
            }`}
          >
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className={`h-2 w-2 rounded-full ${col.dot}`} />
              <span className="text-xs font-semibold text-gray-700">{col.label}</span>
              <span className="text-xs text-gray-400">{list.length}</span>
            </div>

            <div className="flex flex-1 flex-col gap-2">
              {list.map((task) => (
                <BoardCard
                  key={task.id}
                  task={task}
                  column={col.key}
                  linked={linked}
                  canMove={canMove}
                  assigneeName={nameById[task.assigned_staff_id]}
                  staffList={staffList}
                  notes={{ taskNotes, staff, isManager, nameById }}
                  dragging={dragId === task.id}
                  onDragStart={() => setDragId(task.id)}
                  onDragEnd={() => { setDragId(null); setOverCol(null); }}
                />
              ))}
            </div>

            {col.key !== 'done' && (addingIn === col.key ? (
              <div className="rounded-lg bg-white p-2 shadow-sm">
                <TaskForm
                  stacked
                  staffList={staffList}
                  initial={{ label: '', assignee: staff?.id || '', due_date: defaultDue }}
                  submitLabel="Add"
                  onCancel={() => setAddingIn(null)}
                  onSubmit={async (fields) => {
                    const created = await linked.addTask({ ...fields, ...extraFields });
                    if (!created) return;
                    if (col.key === 'doing') await linked.updateTask(created, { board_status: 'doing' });
                    setAddingIn(null);
                  }}
                />
              </div>
            ) : (
              <button
                onClick={() => setAddingIn(col.key)}
                className="mt-2 flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:bg-white hover:text-gray-800"
              >
                <Plus className="h-3.5 w-3.5" /> New task
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function BoardCard({ task, column, linked, canMove, assigneeName, staffList, notes, dragging, onDragStart, onDragEnd }) {
  const [editing, setEditing]     = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  const done = column === 'done';
  const overdue = !done && task.due_date && task.due_date < today;
  const moveTargets = COLUMNS.filter((c) => canMove(task, c.key));
  const draggable = moveTargets.length > 0 && !editing;

  if (editing) {
    return (
      <div className="rounded-lg bg-white p-2 shadow-sm">
        <TaskForm
          stacked
          staffList={staffList}
          initial={{ label: task.label, assignee: task.assigned_staff_id || '', due_date: task.due_date, playbook_page_id: task.playbook_page_id }}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={async ({ label, assignee, due_date, playbook_page_id }) => {
            const saved = await linked.updateTask(task, { label, assigned_staff_id: assignee || null, due_date, playbook_page_id });
            if (saved) setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      className={`group rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm transition ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      } ${dragging ? 'opacity-40' : 'hover:shadow'}`}
    >
      <div className="flex items-start gap-2">
        <p className={`min-w-0 flex-1 text-sm ${done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{task.label}</p>
        {linked.canEdit(task) && (
          <div className="flex shrink-0 gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <button onClick={() => setEditing(true)} title="Edit" className="text-gray-400 hover:text-gray-700"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={() => { if (window.confirm(`Delete "${task.label}"?`)) linked.deleteTask(task.id); }} title="Delete" className="text-gray-400 hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><User className="h-3 w-3" /> {assigneeName || 'Unassigned'}</span>
        {task.due_date && (
          <span className={`flex items-center gap-1 ${overdue ? 'font-medium text-red-600' : ''}`}>
            <CalendarDays className="h-3 w-3" /> {format(parseISO(task.due_date), 'd MMM')}
          </span>
        )}
        <PlaybookChip pageId={task.playbook_page_id} />
        <TaskNotesToggle count={notes.taskNotes.notesFor(task.id).length} open={notesOpen} onClick={() => setNotesOpen((o) => !o)} />
        {moveTargets.length > 0 && (
          <label className="ml-auto flex items-center gap-0.5 text-gray-400 hover:text-gray-700" title="Move to…">
            <ArrowRightLeft className="h-3 w-3" />
            <select
              value=""
              onChange={(e) => e.target.value && linked.moveTask(task, e.target.value)}
              aria-label="Move to column"
              className="cursor-pointer appearance-none bg-transparent text-[11px] focus:outline-none"
            >
              <option value="">Move</option>
              {moveTargets.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
        )}
      </div>
      {notesOpen && (
        <TaskNotesPanel templateId={task.id} taskNotes={notes.taskNotes} staff={notes.staff} isManager={notes.isManager} nameById={notes.nameById} />
      )}
    </div>
  );
}
