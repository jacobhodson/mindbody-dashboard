import { useState, useMemo } from 'react';
import { Search, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAllClients } from '../utils/useAllClients.js';
import { useAllStaff } from '../utils/useAllStaff.js';

export default function ClientsList({ onSelect, initialSearch }) {
  const { clientsList, loading } = useAllClients();
  const { staffList } = useAllStaff();
  const [search, setSearch] = useState(initialSearch || '');

  const staffNameById = useMemo(() => {
    const m = {};
    for (const s of staffList) m[s.id] = s.full_name;
    return m;
  }, [staffList]);

  const filtered = useMemo(() => {
    if (!search) return clientsList;
    const q = search.toLowerCase();
    return clientsList.filter((c) =>
      `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.mobile_phone?.includes(q)
    );
  }, [clientsList, search]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white flex flex-col">
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-200">
        <div>
          <h2 className="font-semibold text-gray-900">Clients</h2>
          <p className="text-xs text-gray-500 mt-0.5">{clientsList.length} total</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or phone…"
            className="w-full rounded-lg border border-gray-300 bg-gray-50 pl-8 pr-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="px-5 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Assigned to</th>
              <th className="px-3 py-2 font-medium">Next programme due</th>
              <th className="px-3 py-2 font-medium">Last visit</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200/60">
            {loading && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Loading clients…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No clients match your search</td></tr>
            )}
            {!loading && filtered.map((c) => (
              <tr
                key={c.id}
                onClick={() => onSelect(c.mindbody_id)}
                className="cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <td className="px-5 py-2.5">
                  <p className="font-medium text-gray-900">{`${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown'}</p>
                  <p className="text-xs text-gray-500">{c.email || c.mobile_phone || '—'}</p>
                </td>
                <td className="px-3 py-2.5 text-gray-600">{c.status || '—'}</td>
                <td className="px-3 py-2.5 text-gray-600">{staffNameById[c.assigned_staff_id] || '—'}</td>
                <td className="px-3 py-2.5 text-gray-600">
                  {c.next_program_due ? format(parseISO(c.next_program_due), 'd MMM yyyy') : '—'}
                </td>
                <td className="px-3 py-2.5 text-gray-600">
                  {c.last_visit_date ? format(parseISO(c.last_visit_date), 'd MMM yyyy') : '—'}
                </td>
                <td className="px-3 py-2.5 text-gray-400">
                  <ChevronRight className="h-4 w-4" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
