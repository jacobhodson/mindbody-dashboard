import { useState, useEffect, useCallback } from 'react';
import { ListChecks, ChevronDown, Plus, Lock, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { PlaybookPicker } from '../utils/playbookLink.jsx';
import { supabase } from '../lib/supabaseClient.js';

const WEEKS = [1, 2, 3, 4];
const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';
const saveClass  = 'rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50';
const plainClass = 'rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50';

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'action';
}

function StatusBadge({ active }) {
  return active ? (
    <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Active</span>
  ) : (
    <span className="rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Draft</span>
  );
}

// Edit form for one action (or a new one when `action` has no id).
function ActionForm({ action, completions, onSave, onDelete, onCancel }) {
  const [label, setLabel]             = useState(action.label || '');
  const [week, setWeek]               = useState(action.week);
  const [active, setActive]           = useState(action.active ?? false);
  const [description, setDescription] = useState(action.description || '');
  const [script, setScript]           = useState(action.script || '');
  const [playbookPageId, setPlaybookPageId] = useState(action.playbook_page_id || null);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState(null);
  const isNew = !action.id;

  const save = async () => {
    if (!label.trim()) { setError('Give the action a name.'); return; }
    setSaving(true); setError(null);
    const msg = await onSave({ label: label.trim(), week: Number(week), active, description, script, playbook_page_id: playbookPageId });
    setSaving(false);
    if (msg) setError(msg);
  };

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/60 p-4 text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
        <label className="block">
          <span className="text-gray-500">Action name</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Pre-session text" className={`${inputClass} mt-1`} />
        </label>
        <label className="block">
          <span className="text-gray-500">Week</span>
          <select value={week} onChange={(e) => setWeek(e.target.value)} className={`${inputClass} mt-1`}>
            {WEEKS.map((w) => <option key={w} value={w}>Week {w}</option>)}
          </select>
        </label>
        <div>
          <span className="text-gray-500">Status</span>
          <div className="mt-1 flex rounded-lg border border-gray-300 overflow-hidden">
            <button type="button" onClick={() => setActive(false)}
              className={`px-3 py-1.5 font-medium ${!active ? 'bg-gray-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Draft</button>
            <button type="button" onClick={() => setActive(true)}
              className={`px-3 py-1.5 font-medium ${active ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Active</button>
          </div>
        </div>
      </div>

      <label className="block">
        <span className="text-gray-500">What &amp; why</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
          placeholder="What the coach does and why it matters" className={`${inputClass} mt-1`} />
      </label>

      <label className="block">
        <span className="text-gray-500">Script / example</span>
        <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={6}
          placeholder="Hey [Name]! ..." className={`${inputClass} mt-1 font-mono text-[13px]`} />
        <span className="mt-1 block text-[11px] text-gray-400">
          Use [Name] for the client's first name and {'{{BUSINESS_NAME}}'} for the gym's name. Line breaks are kept.
        </span>
      </label>

      <label className="block">
        <span className="text-gray-500">Playbook guide</span>
        <PlaybookPicker value={playbookPageId} onChange={setPlaybookPageId} className={`${inputClass} mt-1`} />
      </label>

      {error && <p className="text-red-600">{error}</p>}

      <div className="flex items-center gap-2 flex-wrap">
        <button disabled={saving} onClick={save} className={saveClass}>{saving ? 'Saving…' : isNew ? 'Add action' : 'Save'}</button>
        <button disabled={saving} onClick={onCancel} className={plainClass}>Cancel</button>
        {!isNew && (
          completions > 0 ? (
            <span className="ml-auto text-[11px] text-gray-400">
              Ticked off for {completions} client{completions === 1 ? '' : 's'} — set to Draft to retire it (deleting would erase that history).
            </span>
          ) : (
            <button disabled={saving} onClick={onDelete}
              className="ml-auto flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          )
        )}
      </div>
    </div>
  );
}

/**
 * Onboarding tab → Pipeline actions (manager only), collapsed at the bottom
 * of the tab. Edits onboarding_task_templates directly — the per-week
 * checklist on every onboarding card. Draft = active false: hidden from the
 * cards (useOnboardingTaskTemplates only loads active rows) but kept, along
 * with any completions already logged against it. New actions start as
 * Draft so a half-written script never shows up on the board.
 *
 * RLS already limits writes to managers ("managers manage onboarding
 * templates"). Delete is only offered for actions with no completions —
 * the completions FK cascades, so deleting a used action would silently
 * erase clients' history. `onChanged` reloads the board's own copy.
 */
export default function OnboardingActionsManager({ isManager, onChanged }) {
  const [open, setOpen]               = useState(false);
  const [actions, setActions]         = useState([]);
  const [completions, setCompletions] = useState({}); // template uuid -> count
  const [loading, setLoading]         = useState(true);
  const [editing, setEditing]         = useState(null); // action id, or `new-<week>`

  const load = useCallback(async () => {
    const [{ data: rows }, { data: done }] = await Promise.all([
      supabase.from('onboarding_task_templates').select('*').order('week').order('sort_order'),
      supabase.from('onboarding_task_completions').select('template_id'),
    ]);
    setActions(rows || []);
    const counts = {};
    for (const r of done || []) counts[r.template_id] = (counts[r.template_id] || 0) + 1;
    setCompletions(counts);
    setLoading(false);
  }, []);

  useEffect(() => { if (isManager && open) load(); }, [isManager, open, load]);

  if (!isManager) return null;

  const afterWrite = async () => { await load(); onChanged?.(); };
  const nextSortOrder = () => actions.reduce((max, a) => Math.max(max, a.sort_order), 0) + 1;

  const saveExisting = (action) => async (fields) => {
    const patch = { ...fields };
    // Moving to another week puts it at the end of that week's list.
    if (fields.week !== action.week) patch.sort_order = nextSortOrder();
    const { error } = await supabase.from('onboarding_task_templates').update(patch).eq('id', action.id);
    if (error) return error.message;
    setEditing(null);
    await afterWrite();
    return null;
  };

  const saveNew = async (fields) => {
    const key = `w${fields.week}-${slug(fields.label)}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabase.from('onboarding_task_templates').insert({ ...fields, key, sort_order: nextSortOrder() });
    if (error) return error.message;
    setEditing(null);
    await afterWrite();
    return null;
  };

  const remove = (action) => async () => {
    if (!window.confirm(`Delete "${action.label}"? This can't be undone.`)) return;
    const { error } = await supabase.from('onboarding_task_templates').delete().eq('id', action.id);
    if (!error) { setEditing(null); await afterWrite(); }
  };

  // Swap sort_order with the neighbour above/below in the same week.
  const move = async (list, idx, dir) => {
    const a = list[idx], b = list[idx + dir];
    if (!b) return;
    await Promise.all([
      supabase.from('onboarding_task_templates').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('onboarding_task_templates').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
    await afterWrite();
  };

  const activeCount = actions.filter((a) => a.active).length;
  const draftCount  = actions.length - activeCount;

  return (
    <div className="rounded-xl border border-gray-200 bg-white flex flex-col">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 px-5 py-3 text-left">
        <ListChecks className="h-4 w-4 text-emerald-600" />
        <h2 className="text-sm font-semibold text-gray-900">Pipeline actions</h2>
        <span className="flex items-center gap-1 rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
          <Lock className="h-2.5 w-2.5" /> Manager
        </span>
        {open && !loading && (
          <span className="text-xs text-gray-400">{activeCount} active · {draftCount} draft</span>
        )}
        <ChevronDown className={`ml-auto h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-gray-200 px-5 py-4 space-y-6">
          <p className="text-xs text-gray-500">
            The checklist on every onboarding card. Active actions show on the cards for that week; Drafts are hidden until you switch them on.
          </p>

          {loading ? (
            <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
          ) : WEEKS.map((w) => {
            const list = actions.filter((a) => a.week === w);
            return (
              <div key={w}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Week {w}</h3>
                  <button onClick={() => setEditing(`new-${w}`)}
                    className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50">
                    <Plus className="h-3 w-3" /> Add action
                  </button>
                </div>

                <div className="space-y-2">
                  {editing === `new-${w}` && (
                    <ActionForm action={{ week: w, active: false }} onSave={saveNew} onCancel={() => setEditing(null)} />
                  )}

                  {list.length === 0 && editing !== `new-${w}` && (
                    <p className="text-xs text-gray-400">No actions for week {w} yet.</p>
                  )}

                  {list.map((a, i) => (
                    editing === a.id ? (
                      <ActionForm key={a.id} action={a} completions={completions[a.id] || 0}
                        onSave={saveExisting(a)} onDelete={remove(a)} onCancel={() => setEditing(null)} />
                    ) : (
                      <div key={a.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${a.active ? 'border-gray-200' : 'border-dashed border-gray-300 bg-gray-50/50'}`}>
                        <div className="flex flex-col">
                          <button onClick={() => move(list, i, -1)} disabled={i === 0} title="Move up"
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-20"><ArrowUp className="h-3.5 w-3.5" /></button>
                          <button onClick={() => move(list, i, 1)} disabled={i === list.length - 1} title="Move down"
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-20"><ArrowDown className="h-3.5 w-3.5" /></button>
                        </div>
                        <button onClick={() => setEditing(a.id)} className="min-w-0 flex-1 text-left">
                          <span className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${a.active ? 'text-gray-900' : 'text-gray-500'}`}>{a.label}</span>
                            <StatusBadge active={a.active} />
                          </span>
                          {a.description && <span className="mt-0.5 block truncate text-xs text-gray-500">{a.description}</span>}
                        </button>
                        <button onClick={() => setEditing(a.id)} className="shrink-0 text-xs font-medium text-emerald-700 hover:underline">Edit</button>
                      </div>
                    )
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
