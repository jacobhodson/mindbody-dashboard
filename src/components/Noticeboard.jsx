import { useState } from 'react';
import { Megaphone, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { useNotices } from '../utils/useNotices.js';

function NoticeRow({ notice, isManager, onUpdate, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState(notice.message);

  const save = async () => {
    if (value.trim()) await onUpdate(notice.id, value);
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="flex items-center gap-2 py-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button onClick={save} className="text-emerald-600 hover:text-emerald-700"><Check className="h-4 w-4" /></button>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-2 py-2">
      <span className="text-sm text-gray-800">{notice.message}</span>
      {isManager && (
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-gray-700">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onRemove(notice.id)} className="text-gray-400 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}

export default function Noticeboard({ staff, isManager }) {
  const { notices, loading, error, createNotice, updateNotice, removeNotice } = useNotices(staff);
  const [adding, setAdding]   = useState(false);
  const [draft, setDraft]     = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    await createNotice(draft);
    setDraft('');
    setAdding(false);
  };

  if (loading) return null;
  if (!isManager && notices.length === 0) return null; // nothing to show, don't clutter the page

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-gray-900">Noticeboard</h3>
        </div>
        {isManager && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
          >
            <Plus className="h-3.5 w-3.5" /> Add notice
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {adding && (
        <form onSubmit={submit} className="mt-3 flex items-center gap-2 border-t border-gray-200 pt-3">
          <input
            type="text"
            autoFocus
            placeholder="Coaching key, class announcement…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors">
            Post
          </button>
          <button type="button" onClick={() => { setAdding(false); setDraft(''); }} className="rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-300 transition-colors">
            Cancel
          </button>
        </form>
      )}

      {notices.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No notices right now.</p>
      ) : (
        <ul className="mt-1 divide-y divide-gray-200">
          {notices.map((n) => (
            <NoticeRow key={n.id} notice={n} isManager={isManager} onUpdate={updateNotice} onRemove={removeNotice} />
          ))}
        </ul>
      )}
    </div>
  );
}
