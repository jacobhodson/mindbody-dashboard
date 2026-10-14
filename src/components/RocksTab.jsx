import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, Mountain, MessageSquare } from 'lucide-react';
import { format, parseISO, addDays, formatDistanceToNow } from 'date-fns';
import { useRocks, canEditRock } from '../utils/useRocks.js';
import { useLinkedTasks } from '../utils/useLinkedTasks.js';
import { useRockNotes } from '../utils/useRockNotes.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import { ROCK_STATUSES, ROCK_STATUS_BY_KEY, ROCK_STAGES, ROCK_STAGE_LABEL } from '../utils/rocks.js';
import { renderFormatted } from '../utils/richText.js';
import RichTextField from './RichTextField.jsx';
import LinkedTaskList from './LinkedTaskList.jsx';

const inputClass = 'w-full rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';
const ACTIVE_ORDER = ['doing', 'ongoing', 'planned', 'on_hold'];

/**
 * Rocks — the company's bigger projects (replaces the Notion ROCKS database).
 * Each rock has an owner, status, Craft Cycle stage, on/off-track flag and
 * deadline; tasks inside it are regular dashboard tasks (they also appear in
 * the assignee's Home checklist), plus a running notes log anyone can add to.
 */
export default function RocksTab({ staff, isManager }) {
  const { rocks, loading, error, createRock, updateRock, deleteRock } = useRocks();
  const { staffList } = useAllStaff();
  const rockIds = useMemo(() => rocks.map((r) => r.id), [rocks]);
  const linked = useLinkedTasks('rock_id', rockIds, staff, isManager);
  const [filter, setFilter]     = useState('active'); // 'active' | 'mine' | 'done'
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId]     = useState(null);

  const tasksByRock = useMemo(() => {
    const m = {};
    for (const t of linked.tasks) (m[t.rock_id] ||= []).push(t);
    return m;
  }, [linked.tasks]);

  const visible = useMemo(() => {
    if (filter === 'done') return rocks.filter((r) => r.status === 'done');
    const active = rocks.filter((r) => r.status !== 'done');
    if (filter === 'mine') {
      return active.filter((r) => r.owner_staff_id === staff?.id
        || (tasksByRock[r.id] || []).some((t) => t.assigned_staff_id === staff?.id));
    }
    return active;
  }, [rocks, filter, staff, tasksByRock]);

  const groups = useMemo(() => {
    if (filter === 'done') return [{ key: 'done', rocks: visible }];
    return ACTIVE_ORDER
      .map((key) => ({ key, rocks: visible.filter((r) => r.status === key) }))
      .filter((g) => g.rocks.length);
  }, [visible, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Rocks</h1>
          <p className="text-sm text-gray-500">
            Our bigger projects. Anyone can add tasks and notes to a rock; tasks also show up in the
            assignee's Home checklist.
          </p>
        </div>
        {isManager && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" /> New rock
          </button>
        )}
      </div>

      {creating && (
        <NewRockForm
          staffList={staffList}
          onCancel={() => setCreating(false)}
          onSubmit={async (fields) => {
            const created = await createRock(fields);
            if (created) { setCreating(false); setOpenId(created.id); }
          }}
        />
      )}

      <div className="flex gap-1 self-start rounded-lg border border-gray-200 bg-white p-1 w-fit">
        {[['active', 'Active'], ['mine', 'Mine'], ['done', 'Done']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === key ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {(error || linked.error) && <p className="text-xs text-red-600">{error || linked.error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-gray-500">
          {filter === 'mine' ? "You don't own or have tasks on any active rocks." : 'No rocks here yet.'}
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {ROCK_STATUS_BY_KEY[g.key].label} <span className="font-normal">· {g.rocks.length}</span>
            </h2>
            {g.rocks.map((rock) => (
              <RockCard
                key={rock.id}
                rock={rock}
                tasks={tasksByRock[rock.id] || []}
                linked={linked}
                staff={staff}
                staffList={staffList}
                isManager={isManager}
                open={openId === rock.id}
                onToggleOpen={() => setOpenId((id) => (id === rock.id ? null : rock.id))}
                onUpdate={(patch) => updateRock(rock.id, patch)}
                onDelete={async () => {
                  if (window.confirm(`Delete the rock "${rock.title}" and all its tasks and notes?`)) await deleteRock(rock.id);
                }}
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

export function rockProgress(tasks, completionFor) {
  const done = tasks.filter((t) => completionFor(t)).length;
  return { done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

function RockCard({ rock, tasks, linked, staff, staffList, isManager, open, onToggleOpen, onUpdate, onDelete }) {
  const owner = staffList.find((s) => s.id === rock.owner_staff_id);
  const progress = rockProgress(tasks, linked.completionFor);
  const status = ROCK_STATUS_BY_KEY[rock.status];
  const today = format(new Date(), 'yyyy-MM-dd');
  const late = rock.status !== 'done' && rock.due_date && rock.due_date < today;

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button onClick={onToggleOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
        <span
          title={rock.on_track ? 'On track' : 'Off track'}
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${rock.on_track ? 'bg-emerald-500' : 'bg-red-500'}`}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{rock.title}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-gray-500">
            <span>{owner?.full_name || 'No owner'}</span>
            {rock.due_date && (
              <span className={late ? 'font-medium text-red-600' : ''}>
                Due {format(parseISO(rock.due_date), 'd MMM yyyy')}
              </span>
            )}
            {rock.stage && <span>· {ROCK_STAGE_LABEL[rock.stage]}</span>}
          </p>
        </div>
        <div className="hidden w-32 shrink-0 sm:block">
          <div className="h-1.5 rounded-full bg-gray-100">
            <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${progress.pct}%` }} />
          </div>
          <p className="mt-1 text-right text-[11px] text-gray-500">{progress.done}/{progress.total} tasks</p>
        </div>
        <span className={`w-16 shrink-0 rounded-full border py-0.5 text-center text-[11px] font-medium ${status.badge}`}>{status.label}</span>
      </button>
      {open && (
        <RockDetail
          rock={rock}
          tasks={tasks}
          linked={linked}
          staff={staff}
          staffList={staffList}
          isManager={isManager}
          canEdit={canEditRock(rock, staff, isManager)}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

function RockDetail({ rock, tasks, linked, staff, staffList, isManager, canEdit, onUpdate, onDelete }) {
  const [description, setDescription] = useState(rock.description || '');
  const [editingDescription, setEditingDescription] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  // New tasks default to the rock's deadline, or a week out if that's passed/unset.
  const defaultDue = rock.due_date && rock.due_date >= today ? rock.due_date : format(addDays(new Date(), 7), 'yyyy-MM-dd');

  const selectClass = 'rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-70';

  return (
    <div className="space-y-5 border-t border-gray-100 px-4 py-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label="Status">
          <select disabled={!canEdit} value={rock.status} onChange={(e) => onUpdate({ status: e.target.value })} className={selectClass}>
            {ROCK_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Stage">
          <select disabled={!canEdit} value={rock.stage || ''} onChange={(e) => onUpdate({ stage: e.target.value || null })} className={selectClass}>
            <option value="">—</option>
            {ROCK_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Track">
          <select disabled={!canEdit} value={rock.on_track ? 'on' : 'off'} onChange={(e) => onUpdate({ on_track: e.target.value === 'on' })} className={selectClass}>
            <option value="on">On track</option>
            <option value="off">Off track</option>
          </select>
        </Field>
        <Field label="Owner">
          <select disabled={!isManager} value={rock.owner_staff_id || ''} onChange={(e) => onUpdate({ owner_staff_id: e.target.value || null })} className={selectClass}>
            <option value="">No owner</option>
            {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </Field>
        <Field label="Deadline">
          <input type="date" disabled={!canEdit} value={rock.due_date || ''} onChange={(e) => onUpdate({ due_date: e.target.value || null })} className={selectClass} />
        </Field>
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">What "done" looks like</h3>
        {editingDescription ? (
          <div>
            <RichTextField value={description} onChange={setDescription} multiline autoFocus />
            <div className="mt-1.5 flex gap-2">
              <button
                onClick={async () => { await onUpdate({ description: description.trim() || null }); setEditingDescription(false); }}
                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
              >
                Save
              </button>
              <button onClick={() => { setDescription(rock.description || ''); setEditingDescription(false); }} className="rounded-lg px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100">
                Cancel
              </button>
            </div>
          </div>
        ) : rock.description ? (
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {renderFormatted(rock.description)}
            {canEdit && <button onClick={() => setEditingDescription(true)} className="ml-2 text-xs text-emerald-700 hover:underline">Edit</button>}
          </p>
        ) : canEdit ? (
          <button onClick={() => setEditingDescription(true)} className="text-xs text-emerald-700 hover:underline">Add a measurable "done" definition</button>
        ) : (
          <p className="text-xs text-gray-400">Not set.</p>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Tasks</h3>
        <LinkedTaskList
          tasks={tasks}
          linked={linked}
          staff={staff}
          staffList={staffList}
          isManager={isManager}
          extraFields={{ rock_id: rock.id }}
          defaultDue={defaultDue}
          emptyText="No tasks on this rock yet."
        />
      </div>

      <RockNotes rockId={rock.id} staff={staff} staffList={staffList} isManager={isManager} />

      {isManager && (
        <div className="flex justify-end border-t border-gray-100 pt-3">
          <button onClick={onDelete} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" /> Delete rock
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-medium text-gray-500">
      {label}
      {children}
    </label>
  );
}

function RockNotes({ rockId, staff, staffList, isManager }) {
  const { notes, loading, error, addNote, removeNote } = useRockNotes(rockId);
  const [draft, setDraft] = useState('');
  const [busy, setBusy]   = useState(false);
  const nameById = Object.fromEntries(staffList.map((s) => [s.id, s.full_name]));

  const submit = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    const added = await addNote(draft);
    setBusy(false);
    if (added) setDraft('');
  };

  return (
    <div>
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <MessageSquare className="h-3.5 w-3.5" /> Notes
      </h3>
      <RichTextField value={draft} onChange={setDraft} placeholder="Add an update…" multiline />
      <div className="mt-1.5 flex justify-end">
        <button
          onClick={submit}
          disabled={busy || !draft.trim()}
          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          Add note
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!loading && notes.length > 0 && (
        <ul className="mt-2 space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="group rounded-lg bg-gray-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                <span>
                  <span className="font-medium text-gray-700">{nameById[n.staff_id] || 'Someone'}</span>
                  {' · '}{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </span>
                {(isManager || n.staff_id === staff?.id) && (
                  <button onClick={() => removeNote(n.id)} title="Delete note" className="text-gray-400 opacity-0 hover:text-red-600 group-hover:opacity-100">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-800">{renderFormatted(n.body)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewRockForm({ staffList, onSubmit, onCancel }) {
  const [title, setTitle]   = useState('');
  const [owner, setOwner]   = useState('');
  const [status, setStatus] = useState('planned');
  const [due, setDue]       = useState('');
  const [busy, setBusy]     = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    await onSubmit({ title: title.trim(), owner_staff_id: owner || null, status, due_date: due || null });
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Mountain className="h-4 w-4" /> New rock</h3>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rock name" aria-label="Rock name" className={inputClass} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-gray-500">Owner
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className={inputClass}>
            <option value="">No owner</option>
            {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            {ROCK_STATUSES.filter((s) => s.key !== 'done').map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">Deadline
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputClass} />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !title.trim()} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
          Create rock
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100">Cancel</button>
      </div>
    </form>
  );
}
