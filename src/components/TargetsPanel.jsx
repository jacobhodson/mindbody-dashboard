import { useState } from 'react';
import { Target, Plus, Pencil, Check, X } from 'lucide-react';
import { useTargets } from '../utils/useTargets.js';

const CADENCE_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

function TargetRow({ target, isManager, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState(target.target_value);

  const save = async () => {
    await onSave(target.id, { target_value: Number(value) });
    setEditing(false);
  };

  return (
    <li className="flex items-center justify-between py-2.5 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-gray-900 truncate">{target.label || target.metric_key}</p>
        <p className="text-[11px] text-gray-500">
          {CADENCE_LABEL[target.cadence]} · {target.scope === 'team' ? 'Team' : 'Individual'}
        </p>
      </div>
      {editing ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-20 rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button onClick={save} className="text-emerald-600 hover:text-emerald-700"><Check className="h-4 w-4" /></button>
          <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold tabular-nums text-gray-900">{target.target_value}</span>
          {isManager && (
            <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-gray-700">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function NewTargetForm({ onCreate, onClose }) {
  const [metricKey, setMetricKey] = useState('');
  const [label, setLabel]         = useState('');
  const [cadence, setCadence]     = useState('weekly');
  const [scope, setScope]         = useState('team');
  const [value, setValue]         = useState('');
  const [busy, setBusy]           = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!metricKey.trim() || !value) return;
    setBusy(true);
    await onCreate({
      metric_key: metricKey.trim(),
      label: label.trim() || metricKey.trim(),
      cadence,
      scope,
      target_value: Number(value),
    });
    setBusy(false);
    onClose();
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 border-t border-gray-200 pt-3">
      <div className="flex flex-wrap gap-2">
        <input type="text" required placeholder="Metric key (e.g. new_members)" value={metricKey}
          onChange={(e) => setMetricKey(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <input type="text" placeholder="Label" value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <select value={cadence} onChange={(e) => setCadence(e.target.value)} className="rounded-lg border border-gray-300 bg-gray-50 px-2 py-1.5 text-gray-900">
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="rounded-lg border border-gray-300 bg-gray-50 px-2 py-1.5 text-gray-900">
          <option value="team">Team</option>
          <option value="individual">Individual</option>
        </select>
        <input type="number" required placeholder="Target value" value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-28 rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-gray-900" />
        <button type="submit" disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
          Add
        </button>
      </div>
    </form>
  );
}

export default function TargetsPanel({ staff, isManager }) {
  const { targets, loading, error, createTarget, updateTarget } = useTargets(staff);
  const [showNew, setShowNew] = useState(false);

  if (loading) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-gray-900">This week's targets</h3>
        </div>
        {isManager && !showNew && (
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
          >
            <Plus className="h-3.5 w-3.5" /> New target
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {targets.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No targets set yet.</p>
      ) : (
        <ul className="mt-1 divide-y divide-gray-200">
          {targets.map((t) => (
            <TargetRow key={t.id} target={t} isManager={isManager} onSave={updateTarget} />
          ))}
        </ul>
      )}

      {isManager && showNew && (
        <NewTargetForm onCreate={createTarget} onClose={() => setShowNew(false)} />
      )}
    </div>
  );
}
