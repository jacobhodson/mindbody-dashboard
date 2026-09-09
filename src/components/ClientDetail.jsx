import { useState, useMemo } from 'react';
import {
  ArrowLeft, Phone, Mail, Cake, MapPin, AlertTriangle, CalendarDays,
  MessageSquare, ClipboardList, Trash2, Dumbbell, Activity,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useClientDetail } from '../utils/useClientDetail.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import { useMembershipPackages } from '../utils/useMembershipPackages.js';
import { renderFormatted } from '../utils/richText.js';
import RichTextField from './RichTextField.jsx';
import WeeklyAttendancePanel from './WeeklyAttendancePanel.jsx';

const GROUP_VALUE = '__group__'; // sentinel option value for the caseload <select>
const ADD_PACKAGE_VALUE = '__add__';

// Same 3+/1-2/0 thresholds as WeeklyAttendancePanel.jsx's sessionColor() and
// FringeClientsTable.jsx's segments — reused here to pick which of that
// component's 3 status pills (engaged/moderate/red) matches this client's
// rolling 4-week average.
function scorecardStatusFor(avgWeekly) {
  if (avgWeekly >= 3) return 'engaged';
  if (avgWeekly >= 1) return 'moderate';
  return 'red';
}

function fmtDate(d) {
  if (!d) return '—';
  try { return format(parseISO(d), 'd MMM yyyy'); } catch { return d; }
}

function Field({ label, value, Icon }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-sm text-gray-800 truncate">{value}</p>
      </div>
    </div>
  );
}

export default function ClientDetail({ mindbodyId, isManager, staff, onBack }) {
  const {
    client, visits, weeklyAttendance, avgWeekly, notes, contactLogs, linkedTasks, loading, error,
    updateCaseload, updatePackage, updateNextProgramDue, addNote, deleteNote,
  } = useClientDetail(mindbodyId);
  const { staffList } = useAllStaff();
  const { packages, createPackage } = useMembershipPackages();
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [addingPackage, setAddingPackage] = useState(false);
  const [newPackageName, setNewPackageName] = useState('');
  const [visitsExpanded, setVisitsExpanded] = useState(false);

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

  if (loading) return <p className="text-sm text-gray-500">Loading client…</p>;
  if (error) return <p className="text-sm text-red-600">Could not load client: {error}</p>;
  if (!client) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> Back to clients
        </button>
        <p className="text-sm text-gray-500">No client record found yet — it may not have synced from Mindbody yet.</p>
      </div>
    );
  }

  const fullName = `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Unknown';

  const submitNote = async (e) => {
    e.preventDefault();
    if (!noteDraft.trim() || !staff) return;
    setSavingNote(true);
    await addNote(staff.id, noteDraft);
    setNoteDraft('');
    setSavingNote(false);
  };

  const handleCaseloadChange = (value) => {
    if (value === GROUP_VALUE) updateCaseload({ group: true });
    else if (value) updateCaseload({ staffId: value });
    else updateCaseload({});
  };

  const handlePackageChange = async (value) => {
    if (value === ADD_PACKAGE_VALUE) { setAddingPackage(true); return; }
    updatePackage(value || null);
  };

  const submitNewPackage = async (e) => {
    e.preventDefault();
    if (!newPackageName.trim()) return;
    const pkg = await createPackage(newPackageName.trim());
    if (pkg) await updatePackage(pkg.id);
    setNewPackageName('');
    setAddingPackage(false);
  };

  const caseloadSelectValue = client.assigned_group ? GROUP_VALUE : (client.assigned_staff_id || '');
  const caseloadDisplay = client.assigned_group ? 'Group Program' : (staffNameById[client.assigned_staff_id] || 'Unassigned');
  const scorecardStatus = scorecardStatusFor(avgWeekly);
  const visibleVisits = visitsExpanded ? visits : visits.slice(0, 10);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> Back to clients
      </button>

      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-gray-900">{fullName}</h2>
              {client.status && (
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600">{client.status}</span>
              )}
              {client.red_alert && (
                <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 border border-red-500/20">
                  <AlertTriangle className="h-2.5 w-2.5" /> {client.red_alert}
                </span>
              )}
              {client.yellow_alert && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 border border-amber-500/20">
                  <AlertTriangle className="h-2.5 w-2.5" /> {client.yellow_alert}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">Mindbody ID {client.mindbody_id}</p>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <p className="text-xl font-semibold text-gray-900 tabular-nums">{client.total_classes_attended}</p>
              <p className="text-[10px] text-gray-500">classes attended</p>
            </div>
            <div>
              <p className="text-xl font-semibold text-gray-900 tabular-nums">{client.total_pt_sessions}</p>
              <p className="text-[10px] text-gray-500">PT/SP sessions</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Email" value={client.email} Icon={Mail} />
          <Field label="Mobile" value={client.mobile_phone} Icon={Phone} />
          <Field label="Date of birth" value={fmtDate(client.birth_date)} Icon={Cake} />
          <Field label="Address" value={[client.address_line1, client.city].filter(Boolean).join(', ')} Icon={MapPin} />
          <Field label="Last visit" value={fmtDate(client.last_visit_date)} Icon={CalendarDays} />
          <Field label="Member since" value={fmtDate(client.first_class_date || client.first_appointment_date)} Icon={CalendarDays} />
        </div>

        {client.mindbody_notes && (
          <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Mindbody notes (read-only)</p>
            <p className="text-xs text-gray-600 whitespace-pre-wrap">{client.mindbody_notes}</p>
          </div>
        )}
      </div>

      {/* Caseload & programme due */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Caseload &amp; programme</h3>
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Assigned to</p>
            {isManager ? (
              <select
                value={caseloadSelectValue}
                onChange={(e) => handleCaseloadChange(e.target.value)}
                className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900"
              >
                <option value="">Unassigned</option>
                <option value={GROUP_VALUE}>Group Program</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            ) : (
              <p className="text-sm text-gray-800">{caseloadDisplay}</p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Package</p>
            {isManager ? (
              addingPackage ? (
                <form onSubmit={submitNewPackage} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    autoFocus
                    placeholder="New package name"
                    value={newPackageName}
                    onChange={(e) => setNewPackageName(e.target.value)}
                    className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900"
                  />
                  <button type="submit" className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-500">Save</button>
                  <button type="button" onClick={() => { setAddingPackage(false); setNewPackageName(''); }} className="rounded-lg bg-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-300">Cancel</button>
                </form>
              ) : (
                <select
                  value={client.package_id || ''}
                  onChange={(e) => handlePackageChange(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900"
                >
                  <option value="">Not set</option>
                  {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  <option value={ADD_PACKAGE_VALUE}>+ Add new package…</option>
                </select>
              )
            ) : (
              <p className="text-sm text-gray-800">{packageNameById[client.package_id] || 'Not set'}</p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Next programme due</p>
            {isManager ? (
              <input
                type="date"
                value={client.next_program_due || ''}
                onChange={(e) => updateNextProgramDue(e.target.value || null)}
                className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900"
              />
            ) : (
              <p className="text-sm text-gray-800">{fmtDate(client.next_program_due)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Client health scorecard — reuses WeeklyAttendancePanel's colouring */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <Activity className="h-4 w-4 text-gray-400" /> Attendance health
          </h3>
          <p className="text-xs text-gray-500">Avg 4wk: <span className="font-medium text-gray-800">{avgWeekly}</span> sessions/week</p>
        </div>
        <WeeklyAttendancePanel client={{ weeklyAttendance }} status={scorecardStatus} />
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 mb-3">
          <MessageSquare className="h-4 w-4 text-gray-400" /> Notes
        </h3>
        {staff && (
          <form onSubmit={submitNote} className="space-y-2 mb-4">
            <RichTextField value={noteDraft} onChange={setNoteDraft} placeholder="Add a note about this client…" multiline />
            <button
              type="submit"
              disabled={savingNote || !noteDraft.trim()}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
            >
              Add note
            </button>
          </form>
        )}
        {notes.length === 0 && <p className="text-sm text-gray-400">No notes yet.</p>}
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-gray-700">{staffNameById[n.staff_id] || 'Staff'}</p>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-gray-400">{format(parseISO(n.created_at), 'd MMM yyyy, h:mm a')}</p>
                  {(isManager || n.staff_id === staff?.id) && (
                    <button onClick={() => deleteNote(n.id)} className="text-gray-300 hover:text-red-600">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{renderFormatted(n.note)}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* Linked tasks */}
      {linkedTasks.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 mb-3">
            <ClipboardList className="h-4 w-4 text-gray-400" /> Linked tasks
          </h3>
          <ul className="divide-y divide-gray-200">
            {linkedTasks.map((t) => (
              <li key={t.id} className="py-2">
                <p className="text-sm text-gray-800">{t.label}</p>
                {t.description && <p className="text-xs text-gray-500 mt-0.5">{renderFormatted(t.description)}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Contact log */}
      {contactLogs.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 mb-3">
            <MessageSquare className="h-4 w-4 text-gray-400" /> Contact log
          </h3>
          <ul className="divide-y divide-gray-200">
            {contactLogs.map((c) => (
              <li key={c.id} className="py-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-700">{staffNameById[c.staff_id] || 'Staff'}</p>
                  <p className="text-[10px] text-gray-400">{format(parseISO(c.contacted_at), 'd MMM yyyy')}</p>
                </div>
                {c.note && <p className="text-sm text-gray-600 mt-0.5">{c.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Visit ledger */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 mb-3">
          <Dumbbell className="h-4 w-4 text-gray-400" /> Recent visits
        </h3>
        {visits.length === 0 && <p className="text-sm text-gray-400">No visits recorded yet.</p>}
        <ul className="divide-y divide-gray-200">
          {visibleVisits.map((v) => (
            <li key={`${v.kind}-${v.id}`} className="py-2 flex items-center justify-between text-sm">
              <div className="min-w-0">
                <p className="text-gray-800 truncate">{v.label}</p>
                <p className="text-xs text-gray-400">{v.staffName || ''}</p>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="text-xs text-gray-500">{fmtDate(v.date)}</p>
                <p className={`text-[10px] font-medium ${v.status === 'Attended' || v.status === 'Completed' ? 'text-emerald-600' : 'text-gray-400'}`}>{v.status}</p>
              </div>
            </li>
          ))}
        </ul>
        {!visitsExpanded && visits.length > 10 && (
          <button
            onClick={() => setVisitsExpanded(true)}
            className="mt-3 text-xs font-medium text-emerald-600 hover:text-emerald-700"
          >
            Show all {visits.length} visits
          </button>
        )}
        {visitsExpanded && visits.length > 10 && (
          <button
            onClick={() => setVisitsExpanded(false)}
            className="mt-3 text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            Show fewer
          </button>
        )}
      </div>
    </div>
  );
}
