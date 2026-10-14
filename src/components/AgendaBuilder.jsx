import { useState } from 'react';
import { GripVertical, ArrowUp, ArrowDown, Pencil, Trash2, Plus } from 'lucide-react';
import { SECTION_KINDS } from '../utils/meetingAgendas.js';

const kindLabel = (kind) => SECTION_KINDS.find((k) => k.kind === kind)?.label || kind;

const input = 'w-full rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';
const iconBtn = 'rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-30 disabled:hover:bg-transparent';

/**
 * Build mode for a meeting agenda (managers only): drag or arrow to reorder,
 * edit a section's title / hint / minutes, remove it, or add a new one.
 * Everything here applies from this week's meeting on — earlier weeks keep
 * the agenda they had (see useMeetingSections).
 */
export default function AgendaBuilder({ label, type, agenda }) {
  const sections = agenda.current;
  const [editingId, setEditingId] = useState(null);
  const [dragId, setDragId]       = useState(null);
  const [overId, setOverId]       = useState(null);

  const move = (from, to) => {
    if (to < 0 || to >= sections.length || from === to) return;
    const ids = sections.map((s) => s.id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    agenda.reorder(ids);
  };

  const drop = (targetId) => {
    const from = sections.findIndex((s) => s.id === dragId);
    const to = sections.findIndex((s) => s.id === targetId);
    setDragId(null); setOverId(null);
    if (from >= 0 && to >= 0) move(from, to);
  };

  const remove = (s) => {
    if (!window.confirm(`Remove "${s.title}" from the ${label}?\n\nIt disappears from this week's meeting on. Earlier weeks keep it and their entries.`)) return;
    agenda.removeSection(s);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <p className="font-semibold">Editing the {label} agenda</p>
        <p className="mt-0.5">
          Drag to reorder, or edit, remove and add sections. Changes apply from this week's meeting on — past weeks keep the agenda they had.
          Lock the page when you're done.
        </p>
      </div>

      {agenda.error && <p className="text-xs text-red-600">{agenda.error}</p>}

      <ol className="space-y-2">
        {sections.map((s, i) => (
          <li
            key={s.id}
            draggable={editingId !== s.id}
            onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragId(s.id); }}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(s.id); } }}
            onDrop={(e) => { e.preventDefault(); drop(s.id); }}
            className={`rounded-xl border bg-white p-3 transition-colors ${
              overId === s.id && dragId !== s.id ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-gray-200'
            } ${dragId === s.id ? 'opacity-50' : ''}`}
          >
            {editingId === s.id ? (
              <SectionForm
                initial={s}
                submitLabel="Save"
                onCancel={() => setEditingId(null)}
                onSubmit={async (v) => {
                  if (await agenda.updateSection(s.id, { title: v.title, hint: v.hint || null, minutes: v.minutes })) setEditingId(null);
                }}
              />
            ) : (
              <div className="flex items-start gap-2">
                <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-gray-300" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {i + 1}. {s.title}
                    {s.minutes != null && <span className="ml-1.5 font-normal text-gray-400">({s.minutes} min)</span>}
                  </p>
                  {s.hint && <p className="mt-0.5 text-xs text-gray-500">{s.hint}</p>}
                  <p className="mt-1 text-[11px] text-gray-400">{kindLabel(s.kind)}</p>
                </div>
                <div className="flex shrink-0 items-center">
                  <button onClick={() => move(i, i - 1)} disabled={i === 0} title="Move up" className={iconBtn}><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button onClick={() => move(i, i + 1)} disabled={i === sections.length - 1} title="Move down" className={iconBtn}><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setEditingId(s.id)} title="Edit" className={iconBtn}><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => remove(s)} title="Remove" className={`${iconBtn} hover:text-red-600`}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>

      <AddSection type={type} sections={sections} agenda={agenda} />
    </div>
  );
}

function AddSection({ type, sections, agenda }) {
  const [open, setOpen] = useState(false);
  const present = new Set(sections.map((s) => s.kind));
  const kinds = SECTION_KINDS.filter((k) => (!k.types || k.types.includes(type)) && !(k.once && present.has(k.kind)));

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 bg-white py-3 text-sm font-medium text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50/40">
        <Plus className="h-4 w-4" /> Add a section
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-emerald-200 bg-white p-3">
      <SectionForm
        initial={{ title: '', hint: '', minutes: null, kind: 'items' }}
        kinds={kinds}
        submitLabel="Add section"
        onCancel={() => setOpen(false)}
        onSubmit={async (v) => { if (await agenda.addSection(v)) setOpen(false); }}
      />
    </div>
  );
}

/** Title / type (new sections only) / minutes / hint. */
function SectionForm({ initial, kinds, submitLabel, onSubmit, onCancel }) {
  const [title, setTitle]     = useState(initial.title || '');
  const [hint, setHint]       = useState(initial.hint || '');
  const [minutes, setMinutes] = useState(initial.minutes ?? '');
  const [kind, setKind]       = useState(initial.kind);
  const [saving, setSaving]   = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const m = String(minutes).trim() === '' ? null : Math.max(0, Math.min(240, parseInt(minutes, 10) || 0));
    await onSubmit({ title: title.trim(), hint: hint.trim(), minutes: m, kind });
    setSaving(false);
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_6rem]">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Section title" aria-label="Section title" autoFocus className={input} />
        <input value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Minutes" aria-label="Minutes" inputMode="numeric" className={input} />
      </div>
      {kinds && (
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Section type" className={input}>
          {kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
        </select>
      )}
      <textarea value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Guidance shown under the title (optional)" aria-label="Hint" rows={2} className={input} />
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !title.trim()} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
      </div>
    </form>
  );
}
