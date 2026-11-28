import { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Loader2 } from 'lucide-react';
import { format, parseISO, addDays, addWeeks } from 'date-fns';
import { useOneOnOnes, mondayOf } from '../../utils/useOneOnOnes.js';
import { useLinkedTasks } from '../../utils/useLinkedTasks.js';
import { renderFormatted } from '../../utils/richText.js';
import RichTextField from '../RichTextField.jsx';
import LinkedTaskList from '../LinkedTaskList.jsx';

const weekLabel = (monday) => `Week of ${format(parseISO(monday), 'd MMM yyyy')}`;

/**
 * Weekly 1-1s for one person. A week navigator picks the Monday; that week's
 * row (one_on_ones) holds the notes, and its to-dos are task_templates with
 * one_on_one_id (same machinery as meeting to-dos). Below: to-dos still open
 * from earlier weeks, then the history of past 1-1s.
 */
export default function OneOnOnes({ person, staff, staffList, isManager }) {
  const thisWeek = mondayOf();
  const [week, setWeek] = useState(thisWeek);
  const api = useOneOnOnes(person.id);
  const ids = useMemo(() => api.rows.map((r) => r.id), [api.rows]);
  const linked = useLinkedTasks('one_on_one_id', ids, staff, isManager);
  const row = api.rows.find((r) => r.week_start === week) || null;
  const weekById = useMemo(() => Object.fromEntries(api.rows.map((r) => [r.id, r.week_start])), [api.rows]);

  // Reset to this week when switching person.
  useEffect(() => { setWeek(thisWeek); }, [person.id, thisWeek]);

  const tasksThisWeek = row ? linked.tasks.filter((t) => t.one_on_one_id === row.id) : [];
  const carried = linked.tasks.filter((t) => weekById[t.one_on_one_id] < week && !linked.completionFor(t));
  const past = api.rows.filter((r) => r.week_start !== week);
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    await api.ensureWeek(week);
    setStarting(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setWeek(format(addWeeks(parseISO(week), -1), 'yyyy-MM-dd'))} aria-label="Previous week" className="rounded-md border border-gray-200 p-1 text-gray-500 hover:bg-gray-50">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[11rem] text-center text-sm font-semibold text-gray-900">{weekLabel(week)}</span>
        <button onClick={() => setWeek(format(addWeeks(parseISO(week), 1), 'yyyy-MM-dd'))} aria-label="Next week" className="rounded-md border border-gray-200 p-1 text-gray-500 hover:bg-gray-50">
          <ChevronRight className="h-4 w-4" />
        </button>
        {week !== thisWeek && (
          <button onClick={() => setWeek(thisWeek)} className="rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-500/10">
            This week
          </button>
        )}
        {row && (
          <button
            onClick={async () => {
              if (!window.confirm(`Delete the 1-1 for the ${weekLabel(week).toLowerCase()}, with its notes and to-dos?`)) return;
              if (await api.removeWeek(row.id)) linked.reload();
            }}
            className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete this 1-1
          </button>
        )}
      </div>

      {(api.error || linked.error) && <p className="text-xs text-red-600">{api.error || linked.error}</p>}

      {api.loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !row ? (
        <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center">
          <p className="text-sm text-gray-500">No 1-1 recorded for this week.</p>
          <button
            onClick={start}
            disabled={starting}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Start 1-1
          </button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <WeekNotes key={row.id} row={row} onSave={(notes) => api.saveNotes(week, notes)} />
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">To-dos</h3>
            <LinkedTaskList
              tasks={tasksThisWeek}
              linked={linked}
              staff={staff}
              staffList={staffList}
              isManager={isManager}
              extraFields={{ one_on_one_id: row.id }}
              defaultAssignee={person.id}
              defaultDue={format(addDays(parseISO(week), 7), 'yyyy-MM-dd')}
              emptyText="No to-dos from this 1-1 yet."
              addLabel="Add to-do"
            />
          </div>
        </div>
      )}

      {carried.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Still open from earlier 1-1s</h3>
          <LinkedTaskList
            tasks={carried}
            linked={linked}
            staff={staff}
            staffList={staffList}
            isManager={isManager}
            canAdd={false}
            sourceLabel={(t) => `From ${format(parseISO(weekById[t.one_on_one_id]), 'd MMM')}`}
          />
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Past 1-1s</h3>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            {past.map((r) => {
              const tasks = linked.tasks.filter((t) => t.one_on_one_id === r.id);
              const done = tasks.filter((t) => linked.completionFor(t)).length;
              return (
                <li key={r.id}>
                  <button onClick={() => setWeek(r.week_start)} className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left hover:bg-gray-50">
                    <span className="w-28 shrink-0 text-sm font-medium text-gray-900">{format(parseISO(r.week_start), 'd MMM yyyy')}</span>
                    <span className="line-clamp-2 min-w-0 flex-1 text-xs text-gray-500">{r.notes ? plainPreview(r.notes) : <em>No notes</em>}</span>
                    {tasks.length > 0 && <span className="shrink-0 text-[11px] text-gray-400">{done}/{tasks.length} to-dos</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// Strip the light markdown richText.js uses, for a one-line preview.
function plainPreview(text) {
  return text.replace(/[*_~`#>]+/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
}

function WeekNotes({ row, onSave }) {
  const [editing, setEditing] = useState(!row.notes);
  const [value, setValue]     = useState(row.notes || '');
  const [saving, setSaving]   = useState(false);
  const dirty = (value.trim() || null) !== (row.notes || null);

  const save = async () => {
    setSaving(true);
    const saved = await onSave(value);
    setSaving(false);
    if (saved && saved.notes) setEditing(false);
  };

  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</h3>
      {editing ? (
        <>
          <RichTextField value={value} onChange={setValue} placeholder="Wins, challenges, goals, feedback…" multiline autoFocus={!row.notes} />
          <div className="mt-1.5 flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save notes'}
            </button>
            {row.notes && (
              <button onClick={() => { setValue(row.notes); setEditing(false); }} className="rounded-lg px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100">
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="whitespace-pre-wrap text-sm text-gray-800">{renderFormatted(row.notes)}</p>
          <button onClick={() => setEditing(true)} className="mt-1 text-xs text-emerald-700 hover:underline">Edit</button>
        </div>
      )}
    </div>
  );
}
