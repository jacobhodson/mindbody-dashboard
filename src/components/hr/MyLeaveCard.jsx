import { useMemo } from 'react';
import { Plane } from 'lucide-react';
import { useLeave } from '../../utils/useLeave.js';
import { typeMeta, formatRange, STATUS_BY_KEY, todayIso } from '../../utils/leave.js';

const RECENT_MS = 7 * 86400000;

// Home notice, private to each person: your own upcoming leave (not yet
// finished) that's still waiting on a manager, or was approved/declined in
// the last week. Only ever lists the signed-in person's requests — nobody
// sees anyone else's here.
export default function MyLeaveCard({ staff, onOpenHR }) {
  const { requests } = useLeave();
  const today = todayIso();
  const mine = useMemo(() => requests
    .filter((r) => r.staff_id === staff?.id && r.end_date >= today && (
      r.status === 'pending'
      || (r.decided_at && Date.now() - new Date(r.decided_at).getTime() < RECENT_MS)
    ))
    .sort((a, b) => a.start_date.localeCompare(b.start_date)), [requests, staff, today]);

  if (mine.length === 0) return null;

  return (
    <div className="rounded-xl border border-sky-300/60 bg-sky-50/40 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Plane className="h-4 w-4 text-sky-600" />
        <h2 className="font-semibold text-gray-900">My Leave</h2>
        {onOpenHR && <button onClick={onOpenHR} className="ml-auto text-xs text-emerald-700 hover:underline">Open Leave Planner</button>}
      </div>
      <div className="space-y-2">
        {mine.map((r) => {
          const t = typeMeta(r.leave_type);
          const st = STATUS_BY_KEY[r.status];
          return (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{r.title}</p>
                <p className="text-xs text-gray-500">
                  <span className={`mr-1.5 rounded border px-1.5 py-px ${t.soft}`}>{t.short}</span>
                  {formatRange(r)}
                </p>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${st.pill}`}>
                {r.status === 'pending' ? 'Waiting on approval' : st.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
