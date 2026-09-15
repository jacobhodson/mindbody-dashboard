import { useState, useEffect } from 'react';
import { Users2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient.js';
import { useAllStaff } from '../utils/useAllStaff.js';

/**
 * Match each of our staff records to their Xero Payroll employee record —
 * needed before wages can be pulled per person. Manual, not automatic:
 * confirmed live that Xero employee emails only matched our staff.email
 * for 2 of 8 people, so a name/email auto-join would misattribute wages
 * for the rest. Writes straight to staff.xero_employee_id — the existing
 * "managers manage staff" RLS policy already covers this column, no new
 * policy needed.
 */
export default function XeroEmployeeMapping({ isManager }) {
  const { staffList, loading: staffLoading } = useAllStaff();
  const [employees, setEmployees]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [mapping, setMapping]       = useState({}); // staffId -> xeroEmployeeId
  const [savingId, setSavingId]     = useState(null);

  useEffect(() => {
    if (!isManager) return;
    fetch('/api/xero-employees')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => setEmployees(d.employees || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isManager]);

  useEffect(() => {
    const m = {};
    for (const s of staffList) if (s.xero_employee_id) m[s.id] = s.xero_employee_id;
    setMapping(m);
  }, [staffList]);

  if (!isManager) return null;

  const save = async (staffId, xeroEmployeeId) => {
    setSavingId(staffId);
    const { error: updErr } = await supabase
      .from('staff')
      .update({ xero_employee_id: xeroEmployeeId || null })
      .eq('id', staffId);
    if (!updErr) setMapping((prev) => ({ ...prev, [staffId]: xeroEmployeeId || undefined }));
    setSavingId(null);
  };

  const activeStaff = staffList.filter((s) => s.active !== false);
  const unmappedCount = activeStaff.filter((s) => !mapping[s.id]).length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-1">
        <Users2 className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-gray-900">Xero Payroll Mapping</h3>
        {unmappedCount > 0 && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
            {unmappedCount} unmapped
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-3">Match each coach to their Xero Payroll employee record — needed before wages/LER can be pulled for them.</p>

      {error && <p className="text-xs text-red-600 mb-2">Could not load Xero employees: {error}</p>}

      {loading || staffLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />)}
        </div>
      ) : (
        <div className="space-y-1.5">
          {activeStaff.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2">
              <p className="text-sm text-gray-800">{s.full_name}</p>
              <select
                value={mapping[s.id] || ''}
                onChange={(e) => save(s.id, e.target.value)}
                disabled={savingId === s.id}
                className="rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-900 disabled:opacity-50"
              >
                <option value="">Not mapped</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
