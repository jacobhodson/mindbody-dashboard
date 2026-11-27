import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ROCK_STATUSES, ROCK_PRIORITIES } from '../utils/rocks.js';
import { canEditRock } from '../utils/useRocks.js';
import LinkedTaskList, { TaskForm } from './LinkedTaskList.jsx';

/**
 * One block of the annual planning day (meeting_sections kind
 * 'planning_block'). Everything is driven by section.config — see
 * 20261127000000_annual_planning.sql — and renders in this order:
 *   prompts  read-only discussion prompts
 *   tables   editable grids (useMeetingTables); fixed rows come from config,
 *            with optional default values, and add_rows lets people add more
 *   lists    entries people add (same meeting_items lists as other meetings)
 *   rocks    rocks created here (real rocks, tagged with this meeting)
 *   todos    tasks scoped to this block (task_templates.meeting_section),
 *            with optional one-click suggestions
 */
export default function PlanningBlock({ section, ctx, tables, renderList, onOpenRocks }) {
  const cfg = section.config || {};
  return (
    <div className="space-y-4">
      {cfg.goal && <p className="text-sm text-gray-700">{cfg.goal}</p>}

      {cfg.prompts?.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {cfg.prompts.map((p) => (
            <div key={p.title} className="rounded-lg border border-violet-100 bg-violet-50/50 p-3">
              <h4 className="mb-1 text-xs font-semibold text-violet-900">{p.title}</h4>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-violet-900/90">
                {p.bullets.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      {(cfg.tables || []).map((t) => (
        <PlanningTable
          key={t.key}
          table={t}
          sectionKey={`${section.key}:${t.key}`}
          tables={tables}
          staffList={ctx.staffList}
        />
      ))}

      {cfg.lists?.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {cfg.lists.map((l) => (
            <div key={l.key} className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
              <h4 className="mb-1.5 text-xs font-semibold text-gray-700">{l.title}</h4>
              {renderList(`${section.key}:${l.key}`)}
            </div>
          ))}
        </div>
      )}

      {cfg.rocks && <PlanningRocks section={section} ctx={ctx} onOpenRocks={onOpenRocks} />}

      {cfg.todos && <PlanningTodos section={section} ctx={ctx} />}
    </div>
  );
}

// ── Tables ─────────────────────────────────────────────────────────────────

const GROUP_OWNERS = ['Founders', 'GM', 'Lead Coaches', 'Team', 'Facilitator'];
const cellInput = 'w-full min-w-[6rem] rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-gray-900 hover:border-gray-200 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400';

function PlanningTable({ table, sectionKey, tables, staffList }) {
  const saved = tables.rows.filter((r) => r.section === sectionKey);
  const byKey = Object.fromEntries(saved.map((r) => [r.row_key, r]));
  const fixed = (table.rows || []).map((row, i) => ({
    key: `r${i}`, sort: i, label: row.label, defaults: row.values || {}, saved: byKey[`r${i}`], fixed: true,
  }));
  const added = saved
    .filter((r) => !/^r\d+$/.test(r.row_key))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({ key: r.row_key, sort: r.sort_order, defaults: {}, saved: r, fixed: false }));
  const rows = [...fixed, ...added];
  const listId = `owners-${sectionKey}`;
  const owners = useMemo(() => [...GROUP_OWNERS, ...staffList.map((s) => s.full_name)], [staffList]);

  return (
    <div>
      {table.title && <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{table.title}</h4>}
      <datalist id={listId}>{owners.map((o) => <option key={o} value={o} />)}</datalist>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
              {table.columns.map((c) => <th key={c.key} className="px-2 py-1.5 font-medium">{c.label}</th>)}
              {table.add_rows && <th className="w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.key} className="align-top">
                {table.columns.map((c) => {
                  if (c.fixed && row.fixed) {
                    return <td key={c.key} className="whitespace-nowrap px-2 py-1.5 font-medium text-gray-800">{row.label}</td>;
                  }
                  const value = row.saved?.cells?.[c.key] ?? row.defaults[c.key] ?? '';
                  return (
                    <td key={c.key} className="px-0.5 py-0.5">
                      <Cell
                        column={c}
                        value={value}
                        listId={listId}
                        label={`${c.label}${row.label ? ` for ${row.label}` : ''}`}
                        onSave={(v) => tables.saveCell(sectionKey, row.key, c.key, v, row.sort)}
                      />
                    </td>
                  );
                })}
                {table.add_rows && (
                  <td className="px-1 py-1.5">
                    {!row.fixed && (
                      <button
                        onClick={() => { if (window.confirm('Delete this row?')) tables.deleteRow(row.saved.id); }}
                        title="Delete row"
                        className="text-gray-300 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={table.columns.length + 1} className="px-2 py-2 text-xs text-gray-500">No rows yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {table.add_rows && (
        <button
          onClick={() => tables.addRow(sectionKey, 1000 + added.length)}
          className="mt-1.5 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-500/10"
        >
          <Plus className="h-3.5 w-3.5" /> Add row
        </button>
      )}
    </div>
  );
}

/** One editable cell — saves when you leave it (selects save on change). */
function Cell({ column, value, listId, label, onSave }) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(value); }, [value, focused]);

  const commit = () => {
    setFocused(false);
    if (draft !== value) onSave(draft);
  };

  if (column.type === 'select') {
    return (
      <select value={value} onChange={(e) => onSave(e.target.value)} aria-label={label} className={cellInput}>
        <option value="">—</option>
        {column.options.map((o) => <option key={o} value={o}>{o}</option>)}
        {value && !column.options.includes(value) && <option value={value}>{value}</option>}
      </select>
    );
  }
  const shared = {
    value: draft,
    onFocus: () => setFocused(true),
    onChange: (e) => setDraft(e.target.value),
    onBlur: commit,
    'aria-label': label,
  };
  if (column.type === 'date' || column.type === 'person') {
    return (
      <input
        {...shared}
        type={column.type === 'date' ? 'date' : 'text'}
        list={column.type === 'person' ? listId : undefined}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className={cellInput}
      />
    );
  }
  // Free text wraps and grows with its content; Enter saves, Shift+Enter
  // adds a line.
  return (
    <textarea
      {...shared}
      rows={1}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }}
      className={`${cellInput} block resize-none [field-sizing:content]`}
    />
  );
}

// ── Rocks ──────────────────────────────────────────────────────────────────

const smallInput = 'rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-70';

function PlanningRocks({ section, ctx, onOpenRocks }) {
  const { meeting, staff, isManager, staffList, rocksApi } = ctx;
  const due = section.config.rocks.due || '';
  const mine = rocksApi.rocks.filter((r) => r.meeting_id === meeting.id);
  const [title, setTitle]   = useState('');
  const [owner, setOwner]   = useState('');
  const [busy, setBusy]     = useState(false);

  const add = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const created = await rocksApi.createRock({
      title: title.trim(), owner_staff_id: owner || null, due_date: due || null, meeting_id: meeting.id, status: 'planned',
    });
    setBusy(false);
    if (created) { setTitle(''); setOwner(''); }
  };

  return (
    <div>
      {rocksApi.error && <p className="mb-1 text-xs text-red-600">{rocksApi.error}</p>}
      {mine.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="pb-2 font-medium">Rock</th>
                <th className="pb-2 font-medium">Owner</th>
                <th className="pb-2 font-medium">Due</th>
                <th className="pb-2 font-medium">Priority</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mine.map((rock) => {
                const editable = canEditRock(rock, staff, isManager);
                const update = (patch) => rocksApi.updateRock(rock.id, patch);
                return (
                  <tr key={rock.id}>
                    <td className="py-1.5 pr-3">
                      {onOpenRocks
                        ? <button onClick={() => onOpenRocks(rock.id)} className="text-left text-gray-900 hover:text-emerald-700 hover:underline">{rock.title}</button>
                        : <span className="text-gray-900">{rock.title}</span>}
                    </td>
                    <td className="py-1.5 pr-2">
                      <select disabled={!isManager} value={rock.owner_staff_id || ''} onChange={(e) => update({ owner_staff_id: e.target.value || null })} aria-label={`Owner of ${rock.title}`} className={smallInput}>
                        <option value="">Unassigned</option>
                        {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <input type="date" disabled={!editable} value={rock.due_date || ''} onChange={(e) => update({ due_date: e.target.value || null })} aria-label={`Due date for ${rock.title}`} className={smallInput} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select disabled={!editable} value={rock.priority || ''} onChange={(e) => update({ priority: e.target.value || null })} aria-label={`Priority for ${rock.title}`} className={smallInput}>
                        <option value="">Not set</option>
                        {ROCK_PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5">
                      <select disabled={!editable} value={rock.status} onChange={(e) => update({ status: e.target.value })} aria-label={`Status for ${rock.title}`} className={smallInput}>
                        {ROCK_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {mine.length === 0 && <p className="text-xs text-gray-500">No rocks set yet.</p>}
      {isManager && (
        <form onSubmit={add} className="mt-2 flex flex-wrap items-center gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New rock…" aria-label="New rock title" className={`${smallInput} min-w-[14rem] flex-1 py-1.5 text-sm`} />
          <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="New rock owner" className={`${smallInput} py-1.5`}>
            <option value="">Owner…</option>
            {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
          <button type="submit" disabled={busy || !title.trim()} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40">
            Add rock
          </button>
          {due && <span className="text-[11px] text-gray-400">Due {format(parseISO(due), 'd MMM yyyy')}</span>}
        </form>
      )}
      {onOpenRocks && mine.length > 0 && (
        <button onClick={() => onOpenRocks(null)} className="mt-2 flex items-center gap-1 text-xs text-emerald-700 hover:underline">
          Open Rocks <ExternalLink className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ── Tasks ──────────────────────────────────────────────────────────────────

function PlanningTodos({ section, ctx }) {
  const { meeting, todos, staff, staffList, isManager, rocks, defaultDue } = ctx;
  const cfg = section.config.todos;
  const list = todos.tasks.filter((t) => t.meeting_id === meeting.id && t.meeting_section === section.key);
  const have = new Set(list.map((t) => t.label.trim().toLowerCase()));
  const suggestions = (cfg.suggestions || []).filter((s) => !have.has(s.trim().toLowerCase()));
  const [picked, setPicked] = useState(null);
  const extra = { meeting_id: meeting.id, meeting_section: section.key };

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <h4 className="mb-1 text-xs font-semibold text-gray-700">Tasks</h4>
      <LinkedTaskList
        tasks={list}
        linked={todos}
        staff={staff}
        staffList={staffList}
        isManager={isManager}
        extraFields={extra}
        rocks={rocks}
        defaultDue={defaultDue}
        addLabel={cfg.label || 'Add task'}
        emptyText="No tasks yet."
      />
      {suggestions.length > 0 && !picked && (
        <div className="mt-2">
          <p className="mb-1 text-[11px] text-gray-400">From the template — click to assign:</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} onClick={() => setPicked(s)} className="rounded-full border border-dashed border-gray-300 px-2.5 py-0.5 text-left text-xs text-gray-600 hover:border-emerald-400 hover:text-emerald-700">
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
      {picked && (
        <TaskForm
          staff={staff}
          staffList={staffList}
          rocks={rocks}
          initial={{ label: picked, assignee: staff?.id || '', due_date: defaultDue }}
          submitLabel="Add"
          onCancel={() => setPicked(null)}
          onSubmit={async (fields) => {
            if (await todos.addTask({ ...fields, ...extra })) setPicked(null);
          }}
        />
      )}
    </div>
  );
}
