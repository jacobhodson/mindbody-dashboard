import { ROLLING_KEY, monthOptions } from '../utils/snapshotPeriods.js';

const btn = (active) => `px-3 py-1.5 font-medium transition-colors ${
  active ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
}`;

/**
 * Period switcher shared by the LER, Group and PT tables: the table's own
 * live periods (This Week / Last Week / ...), then — for managers — a
 * "Rolling 30 Days" button and a month picker, both backed by the nightly
 * snapshot tables (see scheduled-coach-snapshot.js). `livePeriods` may be
 * empty (the LER table is entirely snapshot-backed).
 */
export default function PeriodTabs({ livePeriods = [], value, onChange, showSnapshots, year }) {
  const isMonth = typeof value === 'string' && value.startsWith('m:');
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
        {livePeriods.map((p) => (
          <button key={p.key} onClick={() => onChange(p.key)} className={btn(value === p.key)}>{p.label}</button>
        ))}
        {showSnapshots && (
          <button onClick={() => onChange(ROLLING_KEY)} className={btn(value === ROLLING_KEY)}>Rolling 30 Days</button>
        )}
      </div>
      {showSnapshots && (
        <select
          value={isMonth ? value : ''}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className={`rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
            isMonth ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300 bg-gray-50 text-gray-600'
          }`}
        >
          <option value="">Month…</option>
          {monthOptions(year).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      )}
    </div>
  );
}
