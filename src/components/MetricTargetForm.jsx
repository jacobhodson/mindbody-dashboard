import { useState } from 'react';
import { X } from 'lucide-react';
import RichTextField from './RichTextField.jsx';

// Mindbody feeds these two metric_keys automatically every night
// (scheduled-daily-refresh.js) — creating a target against them (rather
// than a fresh slugified key from a typed label) is what actually hooks a
// new target up to that already-flowing data instead of starting an empty,
// disconnected counter.
const KNOWN_METRICS = [
  { key: 'attendance_visits', label: 'Attendance (Mindbody)' },
  { key: 'revenue',           label: 'Revenue (Mindbody)' },
];

/**
 * Create or edit one metric's weekly and/or monthly target together —
 * shared by WinTheWeek.jsx (passes a `department`) and Scoreboard.jsx
 * (doesn't). Editing an existing metric that only has a weekly row today:
 * just fill in the monthly value too and save — it's added as a second
 * row sharing the same metric_key (see useTargets.js's saveMetricTargets),
 * not a disconnected new metric.
 */
export default function MetricTargetForm({ initial, department, staffList, onSubmit, onClose }) {
  const [metricChoice, setMetricChoice] = useState('custom'); // 'custom' | 'attendance_visits' | 'revenue'
  const [label, setLabel]             = useState(initial?.label || '');
  const [weeklyValue, setWeeklyValue] = useState(initial?.weeklyTarget?.target_value ?? '');
  const [monthlyValue, setMonthlyValue] = useState(initial?.monthlyTarget?.target_value ?? '');
  const [recurring, setRecurring]     = useState(
    initial ? !(initial.weeklyTarget?.effective_to || initial.monthlyTarget?.effective_to) : true
  );
  const [ownerIds, setOwnerIds]       = useState(initial?.owners || []);
  const [busy, setBusy]               = useState(false);

  const toggleOwner = (id) => setOwnerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const known = KNOWN_METRICS.find((m) => m.key === metricChoice);
  const effectiveLabel = !initial && known ? known.label : label;

  const submit = async (e) => {
    e.preventDefault();
    if (!effectiveLabel.trim()) return;
    if (weeklyValue === '' && monthlyValue === '') return;
    setBusy(true);
    await onSubmit({
      existingMetricKey: initial?.metricKey || (known ? known.key : undefined),
      label: effectiveLabel.trim(),
      department,
      owners: ownerIds,
      recurring,
      weeklyValue,
      monthlyValue,
    });
    setBusy(false);
    onClose();
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">{initial ? 'Edit metric' : department ? `New ${department} metric` : 'New metric'}</h4>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
      </div>
      {!initial && (
        <select
          value={metricChoice}
          onChange={(e) => setMetricChoice(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900"
        >
          <option value="custom">Custom metric (staff-logged)</option>
          {KNOWN_METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      )}
      {(initial || metricChoice === 'custom') && (
        <RichTextField value={label} onChange={setLabel} placeholder="e.g. Sales, Leads, Rollovers" />
      )}

      <div className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-[140px]">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Weekly target</p>
          <input
            type="number"
            placeholder="e.g. 7"
            value={weeklyValue}
            onChange={(e) => setWeeklyValue(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Monthly target</p>
          <input
            type="number"
            placeholder="e.g. 30"
            value={monthlyValue}
            onChange={(e) => setMonthlyValue(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>
      <p className="text-[10px] text-gray-400">A weekly target's total rolls into the monthly one automatically — no need to log progress twice.</p>

      <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
        <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
        Recurring (ongoing every week/month) — uncheck for a once-off target for just the current period
      </label>

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
        {initial ? 'Save' : 'Add metric'}
      </button>
    </form>
  );
}
