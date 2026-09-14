import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';
import { UserPlus2 } from 'lucide-react';
import { useUnallocatedClients } from '../utils/useUnallocatedClients.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import { GROUP_VALUE, caseloadPayloadFor } from '../utils/caseload.js';

function daysAgoLabel(creationDate) {
  if (!creationDate) return null;
  const days = differenceInCalendarDays(startOfDay(new Date()), parseISO(creationDate));
  if (days <= 0) return 'Started today';
  if (days === 1) return 'Started yesterday';
  return `Started ${days} days ago`;
}

const selectClass = 'rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';

// Home-page notice: new (last-30-day) clients with no caseload owner yet.
// Deliberately actionable by any signed-in staff, not just managers — see
// assign_client_caseload_rpc migration — since the ask was for this to be
// something "anyone on the team" can pick up and clear, not a manager
// approval queue. A row disappears the moment it's assigned; the panel
// itself disappears once nothing's left to allocate.
export default function NewClientsToAllocate({ onViewClient }) {
  const { clients, loading, allocate } = useUnallocatedClients();
  const { staffList } = useAllStaff();

  if (loading || clients.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50/40 p-5">
      <div className="flex items-center gap-2 mb-1">
        <UserPlus2 className="h-4 w-4 text-amber-600" />
        <h2 className="font-semibold text-gray-900">New Clients to Allocate</h2>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
          {clients.length}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-4">Started in the last 30 days and don't have anyone owning their caseload yet — anyone can pick these up.</p>

      <div className="space-y-2">
        {clients.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5"
          >
            <button
              onClick={() => onViewClient?.(c.mindbody_id)}
              className="text-left min-w-0"
            >
              <p className="font-medium text-gray-900 text-sm truncate hover:underline">
                {`${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown'}
              </p>
              <p className="text-xs text-gray-500">{daysAgoLabel(c.creation_date)}</p>
            </button>

            <select
              defaultValue=""
              onChange={(e) => e.target.value && allocate(c.id, caseloadPayloadFor(e.target.value))}
              className={selectClass}
            >
              <option value="" disabled>Assign to…</option>
              <option value={GROUP_VALUE}>Group Program</option>
              {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
