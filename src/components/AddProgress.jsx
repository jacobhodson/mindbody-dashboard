import { useState } from 'react';
import { X } from 'lucide-react';

/**
 * "+N" add-to-progress control — click to reveal a number input, submit
 * ADDS that amount (never overwrites). Shared by target cards in
 * WinTheWeek.jsx/Scoreboard.jsx (adds to a metric's daily metric_actuals
 * row) and count-type task rows in TaskChecklist.jsx (adds to that
 * period's task_completions.value) — same interaction either way.
 */
export default function AddProgress({ onAdd, label = 'Update metric' }) {
  const [open, setOpen]   = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy]   = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300 transition-colors"
      >
        {label}
      </button>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(value);
    if (!n) { setOpen(false); return; }
    setBusy(true);
    await onAdd(n);
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
