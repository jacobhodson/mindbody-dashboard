import { useState, Fragment } from 'react';
import { Contact, ChevronDown, ChevronRight } from 'lucide-react';
import { useAllClients } from '../utils/useAllClients.js';
import { simplifiedStatus } from '../utils/clientStatus.js';

const GROUP = 'group';
const UNASSIGNED = 'unassigned';

/**
 * Team tab → Client Caseload: how many clients each coach has assigned to
 * them on the Clients tab (clients.assigned_staff_id), counting only clients
 * whose status is Active or Trial — the same simplifiedStatus() the Clients
 * tab's Status column shows, so overrides apply. Trial (on a front-end offer,
 * per pipelineIds) is broken out in its own column but included in the
 * total, matching the active_clients figure scheduled-coach-snapshot.js
 * writes each night (the server can't see pipelineIds, and trial clients
 * are Mindbody-Active, so it counts them in). Group Program and Unassigned
 * get a row each.
 * Click a row to see the clients in it; a name opens their profile.
 */
export default function ClientCaseload({ staffList, pipelineIds, onViewClient }) {
  const { clientsList, loading } = useAllClients();
  const [open, setOpen] = useState(null); // row key

  const buckets = new Map(); // key -> { active: [], trial: [] }
  for (const c of clientsList) {
    const status = simplifiedStatus(c, pipelineIds);
    if (status === 'Inactive') continue;
    const key = c.assigned_group ? GROUP : (c.assigned_staff_id || UNASSIGNED);
    if (!buckets.has(key)) buckets.set(key, { active: [], trial: [] });
    buckets.get(key)[status === 'Trial' ? 'trial' : 'active'].push(c);
  }
  const bucketFor = (key) => buckets.get(key) || { active: [], trial: [] };

  // Every active coach, plus anyone else who still has active clients
  // assigned (e.g. a staff member who's since been marked inactive).
  const staffIds = new Set(staffList.filter((s) => s.active !== false && s.is_coach !== false).map((s) => s.id));
  for (const key of buckets.keys()) if (key !== GROUP && key !== UNASSIGNED) staffIds.add(key);
  const nameOf = (id) => staffList.find((s) => s.id === id)?.full_name || 'Unknown staff member';

  const coachRows = [...staffIds]
    .map((id) => ({ key: id, label: nameOf(id), ...bucketFor(id) }))
    .sort((a, b) => total(b) - total(a) || a.label.localeCompare(b.label));
  const otherRows = [
    { key: GROUP, label: 'Group Program', muted: true, ...bucketFor(GROUP) },
    { key: UNASSIGNED, label: 'Unassigned', muted: true, ...bucketFor(UNASSIGNED) },
  ];

  const total = (r) => r.active.length + r.trial.length;
  const coachActive = coachRows.reduce((n, r) => n + total(r), 0);
  const coachTrial  = coachRows.reduce((n, r) => n + r.trial.length, 0);
  const coachCount  = coachRows.filter((r) => staffList.find((s) => s.id === r.key && s.active !== false && s.is_coach !== false)).length;

  const renderRow = (r) => {
    const isOpen = open === r.key;
    const names = [...r.active, ...r.trial].sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));
    return (
      <Fragment key={r.key}>
        <tr
          onClick={() => setOpen(isOpen ? null : r.key)}
          className={`cursor-pointer hover:bg-gray-50 ${isOpen ? 'bg-gray-50' : ''}`}
        >
          <td className={`px-4 py-3 text-sm ${r.muted ? 'text-gray-500 italic' : 'text-gray-700'}`}>
            <span className="inline-flex items-center gap-1.5">
              {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
              {r.label}
            </span>
          </td>
          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-800">{total(r)}</td>
          <td className="px-4 py-3 text-right tabular-nums text-gray-500">{r.trial.length || '–'}</td>
        </tr>
        {isOpen && (
          <tr className="bg-gray-50/60">
            <td colSpan={3} className="px-4 py-3">
              {names.length === 0 ? (
                <p className="text-xs text-gray-400">No active clients.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {names.map((c) => {
                    const trial = r.trial.includes(c);
                    return (
                      <button
                        key={c.id}
                        onClick={() => onViewClient?.(c.mindbody_id)}
                        className={`rounded-full border px-2 py-0.5 text-xs hover:border-emerald-500 hover:text-emerald-700 ${
                          trial ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-300 bg-white text-gray-700'
                        }`}
                      >
                        {c.first_name} {c.last_name}{trial ? ' · Trial' : ''}
                      </button>
                    );
                  })}
                </div>
              )}
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Contact className="h-4 w-4 text-emerald-600" />
          <h2 className="font-semibold text-gray-900">Client Caseload</h2>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          Active clients assigned to each coach on the Clients tab, right now. Snapshotted nightly — see the month-by-month
          history under By Coach / By Metric (Active Clients). Click a row to see who's in it.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Coach</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Active clients</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">of which Trial</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <tr className="bg-gray-50/60">
              <td className="px-4 py-3">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-sm font-semibold text-gray-800">Coach Total</span>
                </span>
              </td>
              {loading ? (
                <>
                  <td className="px-4 py-3 text-right"><div className="h-4 w-8 ml-auto animate-pulse rounded bg-gray-200" /></td>
                  <td className="px-4 py-3 text-right"><div className="h-4 w-8 ml-auto animate-pulse rounded bg-gray-200" /></td>
                </>
              ) : (
                <>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-900">{coachActive}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{coachTrial || '–'}</td>
                </>
              )}
            </tr>
            {!loading && coachRows.map(renderRow)}
            {!loading && otherRows.map(renderRow)}
          </tbody>
        </table>
      </div>

      {!loading && coachCount > 0 && (
        <p className="px-5 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
          Average {(coachActive / coachCount).toFixed(1)} active clients per coach. "Active" uses the same status as the Clients tab,
          including manager overrides, and includes clients on a front-end offer (Trial).
        </p>
      )}
    </div>
  );
}
