import { useMemo } from 'react';
import { Plane, Check, Ban } from 'lucide-react';
import { useLeave } from '../../utils/useLeave.js';
import { useAllStaff } from '../../utils/useAllStaff.js';
import { typeMeta, formatRange } from '../../utils/leave.js';
import HomeCard from '../HomeCard.jsx';

// Home notice (managers): leave requests waiting on a decision. Same
// "disappears when clear" pattern as MissingRolloverDecisions. Also flags
// when approving would leave the day with someone else already away.
export default function LeaveApprovalsCard({ isManager, onOpenHR }) {
  const { requests, updateRequest } = useLeave();
  const { staffList } = useAllStaff();
  const nameById = useMemo(() => Object.fromEntries(staffList.map((s) => [s.id, s.full_name])), [staffList]);
  const pending = useMemo(
    () => requests.filter((r) => r.status === 'pending').sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [requests],
  );

  if (!isManager || pending.length === 0) return null;

  // Who else is (approved) away during a pending request.
  const clashes = (r) => {
    const others = new Set();
    for (const o of requests) {
      if (o.id === r.id || o.staff_id === r.staff_id || o.status !== 'approved') continue;
      if (o.start_date <= r.end_date && o.end_date >= r.start_date) {
        others.add(nameById[o.staff_id] || '?');
      }
    }
    return [...others];
  };

  return (
    <HomeCard id="leave_approvals" tone="amber" icon={Plane} title="Leave to Approve" count={pending.length}
      actions={onOpenHR && <button onClick={onOpenHR} className="shrink-0 text-xs text-emerald-700 hover:underline">Open Leave Planner</button>}>
      <p className="mb-4 text-xs text-gray-500">Team members waiting on a yes or no for their leave.</p>
      <div className="space-y-2">
        {pending.map((r) => {
          const t = typeMeta(r.leave_type);
          const also = clashes(r);
          return (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{nameById[r.staff_id] || 'Unknown'} · {r.title}</p>
                <p className="text-xs text-gray-500">
                  <span className={`mr-1.5 rounded border px-1.5 py-px ${t.soft}`}>{t.short}</span>
                  {formatRange(r)}
                  {also.length > 0 && <span className="ml-1.5 text-amber-700">· Also away: {also.join(', ')}</span>}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button onClick={() => updateRequest(r.id, { status: 'approved' })} className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20">
                  <Check className="h-3.5 w-3.5" /> Approve
                </button>
                <button onClick={() => updateRequest(r.id, { status: 'declined' })} className="flex items-center gap-1 rounded-lg border border-gray-300 bg-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-300">
                  <Ban className="h-3.5 w-3.5" /> Decline
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </HomeCard>
  );
}
