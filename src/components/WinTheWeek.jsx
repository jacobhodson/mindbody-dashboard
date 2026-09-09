import { useState, useMemo } from 'react';
import { Target, Plus, Pencil, X, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useTargets } from '../utils/useTargets.js';
import { useWinTheWeek } from '../utils/useWinTheWeek.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import { renderFormatted } from '../utils/richText.js';
import RichTextField from './RichTextField.jsx';

const DEPARTMENTS = [
  { key: 'operations',  label: 'Operations' },
  { key: 'acquisition', label: 'Acquisition' },
];

function slugify(label) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function UpdateMetric({ onLog }) {
  const [open, setOpen]   = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy]   = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300 transition-colors"
      >
        Update metric
      </button>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(value);
    if (!n) { setOpen(false); return; }
    setBusy(true);
    await onLog(n);
    setBusy(false);
    setValue('');
    setOpen(false);
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <input
        type="number"
        autoFocus
        placeholder="+N"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <button type="submit" disabled={busy} className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">Add</button>
      <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X className="h-3.5 w-3.5" /></button>
    </form>
  );
}

function TargetCard({ target, actual, lastUpdated, isManager, staff, staffList, onLog, onEdit, onArchive }) {
  const ownerIds = (target.target_owners || []).map((o) => o.staff_id);
  const ownerNames = ownerIds.map((id) => staffList.find((s) => s.id === id)?.full_name).filter(Boolean).join('/');
  const canUpdate = isManager || ownerIds.includes(staff?.id);
  const remaining = Math.max(0, target.target_value - actual);
  const pct = target.target_value > 0 ? Math.min(100, Math.round((actual / target.target_value) * 100)) : 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{renderFormatted(target.label || target.metric_key)}</p>
          {ownerNames && <p className="text-xs text-gray-500">{ownerNames}</p>}
        </div>
        {isManager && (
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={onEdit} className="text-gray-400 hover:text-gray-700"><Pencil className="h-3.5 w-3.5" /></button>
            <button
              onClick={() => { if (window.confirm(`Archive "${target.label || target.metric_key}"?`)) onArchive(); }}
              className="text-gray-400 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="font-semibold tabular-nums text-gray-900">{actual} / {target.target_value}</span>
        <span className="text-xs text-gray-500">{remaining} remaining</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-3 flex items-center justify-between">
        {canUpdate ? <UpdateMetric onLog={(n) => onLog(target.metric_key, n)} /> : <span />}
        <span className="text-[10px] text-gray-400">
          {lastUpdated ? `Updated ${formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })}` : 'No updates yet'}
        </span>
      </div>
    </div>
  );
}

function TargetForm({ initial, department, staffList, onSubmit, onClose }) {
  const [label, setLabel]           = useState(initial?.label || '');
  const [targetValue, setTargetValue] = useState(initial?.target_value ?? '');
  const [ownerIds, setOwnerIds]     = useState((initial?.target_owners || []).map((o) => o.staff_id));
  const [busy, setBusy]             = useState(false);

  const toggleOwner = (id) => setOwnerIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!label.trim() || !targetValue) return;
    setBusy(true);
    await onSubmit({ label: label.trim(), target_value: Number(targetValue), ownerIds });
    setBusy(false);
    onClose();
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">{initial ? 'Edit target' : `New ${department} target`}</h4>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
      </div>
      <RichTextField value={label} onChange={setLabel} placeholder="e.g. 30 Referral Asks" />
      <input
        type="number"
        required
        placeholder="Target value"
        value={targetValue}
        onChange={(e) => setTargetValue(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <div>
        <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Owners</p>
        <div className="flex flex-wrap gap-1.5">
          {staffList.map((s) => (
            <label key={s.id} className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs cursor-pointer transition-colors ${ownerIds.includes(s.id) ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-300 bg-gray-50 text-gray-600'}`}>
              <input type="checkbox" className="hidden" checked={ownerIds.includes(s.id)} onChange={() => toggleOwner(s.id)} />
              {s.full_name}
            </label>
          ))}
        </div>
      </div>
      <button type="submit" disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
        {initial ? 'Save' : 'Add target'}
      </button>
    </form>
  );
}

export default function WinTheWeek({ staff, isManager }) {
  const { targets, loading: targetsLoading, error, createTarget, updateTarget, archiveTarget, addOwner, removeOwner } = useTargets(staff);
  const { wtwTargets, actualFor, lastUpdatedFor, logProgress } = useWinTheWeek(targets);
  const { staffList } = useAllStaff();
  const [addingTo, setAddingTo] = useState(null); // department key, or null
  const [editingId, setEditingId] = useState(null); // target id, or null

  const byDepartment = useMemo(() => {
    const m = { operations: [], acquisition: [] };
    for (const t of wtwTargets) m[t.department]?.push(t);
    return m;
  }, [wtwTargets]);

  const handleCreate = async (dept, { label, target_value, ownerIds }) => {
    const created = await createTarget({
      metric_key:   `${slugify(label)}_${Date.now()}`,
      label,
      cadence:      'weekly',
      scope:        'team',
      target_value,
      department:   dept,
    });
    if (created) for (const staffId of ownerIds) await addOwner(created.id, staffId);
  };

  const handleEdit = async (target, { label, target_value, ownerIds }) => {
    await updateTarget(target.id, { label, target_value });
    const current = (target.target_owners || []).map((o) => o.staff_id);
    for (const id of ownerIds) if (!current.includes(id)) await addOwner(target.id, id);
    for (const id of current) if (!ownerIds.includes(id)) await removeOwner(target.id, id);
  };

  if (targetsLoading) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-gray-900">Win the Week</h3>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {DEPARTMENTS.map((dept) => (
          <div key={dept.key} className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{dept.label}</h4>
              {isManager && addingTo !== dept.key && (
                <button onClick={() => setAddingTo(dept.key)} className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900">
                  <Plus className="h-3.5 w-3.5" /> Add target
                </button>
              )}
            </div>

            {byDepartment[dept.key].length === 0 && addingTo !== dept.key && (
              <p className="text-xs text-gray-400">No targets yet.</p>
            )}

            {byDepartment[dept.key].map((target) => (
              editingId === target.id ? (
                <TargetForm
                  key={target.id}
                  initial={target}
                  department={dept.label}
                  staffList={staffList}
                  onSubmit={(fields) => handleEdit(target, fields)}
                  onClose={() => setEditingId(null)}
                />
              ) : (
                <TargetCard
                  key={target.id}
                  target={target}
                  actual={actualFor(target)}
                  lastUpdated={lastUpdatedFor(target)}
                  isManager={isManager}
                  staff={staff}
                  staffList={staffList}
                  onLog={logProgress}
                  onEdit={() => setEditingId(target.id)}
                  onArchive={() => archiveTarget(target.id)}
                />
              )
            ))}

            {isManager && addingTo === dept.key && (
              <TargetForm
                department={dept.label}
                staffList={staffList}
                onSubmit={(fields) => handleCreate(dept.key, fields)}
                onClose={() => setAddingTo(null)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
