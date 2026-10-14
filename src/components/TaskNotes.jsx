import { useState } from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { renderFormatted } from '../utils/richText.js';
import RichTextField from './RichTextField.jsx';

/** "N notes" toggle for a task row. Pair with TaskNotesPanel below it. */
export function TaskNotesToggle({ count, open, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      className={`flex items-center gap-1 text-[11px] ${count ? 'text-sky-700' : 'text-gray-400'} hover:text-sky-800`}
    >
      <MessageSquare className="h-3 w-3" />
      {count ? `${count} note${count === 1 ? '' : 's'}` : 'Add note'}
    </button>
  );
}

/** A task's notes thread + add box. `taskNotes` is a useTaskNotes() result. */
export function TaskNotesPanel({ templateId, taskNotes, staff, isManager, nameById }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy]   = useState(false);
  const notes = taskNotes.notesFor(templateId);

  const submit = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    const added = await taskNotes.addNote(templateId, draft);
    setBusy(false);
    if (added) setDraft('');
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-gray-50 p-2.5">
      {notes.map((n) => (
        <div key={n.id} className="group">
          <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
            <span>
              <span className="font-medium text-gray-700">{nameById[n.staff_id] || 'Someone'}</span>
              {' · '}{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
            </span>
            {(isManager || n.staff_id === staff?.id) && (
              <button onClick={() => taskNotes.removeNote(n.id)} title="Delete note" className="text-gray-400 opacity-0 hover:text-red-600 group-hover:opacity-100 focus:opacity-100">
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm text-gray-800">{renderFormatted(n.body)}</p>
        </div>
      ))}
      <form onSubmit={submit} className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <RichTextField value={draft} onChange={setDraft} placeholder="Add a note…" />
        </div>
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="mb-[1px] rounded-lg bg-emerald-600 px-2.5 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          Add
        </button>
      </form>
      {taskNotes.error && <p className="text-xs text-red-600">{taskNotes.error}</p>}
    </div>
  );
}
