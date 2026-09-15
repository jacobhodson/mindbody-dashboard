import { useState } from 'react';
import { DollarSign } from 'lucide-react';
import { useWageOverrides } from '../utils/useWageOverrides.js';
import { useAllStaff } from '../utils/useAllStaff.js';

/**
 * Standing "effective wage" override per staff member, for LER purposes
 * only — doesn't touch real payroll. Built ahead of the actual Xero
 * payroll pull (2026-09-20) specifically for the case the owner raised:
 * a manager whose Xero wage is a profit-share salary, not face-to-face
 * coaching value. Manager-only, matching staff_wage_overrides' RLS.
 */
export default function WageOverridesPanel({ isManager, currentStaffId }) {
  const { staffList } = useAllStaff();
  const { overrides, loading, setOverride, clearOverride } = useWageOverrides();
  const [editingId, setEditingId]   = useState(null);
  const [draftWage, setDraftWage]   = useState('');
  const [draftNote, setDraftNote]   = useState('');
  const [busy, setBusy]             = useState(false);

  if (!isManager) return null;

  const startEdit = (s) => {
    setEditingId(s.id);
    setDraftWage(overrides[s.id]?.effectiveWage ?? '');
    setDraftNote(overrides[s.id]?.note ?? '');
  };

  const save = async (staffId) => {
    setBusy(true);
    if (draftWage === '') await clearOverride(staffId);
    else await setOverride(staffId, Number(draftWage), draftNote, currentStaffId);
    setBusy(false);
    setEditingId(null);
  };

  const activeStaff = staffList.filter((s) => s.active !== false);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-1">
        <DollarSign className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-gray-900">LER Wage Overrides</h3>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        For anyone whose Xero wage doesn't reflect face-to-face coaching value (e.g. a profit-share salary) —
        set a standing effective wage to use in LER calculations instead. Doesn't touch real payroll.
      </p>

      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />)}
        </div>
      ) : (
        <div className="space-y-1.5">
          {activeStaff.map((s) => {
            const ov = overrides[s.id];
            const isEditing = editingId === s.id;
            return (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800">{s.full_name}</p>
                  {ov && !isEditing && (
                    <p className="text-[11px] text-gray-500">
                      Override: ${Number(ov.effectiveWage).toLocaleString('en-AU')}{ov.note ? ` — ${ov.note}` : ''}
                    </p>
                  )}
                </div>

                {isEditing ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number" value={draftWage} onChange={(e) => setDraftWage(e.target.value)}
                      placeholder="e.g. 1200" className="w-24 rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-900"
                    />
                    <input
                      type="text" value={draftNote} onChange={(e) => setDraftNote(e.target.value)}
                      placeholder="note (optional)" className="w-32 rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-900"
                    />
                    <button disabled={busy} onClick={() => save(s.id)} className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="rounded-lg bg-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-300">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => startEdit(s)} className="shrink-0 text-xs text-gray-500 hover:text-gray-800">
                    {ov ? 'Edit' : 'Set override'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
