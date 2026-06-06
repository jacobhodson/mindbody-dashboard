/**
 * Expandable panel shown beneath a client row.
 * Displays their status badge (Red / Moderate / Engaged)
 * and a 4-week bar chart of session counts.
 *
 * Props:
 *   client  — client object with weeklyAttendance: { w1, w2, w3, w4 }
 *   status  — 'red' | 'moderate' | 'engaged'
 */

const STATUS_META = {
  red: {
    label: "Red's List",
    pill:  'text-red-400 bg-red-500/10 border-red-500/20',
    bar:   'bg-red-500/50',
  },
  moderate: {
    label: 'Moderate',
    pill:  'text-orange-400 bg-orange-500/10 border-orange-500/20',
    bar:   'bg-orange-400/60',
  },
  engaged: {
    label: 'Engaged',
    pill:  'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    bar:   'bg-emerald-500/60',
  },
};

export default function WeeklyAttendancePanel({ client, status }) {
  const meta = STATUS_META[status] || STATUS_META.red;
  const wa   = client.weeklyAttendance || { w1: 0, w2: 0, w3: 0, w4: 0 };

  // Ordered oldest → newest (left to right)
  const weeks = [
    { label: 'Wk 4', count: wa.w4 },
    { label: 'Wk 3', count: wa.w3 },
    { label: 'Wk 2', count: wa.w2 },
    { label: 'Wk 1', count: wa.w1, current: true },
  ];

  const peak = Math.max(...weeks.map((w) => w.count), 1);

  return (
    <div className="px-5 pt-3 pb-4 bg-gray-800/20 border-t border-gray-800/50">
      {/* Status */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">Status</span>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${meta.pill}`}>
          {meta.label}
        </span>
      </div>

      {/* 4-week bars */}
      <div className="flex items-end gap-2">
        {weeks.map((w, i) => {
          const pct     = Math.round((w.count / peak) * 100);
          const barH    = Math.max(pct, w.count > 0 ? 8 : 0); // min visible height if >0
          const barCol  = w.current
            ? (w.count > 0 ? meta.bar : 'bg-gray-700/40')
            : 'bg-gray-600/50';

          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              {/* Count above bar */}
              <span className={`text-xs font-semibold tabular-nums ${
                w.current && w.count > 0 ? 'text-gray-200' : 'text-gray-500'
              }`}>
                {w.count}
              </span>

              {/* Bar track */}
              <div className="w-full relative rounded-sm bg-gray-700/30" style={{ height: 36 }}>
                {w.count > 0 && (
                  <div
                    className={`absolute bottom-0 left-0 right-0 rounded-sm transition-all ${barCol}`}
                    style={{ height: `${barH}%` }}
                  />
                )}
              </div>

              {/* Week label */}
              <span className={`text-[10px] font-medium ${
                w.current ? 'text-gray-400' : 'text-gray-600'
              }`}>
                {w.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
