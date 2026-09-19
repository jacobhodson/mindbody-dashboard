import { useState, useMemo } from 'react';
import { UserCog } from 'lucide-react';
import { useAllClients } from '../utils/useAllClients.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import { useMembershipPackages } from '../utils/useMembershipPackages.js';
import { GROUP_VALUE, caseloadPayloadFor } from '../utils/caseload.js';
import { daysAgoLabel } from '../utils/dateLabels.js';

const ADD_PACKAGE_VALUE = '__add__';
const selectClass = 'rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';

// Home-page notice, same "anyone can pick these up" pattern as
// NewClientsToAllocate.jsx, but for clients currently on a front-end
// offer/trial pass (`pipelineIds`, computed in Dashboard.jsx from the live
// onboarding fetch — see clientStatus.js's simplifiedStatus()) who are still
// missing a coach and/or a membership package. A row drops off the instant
// both are set.
//
// Coach assignment goes through assign_client_caseload() same as
// NewClientsToAllocate.jsx, so it's open to any signed-in staff. Package
// assignment is a direct `clients` update, gated to managers by RLS
// ("managers update clients") — same restriction ClientsList.jsx's package
// picker already respects — so that half of the row only renders for
// isManager.
export default function PipelineClientsToAllocate({ pipelineIds, isManager, onViewClient }) {
  const { clientsList, loading, updateCaseload, updatePackage } = useAllClients();
  const { staffList } = useAllStaff();
  const { packages, createPackage } = useMembershipPackages();
  const [addingPackageForId, setAddingPackageForId] = useState(null);
  const [newPackageName, setNewPackageName] = useState('');

  const needsAllocation = useMemo(() => {
    if (!pipelineIds || pipelineIds.size === 0) return [];
    return clientsList.filter((c) => {
      if (!pipelineIds.has(c.mindbody_id)) return false;
      const noCoach   = !c.assigned_staff_id && !c.assigned_group;
      const noPackage = !c.package_id;
      return noCoach || (isManager && noPackage);
    });
  }, [clientsList, pipelineIds, isManager]);

  if (loading || needsAllocation.length === 0) return null;

  const handlePackageChange = (clientId, value) => {
    if (value === ADD_PACKAGE_VALUE) { setAddingPackageForId(clientId); setNewPackageName(''); return; }
    updatePackage(clientId, value || null);
  };

  const submitNewPackage = async (e, clientId) => {
    e.preventDefault();
    if (!newPackageName.trim()) return;
    const pkg = await createPackage(newPackageName.trim());
    if (pkg) await updatePackage(clientId, pkg.id);
    setNewPackageName('');
    setAddingPackageForId(null);
  };

  return (
    <div className="rounded-xl border border-violet-300/60 bg-violet-50/40 p-5">
      <div className="flex items-center gap-2 mb-1">
        <UserCog className="h-4 w-4 text-violet-600" />
        <h2 className="font-semibold text-gray-900">Trial Clients to Allocate</h2>
        <span className="rounded-full border border-violet-500/30 bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
          {needsAllocation.length}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Currently on a front-end offer/trial pass and still missing a coach{isManager ? ' or a package' : ''} — anyone can pick these up.
      </p>

      <div className="space-y-2">
        {needsAllocation.map((c) => {
          const noCoach   = !c.assigned_staff_id && !c.assigned_group;
          const noPackage = !c.package_id;
          return (
            <div key={c.id} className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-gray-200 bg-white px-3 py-2.5">
              <button onClick={() => onViewClient?.(c.mindbody_id)} className="text-left min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate hover:underline">
                  {`${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown'}
                </p>
                <p className="text-xs text-gray-500">{daysAgoLabel(c.creation_date)}</p>
              </button>

              <div className="flex items-center gap-2 flex-wrap">
                {noCoach && (
                  <select
                    defaultValue=""
                    onChange={(e) => e.target.value && updateCaseload(c.id, caseloadPayloadFor(e.target.value))}
                    className={selectClass}
                  >
                    <option value="" disabled>Assign to…</option>
                    <option value={GROUP_VALUE}>Group Program</option>
                    {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                )}

                {isManager && noPackage && (
                  addingPackageForId === c.id ? (
                    <form onSubmit={(e) => submitNewPackage(e, c.id)} className="flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        placeholder="New package"
                        value={newPackageName}
                        onChange={(e) => setNewPackageName(e.target.value)}
                        className="w-28 rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-900"
                      />
                      <button type="submit" className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-500">Save</button>
                      <button type="button" onClick={() => setAddingPackageForId(null)} className="rounded-lg bg-gray-200 px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-300">✕</button>
                    </form>
                  ) : (
                    <select
                      defaultValue=""
                      onChange={(e) => handlePackageChange(c.id, e.target.value)}
                      className={selectClass}
                    >
                      <option value="" disabled>Package…</option>
                      {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      <option value={ADD_PACKAGE_VALUE}>+ Add new…</option>
                    </select>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
