import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Plus, ArrowRightLeft, ListPlus, Star, ExternalLink } from 'lucide-react';
import { format, parseISO, addDays, subDays } from 'date-fns';
import { periodStartForOffset } from '../utils/periods.js';
import { MEETING_TYPES, CASCADE_SECTIONS, MEETING_STATUSES } from '../utils/meetingAgendas.js';
import { useMeeting, useLeadershipCascade } from '../utils/useMeeting.js';
import { useIssues } from '../utils/useIssues.js';
import { useLinkedTasks } from '../utils/useLinkedTasks.js';
import { useRocks, canEditRock } from '../utils/useRocks.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import { ROCK_STATUSES, ROCK_STAGES } from '../utils/rocks.js';
import { renderFormatted } from '../utils/richText.js';
import RichTextField from './RichTextField.jsx';
import LinkedTaskList, { TaskForm } from './LinkedTaskList.jsx';
import Scoreboard from './Scoreboard.jsx';
import { rockProgress } from './RocksTab.jsx';

/**
 * Weekly meetings — the Monday Team Meeting (everyone) and the Leadership
 * Huddle (managers only), replacing the Notion databases that spun up a new
 * page each week. Pick a week; that week's meeting is created on first open.
 * People add their own entries to each agenda section; IDS issues carry over
 * week to week until solved; to-dos are regular tasks (they land in the
 * assignee's Home checklist) and roll into next week's "Last week's to-dos".
 */
export default function MeetingsTab({ staff, isManager, onOpenRocks }) {
  const [type, setType]     = useState('team');
  const [offset, setOffset] = useState(0);
  const meetingDate = periodStartForOffset('weekly', offset);
  const config = MEETING_TYPES[type];

  const { staffList } = useAllStaff();
  const nameById = useMemo(() => Object.fromEntries(staffList.map((s) => [s.id, s.full_name])), [staffList]);

  const mtg = useMeeting(type, meetingDate);
  const { meeting } = mtg;
  const todoMeetingIds = useMemo(
    () => [meeting?.id, ...mtg.pastMeetings.map((m) => m.id)].filter(Boolean),
    [meeting, mtg.pastMeetings],
  );
  const todos = useLinkedTasks('meeting_id', todoMeetingIds, staff, isManager);

  const ctx = { staff, isManager, staffList, nameById, meeting, meetingDate, mtg, todos, type };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Meetings</h1>
        <p className="text-sm text-gray-500">
          This week's meeting opens automatically — add your bits to each section before or during it.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {Object.entries(MEETING_TYPES)
            .filter(([, c]) => !c.managerOnly || isManager)
            .map(([key, c]) => (
              <button
                key={key}
                onClick={() => setType(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  type === key ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {c.label}
              </button>
            ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setOffset((o) => o - 1)} aria-label="Previous week" className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-600 hover:bg-gray-100">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[9rem] text-center text-sm font-medium text-gray-900">
            Mon {format(parseISO(meetingDate), 'd MMM yyyy')}
          </span>
          <button
            onClick={() => setOffset((o) => o + 1)}
            disabled={offset >= 1}
            aria-label="Next week"
            className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {offset !== 0 && (
            <button onClick={() => setOffset(0)} className="text-xs text-emerald-700 hover:underline">This week</button>
          )}
        </div>
      </div>

      {(mtg.error || todos.error) && <p className="text-xs text-red-600">{mtg.error || todos.error}</p>}

      {mtg.loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !meeting ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          No {config.label} was recorded for this week.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <h2 className="flex-1 text-sm font-semibold text-gray-900">
              {config.label} · {format(parseISO(meetingDate), 'EEEE d MMMM')}
            </h2>
            <AverageRating ratings={mtg.ratings} />
            <select
              value={meeting.status}
              onChange={(e) => mtg.updateMeeting({ status: e.target.value })}
              aria-label="Meeting status"
              className="rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {MEETING_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>

          {config.sections.map((section, i) => (
            // Keyed by meeting too, so per-section state (drafts, your rating)
            // resets when you switch week or meeting type.
            <section key={`${meeting.id}-${section.key}`} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  {i + 1}. {section.title}
                  {section.minutes && <span className="ml-1.5 font-normal text-gray-400">({section.minutes} min)</span>}
                </h3>
                {section.hint && <p className="mt-0.5 text-xs text-gray-500">{section.hint}</p>}
              </div>
              <SectionBody section={section} ctx={ctx} onOpenRocks={onOpenRocks} />
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function SectionBody({ section, ctx, onOpenRocks }) {
  const { mtg, meeting, meetingDate, todos, staff, staffList, isManager, nameById } = ctx;

  switch (section.kind) {
    case 'items':
      return <ItemList sectionKey={section.key} ctx={ctx} />;

    case 'cascade_in':
      return <CascadeIn meetingDate={meetingDate} nameById={nameById} />;

    case 'cascade_out':
      return (
        <div className="space-y-4">
          {CASCADE_SECTIONS.map((c) => (
            <div key={c.key} className="rounded-lg border border-sky-100 bg-sky-50/50 p-3">
              <h4 className="mb-1.5 text-xs font-semibold text-sky-900">{c.title}</h4>
              <ItemList sectionKey={c.key} ctx={ctx} />
            </div>
          ))}
        </div>
      );

    case 'scorecard':
      // A Monday meeting reviews the week that just finished.
      return (
        <Scoreboard
          staff={staff}
          isManager={isManager}
          anchor={format(subDays(parseISO(meetingDate), 1), 'yyyy-MM-dd')}
          defaultView="weekly"
        />
      );

    case 'rocks':
      return <RockReview staff={staff} staffList={staffList} isManager={isManager} onOpenRocks={onOpenRocks} />;

    case 'ids':
      return <IssuesBoard board={section.board} voices={section.voices} ctx={ctx} />;

    case 'last_todos': {
      const previousId = mtg.pastMeetings[0]?.id;
      const dateById = Object.fromEntries(mtg.pastMeetings.map((m) => [m.id, m.meeting_date]));
      // Everything from last meeting, plus anything older that's still open.
      const list = todos.tasks.filter((t) => t.meeting_id !== meeting.id
        && (t.meeting_id === previousId || !todos.completionFor(t)));
      return (
        <LinkedTaskList
          tasks={list}
          linked={todos}
          staff={staff}
          staffList={staffList}
          isManager={isManager}
          canAdd={false}
          emptyText="No to-dos carried over."
          sourceLabel={(t) => (dateById[t.meeting_id] ? `from ${format(parseISO(dateById[t.meeting_id]), 'd MMM')}` : null)}
        />
      );
    }

    case 'todos': {
      const list = todos.tasks.filter((t) => t.meeting_id === meeting.id);
      return (
        <LinkedTaskList
          tasks={list}
          linked={todos}
          staff={staff}
          staffList={staffList}
          isManager={isManager}
          extraFields={{ meeting_id: meeting.id }}
          defaultDue={format(addDays(parseISO(meetingDate), 7), 'yyyy-MM-dd')}
          addLabel="Add to-do"
          emptyText="No to-dos yet this week."
        />
      );
    }

    case 'rating':
      return <Ratings ratings={mtg.ratings} staff={staff} nameById={nameById} onSave={mtg.saveRating} />;

    default:
      return null;
  }
}

// ── Free-form entries ──────────────────────────────────────────────────────

function ItemList({ sectionKey, ctx }) {
  const { mtg, staff, isManager, nameById } = ctx;
  const items = mtg.items.filter((i) => i.section === sectionKey);
  const [draft, setDraft] = useState('');
  const [busy, setBusy]   = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    const added = await mtg.addItem(sectionKey, draft);
    setBusy(false);
    if (added) setDraft('');
  };

  return (
    <div>
      {items.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="group flex items-start gap-2 text-sm">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
              <div className="min-w-0 flex-1">
                <span className="whitespace-pre-wrap text-gray-800">{renderFormatted(item.body)}</span>
                <span className="ml-2 text-[11px] text-gray-400">— {nameById[item.staff_id] || 'Someone'}</span>
              </div>
              {(isManager || item.staff_id === staff?.id) && (
                <button onClick={() => mtg.removeItem(item.id)} title="Remove" className="shrink-0 text-gray-400 opacity-0 hover:text-red-600 group-hover:opacity-100 focus:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <RichTextField value={draft} onChange={setDraft} placeholder="Add yours…" />
        </div>
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label="Add entry"
          className="mb-[1px] rounded-lg bg-emerald-600 p-2 text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function CascadeIn({ meetingDate, nameById }) {
  const items = useLeadershipCascade(meetingDate, true);
  if (items.length === 0) {
    return <p className="text-xs text-gray-500">Nothing cascaded from this week's Leadership Huddle yet.</p>;
  }
  return (
    <div className="space-y-3">
      {CASCADE_SECTIONS.map((c) => {
        const list = items.filter((i) => i.section === c.key);
        if (!list.length) return null;
        return (
          <div key={c.key} className="rounded-lg border border-sky-100 bg-sky-50/50 p-3">
            <h4 className="mb-1 text-xs font-semibold text-sky-900">{c.title}</h4>
            <ul className="space-y-1">
              {list.map((i) => (
                <li key={i.id} className="text-sm text-gray-800">
                  {renderFormatted(i.body)}
                  <span className="ml-2 text-[11px] text-gray-400">— {nameById[i.staff_id] || 'Leadership'}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ── Rock review ────────────────────────────────────────────────────────────

function RockReview({ staff, staffList, isManager, onOpenRocks }) {
  const { rocks, loading, updateRock } = useRocks();
  const active = useMemo(() => rocks.filter((r) => r.status !== 'done'), [rocks]);
  const linked = useLinkedTasks('rock_id', active.map((r) => r.id), staff, isManager);
  const nameById = Object.fromEntries(staffList.map((s) => [s.id, s.full_name]));
  const selectClass = 'rounded-md border border-gray-300 bg-gray-50 px-1.5 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-70';

  if (loading) return <p className="text-xs text-gray-500">Loading…</p>;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
              <th className="pb-2 font-medium">Rock</th>
              <th className="pb-2 font-medium">Owner</th>
              <th className="pb-2 font-medium">Tasks</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Stage</th>
              <th className="pb-2 font-medium">Track</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {active.map((rock) => {
              const p = rockProgress(linked.tasks.filter((t) => t.rock_id === rock.id), linked.completionFor);
              const editable = canEditRock(rock, staff, isManager);
              return (
                <tr key={rock.id}>
                  <td className="py-2 pr-3">
                    {onOpenRocks
                      ? <button onClick={() => onOpenRocks(rock.id)} className="text-left text-gray-900 hover:text-emerald-700 hover:underline">{rock.title}</button>
                      : <span className="text-gray-900">{rock.title}</span>}
                  </td>
                  <td className="py-2 pr-3 text-gray-600">{nameById[rock.owner_staff_id] || '—'}</td>
                  <td className="py-2 pr-3 tabular-nums text-gray-600">{p.done}/{p.total}</td>
                  <td className="py-2 pr-2">
                    <select disabled={!editable} value={rock.status} onChange={(e) => updateRock(rock.id, { status: e.target.value })} className={selectClass}>
                      {ROCK_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <select disabled={!editable} value={rock.stage || ''} onChange={(e) => updateRock(rock.id, { stage: e.target.value || null })} className={selectClass}>
                      <option value="">—</option>
                      {ROCK_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className="py-2">
                    <button
                      disabled={!editable}
                      onClick={() => updateRock(rock.id, { on_track: !rock.on_track })}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        rock.on_track ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      } disabled:cursor-default`}
                    >
                      {rock.on_track ? 'On track' : 'Off track'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {onOpenRocks && (
        <button onClick={() => onOpenRocks(null)} className="mt-3 flex items-center gap-1 text-xs text-emerald-700 hover:underline">
          Open Rocks <ExternalLink className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ── IDS ────────────────────────────────────────────────────────────────────

const ISSUE_STATUSES = [
  { key: 'open',          label: 'Open' },
  { key: 'todos_created', label: "To-do's created" },
  { key: 'solved',        label: 'Solved' },
];

function IssuesBoard({ board, voices, ctx }) {
  const { staff, isManager, staffList, nameById, meeting, meetingDate, todos } = ctx;
  const { issues, loading, error, addIssue, updateIssue, deleteIssue } = useIssues(board);
  const [title, setTitle]       = useState('');
  const [todoFor, setTodoFor]   = useState(null);
  const open = issues.filter((i) => i.status !== 'solved');
  const solved = issues.filter((i) => i.status === 'solved');

  const submit = async (e) => {
    e.preventDefault();
    const added = await addIssue(title);
    if (added) setTitle('');
  };

  const renderIssue = (issue) => {
    const issueTodos = todos.tasks.filter((t) => t.issue_id === issue.id);
    const canDelete = isManager || issue.raised_by === staff?.id;
    return (
      <li key={issue.id} className="py-2.5">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className={`text-sm ${issue.status === 'solved' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{issue.title}</p>
            {issue.notes && <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-600">{renderFormatted(issue.notes)}</p>}
            <p className="mt-0.5 text-[11px] text-gray-400">
              Raised by {nameById[issue.raised_by] || 'someone'} · {format(new Date(issue.created_at), 'd MMM')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <select
              value={issue.status}
              onChange={(e) => updateIssue(issue.id, { status: e.target.value })}
              aria-label="Issue status"
              className="rounded-md border border-gray-300 bg-gray-50 px-1.5 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {ISSUE_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button onClick={() => setTodoFor(todoFor === issue.id ? null : issue.id)} title="Create a to-do from this issue" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-emerald-700">
              <ListPlus className="h-4 w-4" />
            </button>
            {isManager && (
              <button
                onClick={() => updateIssue(issue.id, { board: board === 'leadership' ? 'team' : 'leadership' })}
                title={board === 'leadership' ? 'Move to the Team IDS board' : 'Move to the Leadership IDS board'}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-sky-700"
              >
                <ArrowRightLeft className="h-4 w-4" />
              </button>
            )}
            {canDelete && (
              <button onClick={() => { if (window.confirm(`Delete "${issue.title}"?`)) deleteIssue(issue.id); }} title="Delete issue" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        {issueTodos.length > 0 && (
          <ul className="mt-1 space-y-0.5 pl-3">
            {issueTodos.map((t) => (
              <li key={t.id} className={`text-xs ${todos.completionFor(t) ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                ↳ {t.label} · {nameById[t.assigned_staff_id] || 'Unassigned'}
              </li>
            ))}
          </ul>
        )}
        {todoFor === issue.id && (
          <TaskForm
            staffList={staffList}
            initial={{ label: issue.title, assignee: staff?.id || '', due_date: format(addDays(parseISO(meetingDate), 7), 'yyyy-MM-dd') }}
            submitLabel="Add to-do"
            onCancel={() => setTodoFor(null)}
            onSubmit={async (fields) => {
              const created = await todos.addTask({ ...fields, meeting_id: meeting.id, issue_id: issue.id });
              if (!created) return;
              setTodoFor(null);
              if (issue.status === 'open') await updateIssue(issue.id, { status: 'todos_created' });
            }}
          />
        )}
      </li>
    );
  };

  return (
    <div className="space-y-3">
      {voices && <FiveVoices />}
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Raise an issue…"
          aria-label="New issue"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button type="submit" disabled={!title.trim()} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40">
          Add
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {loading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : (
        <>
          {open.length === 0 ? <p className="text-xs text-gray-500">No open issues.</p> : <ul className="divide-y divide-gray-100">{open.map(renderIssue)}</ul>}
          {solved.length > 0 && (
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer">Solved in the last 2 weeks ({solved.length})</summary>
              <ul className="divide-y divide-gray-100">{solved.map(renderIssue)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function FiveVoices() {
  return (
    <details className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs text-violet-900">
      <summary className="cursor-pointer font-semibold">🗣️ 5 Voices — hear everyone, in the right order</summary>
      <p className="mt-1.5 text-violet-800">
        Loud voices (Pioneer, Connector) dominate by default; the most valuable input often comes from the voices heard least.
        Invite them in this order — a facilitation order, not fixed labels:
      </p>
      <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-violet-800">
        <li><strong>Nurturer</strong> — how does this land for team and clients?</li>
        <li><strong>Creative</strong> — the better idea / the future risk: what are we missing?</li>
        <li><strong>Guardian</strong> — the hard questions: resources, process, does it hold up?</li>
        <li><strong>Connector</strong> — who and what we can rally behind it.</li>
        <li><strong>Pioneer</strong> — the call: mission, results, drive to decision.</li>
      </ol>
    </details>
  );
}

// ── Rating ─────────────────────────────────────────────────────────────────

function AverageRating({ ratings }) {
  if (!ratings.length) return null;
  const avg = ratings.reduce((s, r) => s + r.rating, 0) / ratings.length;
  return (
    <span className="flex items-center gap-1 text-xs text-gray-600">
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {avg.toFixed(1)} avg · {ratings.length} rated
    </span>
  );
}

function Ratings({ ratings, staff, nameById, onSave }) {
  const mine = ratings.find((r) => r.staff_id === staff?.id);
  const [rating, setRating]         = useState(mine?.rating || '');
  const [suggestion, setSuggestion] = useState(mine?.suggestion || '');
  const [saved, setSaved]           = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!rating || !staff) return;
    await onSave(staff.id, Number(rating), suggestion);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          aria-label="Your rating"
          className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Your rating</option>
          {Array.from({ length: 10 }, (_, i) => 10 - i).map((n) => <option key={n} value={n}>{n}/10</option>)}
        </select>
        <input
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value)}
          placeholder="One improvement (optional)"
          aria-label="One improvement"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button type="submit" disabled={!rating} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40">
          {saved ? 'Saved' : mine ? 'Update' : 'Rate'}
        </button>
      </form>
      {ratings.length > 0 && (
        <ul className="space-y-1 text-sm">
          {ratings.map((r) => (
            <li key={r.id} className="flex gap-2">
              <span className="w-24 shrink-0 text-gray-600">{nameById[r.staff_id] || 'Someone'}</span>
              <span className="w-10 shrink-0 font-medium tabular-nums text-gray-900">{r.rating}/10</span>
              {r.suggestion && <span className="text-gray-600">{r.suggestion}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
