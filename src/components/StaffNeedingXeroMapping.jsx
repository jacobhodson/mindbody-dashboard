import { useState, useEffect } from 'react';
import { Link2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import { useWageOverrides } from '../utils/useWageOverrides.js';

const selectClass = 'rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';

// Best guess at which Xero employee is this staff member: same email first
// (the reliable one), else a first name that matches exactly one employee.
// Only ever a pre-selection — the manager still confirms with the Map button.
function suggestionFor(person, available) {
  const email = (person.email || '').trim().toLowerCase();
  if (email) {
    const hit = available.find((e) => e.email && e.email.trim().toLowerCase() === email);
    if (hit) return { employee: hit, how: 'email' };
  }
  const first = (person.full_name || '').trim().split(/\s+/)[0]?.toLowerCase();
  if (first) {
    const hits = available.filter((e) => e.name.toLowerCase().split(' ')[0] === first);
    if (hits.length === 1) return { employee: hits[0], how: 'name' };
  }
  return null;
}

function Row({ person, available, employeesReady, onMapped }) {
  const suggestion = employeesReady ? suggestionFor(person, available) : null;
  const [choice, setChoice]   = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);
  const selected = touched ? choice : (suggestion?.employee.id || '');

  const map = async () => {
    if (!selected) return;
    setSaving(true); setError(null);
    const { error: err } = await supabase.from('staff').update({ xero_employee_id: selected }).eq('id', person.id);
    if (err) { setError(err.message); setSaving(false); return; }
    // Re-run the snapshot in the background so their wages fill in now rather
    // than at the nightly run (same as mapping from the Finance LER table).
    fetch('/api/scheduled-coach-snapshot').catch(() => {});
    onMapped();
  };

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-gray-200 bg-white px-3 py-2.5">
      <div className="min-w-0">
        <p className="font-medium text-gray-900 text-sm truncate">{person.full_name}</p>
        <p className="text-xs text-gray-500 truncate">{person.email}</p>
        {employeesReady && (
          <p className={`text-xs mt-0.5 ${suggestion?.how === 'email' ? 'text-emerald-600' : 'text-gray-500'}`}>
            {suggestion?.how === 'email' && `Email matches ${suggestion.employee.name} in Xero`}
            {suggestion?.how === 'name' && `Possible match by first name: ${suggestion.employee.name} — check it's the right person`}
            {!suggestion && 'No match found in Xero — pick from the list, or add them to Xero payroll first'}
          </p>
        )}
        {error && <p className="text-xs mt-0.5 text-red-600">Couldn't save: {error}</p>}
      </div>

      {employeesReady && (
        <div className="flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => { setTouched(true); setChoice(e.target.value); }}
            disabled={saving}
            className={selectClass}
          >
            <option value="">Xero employee…</option>
            {available.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <button
            onClick={map}
            disabled={!selected || saving}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? 'Mapping…' : 'Map'}
          </button>
        </div>
      )}
    </div>
  );
}

function Panel({ unmapped, takenIds, onMapped }) {
  const [employees, setEmployees] = useState(null); // null = still loading
  const [loadError, setLoadError] = useState(null);

  // Fetched only once there's actually someone to map — Home shouldn't hit
  // Xero on every load when nothing needs doing.
  useEffect(() => {
    fetch('/api/xero-employees')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => setEmployees(d.employees || []))
      .catch((e) => setLoadError(e.message));
  }, []);

  // An employee already mapped to someone else isn't offered again.
  const available = (employees || []).filter((e) => !takenIds.has(e.id));

  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50/40 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Link2 className="h-4 w-4 text-amber-600" />
        <h2 className="font-semibold text-gray-900">Staff to Map to Xero</h2>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
          {unmapped.length}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Active coaches with no Xero payroll employee (and no wage override). Until they're mapped their wages are blank in LER,
        and the Team LER reads high because their revenue counts without any wages.
      </p>

      {loadError && (
        <p className="text-xs text-red-600 mb-3">
          Couldn't load Xero employees ({loadError}) — check Xero is connected on the Finance tab, then map them from Finance → LER.
        </p>
      )}
      {!employees && !loadError && <p className="text-xs text-gray-400 mb-3">Loading Xero employees…</p>}

      <div className="space-y-2">
        {unmapped.map((p) => (
          <Row key={p.id} person={p} available={available} employeesReady={!!employees} onMapped={onMapped} />
        ))}
      </div>
    </div>
  );
}

function Notice() {
  const { staffList, loading, reload } = useAllStaff();
  const { overrides, loading: overridesLoading } = useWageOverrides();

  if (loading || overridesLoading) return null;

  // Same idea as the "not mapped" badge on the Finance LER table: a coach with
  // neither a Xero mapping nor a standing wage override has no wages at all.
  const unmapped = staffList.filter((s) => s.active !== false && s.is_coach !== false && !s.xero_employee_id && !overrides[s.id]);
  if (unmapped.length === 0) return null;

  const takenIds = new Set(staffList.map((s) => s.xero_employee_id).filter(Boolean));
  return <Panel unmapped={unmapped} takenIds={takenIds} onMapped={reload} />;
}

// Home-page manager notice: coaches who still need mapping to a Xero payroll
// employee. Disappears by itself once everyone is mapped (or covered by a wage
// override). Manager-only, so the wage-override query never runs for others.
export default function StaffNeedingXeroMapping({ isManager }) {
  if (!isManager) return null;
  return <Notice />;
}
