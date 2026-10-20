import { useState, useMemo, useRef, useEffect } from 'react';
import {
  ChevronDown, ChevronRight, ChevronLeft, Plus, Trash2, MessageSquare, ImagePlus, Loader2, X,
  CalendarDays, User, CheckCircle2, List, Columns3,
} from 'lucide-react';
import { format, parseISO, addDays, formatDistanceToNow } from 'date-fns';
import { useRocks, canEditRock, uploadRockCover } from '../utils/useRocks.js';
import { useLinkedTasks } from '../utils/useLinkedTasks.js';
import { useRockNotes } from '../utils/useRockNotes.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import {
  ROCK_STATUSES, ROCK_STATUS_BY_KEY, ROCK_GRADIENTS, gradientClassFor,
} from '../utils/rocks.js';
import { renderFormatted } from '../utils/richText.js';
import RichTextField from './RichTextField.jsx';
import LinkedTaskList from './LinkedTaskList.jsx';
import RockTaskBoard from './RockTaskBoard.jsx';

const ACTIVE_ORDER = ['planned', 'doing', 'ongoing', 'on_hold'];

/**
 * Rocks — the company's bigger projects (replaces the Notion ROCKS database).
 * A gallery of cards grouped by status, Notion-style: cover photo or
 * gradient, and the key facts (owner, deadline, on/off track, task
 * progress). Clicking a card opens the rock as a full page with its
 * properties, "done" definition, tasks (regular dashboard tasks — they also
 * show in the assignee's Home checklist) and notes.
 *
 * `openRockId` lets other tabs (Meetings' Rock Review) deep-link to a rock.
 */
export default function RocksTab({ staff, isManager, openRockId, onOpenRockChange }) {
  const { rocks, loading, error, createRock, updateRock, deleteRock } = useRocks();
  const { staffList } = useAllStaff();
  const rockIds = useMemo(() => rocks.map((r) => r.id), [rocks]);
  const linked = useLinkedTasks('rock_id', rockIds, staff, isManager);
  const [filter, setFilter]     = useState('active'); // 'active' | 'mine' | 'done'
  const [localOpenId, setLocalOpenId] = useState(null);
  const openId = onOpenRockChange ? openRockId : localOpenId;
  const setOpenId = onOpenRockChange || setLocalOpenId;
  const nameById = useMemo(() => Object.fromEntries(staffList.map((s) => [s.id, s.full_name])), [staffList]);

  const tasksByRock = useMemo(() => {
    const m = {};
    for (const t of linked.tasks) (m[t.rock_id] ||= []).push(t);
    return m;
  }, [linked.tasks]);

  const openRock = openId ? rocks.find((r) => r.id === openId) : null;

  // Land at the top of the page when opening/closing a rock.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [openId]);

  if (openRock) {
    return (
      <RockPage
        rock={openRock}
        tasks={tasksByRock[openRock.id] || []}
        linked={linked}
        staff={staff}
        staffList={staffList}
        isManager={isManager}
        onBack={() => setOpenId(null)}
        onUpdate={(patch) => updateRock(openRock.id, patch)}
        onDelete={async () => {
          if (!window.confirm(`Delete the rock "${openRock.title}" and all its tasks and notes?`)) return;
          if (await deleteRock(openRock.id)) setOpenId(null);
        }}
      />
    );
  }

  const visible = filter === 'done'
    ? rocks.filter((r) => r.status === 'done')
    : rocks.filter((r) => r.status !== 'done' && (filter !== 'mine'
      || r.owner_staff_id === staff?.id
      || (tasksByRock[r.id] || []).some((t) => t.assigned_staff_id === staff?.id)));

  const groups = filter === 'done'
    ? [{ key: 'done', rocks: [...visible].sort((a, b) => (b.completed_on || '').localeCompare(a.completed_on || '')) }]
    : ACTIVE_ORDER.map((key) => ({ key, rocks: visible.filter((r) => r.status === key) }));

  const newRock = async (status = 'planned') => {
    const created = await createRock({ title: 'Untitled rock', status });
    if (created) setOpenId(created.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Rocks</h1>
          <p className="text-sm text-gray-500">
            Our bigger projects. Open a rock to see its tasks and notes — anyone can add to them.
          </p>
        </div>
        {isManager && (
          <button
            onClick={() => newRock()}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" /> New rock
          </button>
        )}
      </div>

      <div className="flex w-fit gap-1 rounded-lg border border-gray-200 bg-white p-1">
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
      ) : filter === 'mine' && visible.length === 0 ? (
        <p className="text-sm text-gray-500">You don't own or have tasks on any active rocks.</p>
      ) : (
        groups.map((g) => (
          <StatusGroup
            key={g.key}
            statusKey={g.key}
            rocks={g.rocks}
            tasksByRock={tasksByRock}
            completionFor={linked.completionFor}
            nameById={nameById}
            onOpen={setOpenId}
            onAdd={isManager && g.key !== 'done' && filter === 'active' ? () => newRock(g.key) : null}
          />
        ))
      )}
    </div>
  );
}

export function rockProgress(tasks, completionFor) {
  const done = tasks.filter((t) => completionFor(t)).length;
  return { done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

// ── Gallery ────────────────────────────────────────────────────────────────

const STATUS_DOT = { planned: 'bg-sky-500', doing: 'bg-emerald-500', ongoing: 'bg-amber-500', on_hold: 'bg-red-500', done: 'bg-violet-500' };

function StatusGroup({ statusKey, rocks, tasksByRock, completionFor, nameById, onOpen, onAdd }) {
  const [open, setOpen] = useState(true);
  const status = ROCK_STATUS_BY_KEY[statusKey];
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
          <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[statusKey]}`} /> {status.label}
          </span>
          <span className="text-sm text-gray-400">{rocks.length}</span>
        </button>
        {onAdd && (
          <button onClick={onAdd} title={`New ${status.label.toLowerCase()} rock`} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rocks.map((rock) => (
            <RockCard
              key={rock.id}
              rock={rock}
              progress={rockProgress(tasksByRock[rock.id] || [], completionFor)}
              ownerName={nameById[rock.owner_staff_id]}
              onOpen={() => onOpen(rock.id)}
            />
          ))}
          {onAdd && (
            <button
              onClick={onAdd}
              className="flex min-h-[8rem] items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 text-sm text-gray-400 hover:border-gray-400 hover:bg-white hover:text-gray-600"
            >
              <Plus className="h-4 w-4" /> New rock
            </button>
          )}
          {rocks.length === 0 && !onAdd && <p className="text-xs text-gray-400">None.</p>}
        </div>
      )}
    </section>
  );
}

function RockCover({ cover, className = '' }) {
  const gradient = gradientClassFor(cover);
  if (cover && !gradient) {
    return <img src={cover} alt="" loading="lazy" className={`w-full object-cover ${className}`} />;
  }
  return <div className={`w-full ${gradient || 'bg-gray-100'} ${className}`} />;
}

function RockCard({ rock, progress, ownerName, onOpen }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const late = rock.status !== 'done' && rock.due_date && rock.due_date < today;
  return (
    <button
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <RockCover cover={rock.cover} className="h-32" />
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <p className="text-sm font-semibold leading-snug text-gray-900">
          <span className="mr-1">🚀</span>{rock.title}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span className="flex items-center gap-1"><User className="h-3 w-3" /> {ownerName || 'No owner'}</span>
          {rock.status === 'done' && rock.completed_on ? (
            <span className="flex items-center gap-1 text-violet-700"><CheckCircle2 className="h-3 w-3" /> {format(parseISO(rock.completed_on), 'd MMM yyyy')}</span>
          ) : rock.due_date && (
            <span className={`flex items-center gap-1 ${late ? 'font-medium text-red-600' : ''}`}>
              <CalendarDays className="h-3 w-3" /> {format(parseISO(rock.due_date), 'd MMM yyyy')}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {rock.status !== 'done' && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${rock.on_track ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {rock.on_track ? 'On track' : 'Off track'}
            </span>
          )}
        </div>
        {progress.total > 0 && (
          <div className="mt-auto pt-1">
            <div className="h-1.5 rounded-full bg-gray-100">
              <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${progress.pct}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-gray-500">{progress.done}/{progress.total} tasks done</p>
          </div>
        )}
      </div>
    </button>
  );
}

// ── Full page ──────────────────────────────────────────────────────────────

function RockPage({ rock, tasks, linked, staff, staffList, isManager, onBack, onUpdate, onDelete }) {
  const canEdit = canEditRock(rock, staff, isManager);
  const progress = rockProgress(tasks, linked.completionFor);
  const today = format(new Date(), 'yyyy-MM-dd');
  // New tasks default to the rock's deadline, or a week out if that's passed/unset.
  const defaultDue = rock.due_date && rock.due_date >= today ? rock.due_date : format(addDays(new Date(), 7), 'yyyy-MM-dd');

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ChevronLeft className="h-4 w-4" /> Rocks
      </button>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <CoverEditor rock={rock} canEdit={canEdit} onUpdate={onUpdate} />

        <div className="space-y-6 px-5 py-5 sm:px-8">
          <TitleField rock={rock} canEdit={canEdit} onUpdate={onUpdate} />

          <Properties rock={rock} staffList={staffList} isManager={isManager} canEdit={canEdit} progress={progress} onUpdate={onUpdate} />

          <Description rock={rock} canEdit={canEdit} onUpdate={onUpdate} />

          <RockTasks rock={rock} tasks={tasks} linked={linked} staff={staff} staffList={staffList} isManager={isManager} defaultDue={defaultDue} />

          <RockNotes rockId={rock.id} staff={staff} staffList={staffList} isManager={isManager} />

          {isManager && (
            <div className="flex justify-end border-t border-gray-100 pt-3">
              <button onClick={onDelete} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" /> Delete rock
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// List or Kanban board — same tasks either way. The choice is remembered per browser.
function RockTasks({ rock, tasks, linked, staff, staffList, isManager, defaultDue }) {
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('rock-task-view') === 'board' ? 'board' : 'list'; } catch { return 'list'; }
  });
  const choose = (v) => {
    setView(v);
    try { localStorage.setItem('rock-task-view', v); } catch { /* ignore */ }
  };
  const props = { tasks, linked, staff, staffList, isManager, extraFields: { rock_id: rock.id }, defaultDue };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tasks</h2>
        <div className="flex gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5">
          {[['list', 'List', List], ['board', 'Board', Columns3]].map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => choose(key)}
              aria-pressed={view === key}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                view === key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>
      {view === 'board'
        ? <RockTaskBoard {...props} />
        : <LinkedTaskList
            {...props}
            emptyText="No tasks on this rock yet."
            sourceLabel={(t) => (t.meeting_id ? (t.issue_id ? 'From IDS' : 'Meeting to-do') : null)}
          />}
    </section>
  );
}

function CoverEditor({ rock, canEdit, onUpdate }) {
  const [picking, setPicking]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr]           = useState(null);
  const fileRef = useRef(null);

  const upload = async (file) => {
    if (!file) return;
    setUploading(true); setErr(null);
    try {
      const url = await uploadRockCover(file);
      await onUpdate({ cover: url });
      setPicking(false);
    } catch (e) {
      setErr(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const choose = async (cover) => { await onUpdate({ cover }); setPicking(false); };

  if (!rock.cover && !canEdit) return null;

  return (
    <div className="group relative">
      {rock.cover ? <RockCover cover={rock.cover} className="h-48 sm:h-56" /> : <div className="h-14" />}
      {canEdit && (
        <div className={`absolute right-3 ${rock.cover ? 'bottom-3' : 'top-3'} flex gap-1.5 ${rock.cover && !picking ? 'opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100' : ''}`}>
          <button
            onClick={() => setPicking((p) => !p)}
            className="flex items-center gap-1 rounded-md bg-white/90 px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-white"
          >
            <ImagePlus className="h-3.5 w-3.5" /> {rock.cover ? 'Change cover' : 'Add cover'}
          </button>
          {rock.cover && (
            <button onClick={() => choose(null)} className="rounded-md bg-white/90 px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-white">
              Remove
            </button>
          )}
        </div>
      )}
      {picking && (
        <div className={`absolute right-3 z-10 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg ${rock.cover ? 'bottom-12' : 'top-12'}`}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700">Cover</p>
            <button onClick={() => setPicking(false)} className="text-gray-400 hover:text-gray-700"><X className="h-3.5 w-3.5" /></button>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</> : <><ImagePlus className="h-3.5 w-3.5" /> Upload a photo</>}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
          {err && <p className="mt-1.5 text-xs text-red-600">{err}</p>}
          <p className="mb-1.5 mt-3 text-[11px] font-medium text-gray-500">Or a colour</p>
          <div className="grid grid-cols-6 gap-1.5">
            {Object.entries(ROCK_GRADIENTS).map(([key, cls]) => (
              <button
                key={key}
                onClick={() => choose(`gradient:${key}`)}
                aria-label={`Gradient ${key}`}
                className={`h-8 rounded-md ${cls} ${rock.cover === `gradient:${key}` ? 'ring-2 ring-emerald-500 ring-offset-1' : ''}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TitleField({ rock, canEdit, onUpdate }) {
  const [value, setValue] = useState(rock.title);
  useEffect(() => { setValue(rock.title); }, [rock.title]);
  const commit = () => {
    const t = value.trim();
    if (!t) { setValue(rock.title); return; }
    if (t !== rock.title) onUpdate({ title: t });
  };
  if (!canEdit) return <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">🚀 {rock.title}</h1>;
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xl sm:text-3xl">🚀</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setValue(rock.title); e.currentTarget.blur(); } }}
        aria-label="Rock name"
        autoFocus={rock.title === 'Untitled rock'}
        onFocus={(e) => { if (rock.title === 'Untitled rock') e.target.select(); }}
        className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-2xl font-bold text-gray-900 hover:border-gray-200 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-3xl"
      />
    </div>
  );
}

function Properties({ rock, staffList, isManager, canEdit, progress, onUpdate }) {
  const selectClass = 'w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-gray-900 hover:border-gray-200 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:hover:border-transparent disabled:opacity-100';
  const rows = [
    ['Status', (
      <select disabled={!canEdit} value={rock.status} onChange={(e) => onUpdate({ status: e.target.value })} className={selectClass}>
        {ROCK_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    )],
    ['Owner', (
      <select disabled={!isManager} value={rock.owner_staff_id || ''} onChange={(e) => onUpdate({ owner_staff_id: e.target.value || null })} className={selectClass}>
        <option value="">No owner</option>
        {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
      </select>
    )],
    ['Deadline', (
      <input type="date" disabled={!canEdit} value={rock.due_date || ''} onChange={(e) => onUpdate({ due_date: e.target.value || null })} className={selectClass} />
    )],
    ['Track', (
      <select disabled={!canEdit} value={rock.on_track ? 'on' : 'off'} onChange={(e) => onUpdate({ on_track: e.target.value === 'on' })} className={selectClass}>
        <option value="on">On track</option>
        <option value="off">Off track</option>
      </select>
    )],
    ['Progress', (
      <div className="flex items-center gap-2 px-1.5 py-1">
        <div className="h-1.5 w-32 rounded-full bg-gray-100">
          <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${progress.pct}%` }} />
        </div>
        <span className="text-sm text-gray-600">{progress.done}/{progress.total} tasks</span>
      </div>
    )],
  ];
  if (rock.status === 'done' && rock.completed_on) {
    rows.push(['Completed', <span className="px-1.5 py-1 text-sm text-gray-900">{format(parseISO(rock.completed_on), 'd MMM yyyy')}</span>]);
  }
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-0.5 sm:grid-cols-2">
      {rows.map(([label, control]) => (
        <div key={label} className="grid grid-cols-[6.5rem_1fr] items-center">
          <dt className="text-sm text-gray-500">{label}</dt>
          <dd className="min-w-0">{control}</dd>
        </div>
      ))}
    </dl>
  );
}

function Description({ rock, canEdit, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState(rock.description || '');
  return (
    <section>
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">What "done" looks like</h2>
      {editing ? (
        <div>
          <RichTextField value={value} onChange={setValue} multiline autoFocus />
          <div className="mt-1.5 flex gap-2">
            <button
              onClick={async () => { await onUpdate({ description: value.trim() || null }); setEditing(false); }}
              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
            >
              Save
            </button>
            <button onClick={() => { setValue(rock.description || ''); setEditing(false); }} className="rounded-lg px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100">
              Cancel
            </button>
          </div>
        </div>
      ) : rock.description ? (
        <p className="whitespace-pre-wrap text-sm text-gray-700">
          {renderFormatted(rock.description)}
          {canEdit && <button onClick={() => setEditing(true)} className="ml-2 text-xs text-emerald-700 hover:underline">Edit</button>}
        </p>
      ) : canEdit ? (
        <button onClick={() => setEditing(true)} className="text-xs text-emerald-700 hover:underline">Add a measurable "done" definition</button>
      ) : (
        <p className="text-xs text-gray-400">Not set.</p>
      )}
    </section>
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
    <section>
      <h2 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <MessageSquare className="h-3.5 w-3.5" /> Notes
      </h2>
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
    </section>
  );
}
