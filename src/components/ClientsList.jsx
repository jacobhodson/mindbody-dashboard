import { useState, useMemo } from 'react';
import { Search, ChevronRight, AlertCircle } from 'lucide-react';
import { format, parseISO, differenceInCalendarDays, endOfWeek, endOfMonth, startOfDay } from 'date-fns';
import { useAllClients } from '../utils/useAllClients.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import { useMembershipPackages } from '../utils/useMembershipPackages.js';

// "Starters" = created in the last 30 days — new clients who likely still
// need a package manually allocated.
const STARTER_DAYS = 30;

function dueBucketFor(nextProgramDue, today) {
  if (!nextProgramDue) return 'not_set';
  const due = parseISO(nextProgramDue);
  if (due < today) return 'overdue';
  if (due <= endOfWeek(today, { weekStartsOn: 1 })) return 'due_week';
  if (due <= endOfMonth(today)) return 'due_month';
  return 'later';
}

function visitBucketFor(lastVisitDate, today) {
  if (!lastVisitDate) return 'never';
  const days = differenceInCalendarDays(today, parseISO(lastVisitDate));
  if (days <= 6) return 'this_week';
  if (days <= 13) return '1_2_weeks';
  if (days <= 27) return '2_4_weeks';
  return '28_plus';
}

export default function ClientsList({ onSelect, initialSearch }) {
  const { clientsList, loading } = useAllClients();
  const { staffList } = useAllStaff();
  const { packages } = useMembershipPackages();
  const [search, setSearch]     = useState(initialSearch || '');
  // Default 'Active' (a literal status-text match, not the Mindbody `active`
  // boolean — that flag turned out to be true for every client in this
  // account regardless of status, even Terminated, so it carries no signal
  // here and isn't usable as a filter).
  const [statusFilter, setStatusFilter]     = useState('Active'); // 'Active' | 'all' | <status text>

  const [assignedFilter, setAssignedFilter] = useState('all');    // 'all' | 'unassigned' | 'group' | <staff id>
  const [dueFilter, setDueFilter]           = useState('all');    // 'all' | 'overdue' | 'due_week' | 'due_month' | 'not_set'
  const [visitFilter, setVisitFilter]       = useState('all');    // 'all' | 'this_week' | '1_2_weeks' | '2_4_weeks' | '28_plus' | 'never'
  const [startersOnly, setStartersOnly]     = useState(false);

  const today = useMemo(() => startOfDay(new Date()), []);

  const staffNameById = useMemo(() => {
    const m = {};
    for (const s of staffList) m[s.id] = s.full_name;
    return m;
  }, [staffList]);

  const packageNameById = useMemo(() => {
    const m = {};
    for (const p of packages) m[p.id] = p.name;
    return m;
  }, [packages]);

  const statusOptions = useMemo(() => {
    const set = new Set(clientsList.map((c) => c.status).filter(Boolean));
    set.delete('Active'); // already the default option, don't list it twice
    return [...set].sort();
  }, [clientsList]);

  const isStarter = (c) => c.creation_date && differenceInCalendarDays(today, parseISO(c.creation_date)) <= STARTER_DAYS;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return clientsList.filter((c) => {
      if (search && !(
        `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.mobile_phone?.includes(q)
      )) return false;

      if (statusFilter !== 'all' && c.status !== statusFilter) return false;

      if (assignedFilter === 'unassigned' && (c.assigned_staff_id || c.assigned_group)) return false;
      if (assignedFilter === 'group' && !c.assigned_group) return false;
      if (assignedFilter !== 'all' && assignedFilter !== 'unassigned' && assignedFilter !== 'group' && c.assigned_staff_id !== assignedFilter) return false;

      if (dueFilter !== 'all' && dueBucketFor(c.next_program_due, today) !== dueFilter) return false;
      if (visitFilter !== 'all' && visitBucketFor(c.last_visit_date, today) !== visitFilter) return false;

      if (startersOnly && !isStarter(c)) return false;

      return true;
    });
  }, [clientsList, search, statusFilter, assignedFilter, dueFilter, visitFilter, startersOnly, today]);

  const selectClass = 'rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="rounded-xl border border-gray-200 bg-white flex flex-col">
      <div className="px-5 pt-5 pb-4 border-b border-gray-200 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">Clients</h2>
            <p className="text-xs text-gray-500 mt-0.5">{filtered.length} of {clientsList.length}</p>
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

        <div className="flex flex-wrap items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
            <option value="Active">Status: Active</option>
            <option value="all">Status: All</option>
            {statusOptions.map((s) => <option key={s} value={s}>Status: {s}</option>)}
          </select>

          <select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)} className={selectClass}>
            <option value="all">Assigned to: All</option>
            <option value="unassigned">Assigned to: Unassigned</option>
            <option value="group">Assigned to: Group Program</option>
            {staffList.map((s) => <option key={s.id} value={s.id}>Assigned to: {s.full_name}</option>)}
          </select>

          <select value={dueFilter} onChange={(e) => setDueFilter(e.target.value)} className={selectClass}>
            <option value="all">Next programme: All</option>
            <option value="overdue">Overdue</option>
            <option value="due_week">Due this week</option>
            <option value="due_month">Due this month</option>
            <option value="not_set">Not set</option>
          </select>

          <select value={visitFilter} onChange={(e) => setVisitFilter(e.target.value)} className={selectClass}>
            <option value="all">Last visit: All</option>
            <option value="this_week">This week</option>
            <option value="1_2_weeks">1-2 weeks ago</option>
            <option value="2_4_weeks">2-4 weeks ago</option>
            <option value="28_plus">28+ days</option>
            <option value="never">Never visited</option>
          </select>

          <label className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" checked={startersOnly} onChange={(e) => setStartersOnly(e.target.checked)} />
            Starters only (new in last 30 days)
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="px-5 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Assigned to</th>
              <th className="px-3 py-2 font-medium">Package</th>
              <th className="px-3 py-2 font-medium">Next programme due</th>
              <th className="px-3 py-2 font-medium">Last visit</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200/60">
            {loading && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">Loading clients…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">No clients match these filters</td></tr>
            )}
            {!loading && filtered.map((c) => {
              const needsPackage = isStarter(c) && !c.package_id;
              return (
                <tr
                  key={c.id}
                  onClick={() => onSelect(c.mindbody_id)}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-gray-900">{`${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown'}</p>
                      {needsPackage && (
                        <span title="New client — no package assigned yet" className="flex items-center gap-0.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600 border border-red-500/20">
                          <AlertCircle className="h-2.5 w-2.5" /> No package
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{c.email || c.mobile_phone || '—'}</p>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{c.status || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600">
                    {c.assigned_group ? 'Group Program' : (staffNameById[c.assigned_staff_id] || '—')}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{packageNameById[c.package_id] || '—'}</td>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
