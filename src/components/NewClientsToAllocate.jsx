import { UserPlus2 } from 'lucide-react';
import { useUnallocatedClients } from '../utils/useUnallocatedClients.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import { GROUP_VALUE, caseloadPayloadFor } from '../utils/caseload.js';
import { daysAgoLabel } from '../utils/dateLabels.js';
import { useSaleOnAllocate } from '../utils/mindbodySales.js';
import HomeCard from './HomeCard.jsx';

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
  const sale = useSaleOnAllocate();

  if (loading || clients.length === 0) return null;

  return (
    <HomeCard id="new_clients" tone="amber" icon={UserPlus2} title="New Clients to Allocate" count={clients.length}>
      <p className="text-xs text-gray-500 mb-4">Started in the last 30 days and don't have anyone owning their caseload yet — anyone can pick these up. Ticked clients add to Sales when assigned.</p>
      {sale.error && <p className="mb-3 text-xs text-red-600">{sale.error}</p>}

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

            <div className="flex items-center gap-3 shrink-0">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={sale.countsAsSale(c.id)} onChange={() => sale.toggle(c.id)} className="accent-emerald-600" />
                Count as sale
              </label>
              <select
                value=""
                onChange={(e) => {
                  const payload = caseloadPayloadFor(e.target.value);
                  sale.allocateWithSale(c, () => allocate(c.id, payload));
                }}
                className={selectClass}
              >
                <option value="" disabled>Assign to…</option>
                <option value={GROUP_VALUE}>Group Program</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
    </HomeCard>
  );
}
