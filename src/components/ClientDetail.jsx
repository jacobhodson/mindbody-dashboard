import { useState, useMemo } from 'react';
import {
  ArrowLeft, Phone, Mail, Cake, MapPin, AlertTriangle, CalendarDays,
  MessageSquare, ClipboardList, Trash2, Dumbbell, Activity, Target,
} from 'lucide-react';
import { format, parseISO, startOfDay } from 'date-fns';
import { useClientDetail } from '../utils/useClientDetail.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import { useMembershipPackages } from '../utils/useMembershipPackages.js';
import { renderFormatted } from '../utils/richText.js';
import { GROUP_VALUE, caseloadSelectValue as caseloadValueFor, caseloadPayloadFor } from '../utils/caseload.js';
import { SIMPLE_STATUSES, simplifiedStatus, hasStatusOverride } from '../utils/clientStatus.js';
import { STRATEGY_FOLLOWUP_DAYS, strategyStatus } from '../utils/strategySessions.js';
import RichTextField from './RichTextField.jsx';
import WeeklyAttendancePanel from './WeeklyAttendancePanel.jsx';

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

export default function ClientDetail({ mindbodyId, isManager, staff, pipelineIds, onBack }) {
  const {
    client, visits, weeklyAttendance, avgWeekly, notes, contactLogs, linkedTasks, strategySessions, loading, error,
    updateCaseload, updatePackage, updateNextProgramDue, updateStatusOverride, addNote, deleteNote,
    addStrategySession, deleteStrategySession,
  } = useClientDetail(mindbodyId);
  const { staffList } = useAllStaff();
  const { packages, createPackage } = useMembershipPackages();
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [addingPackage, setAddingPackage] = useState(false);
  const [newPackageName, setNewPackageName] = useState('');
  const [visitsExpanded, setVisitsExpanded] = useState(false);
  const [contactLogsExpanded, setContactLogsExpanded] = useState(false);
  const [strategyOpen, setStrategyOpen]       = useState(false);
  const [strategyDate, setStrategyDate]       = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [strategyNotes, setStrategyNotes]     = useState('');
  const [savingStrategy, setSavingStrategy]   = useState(false);
  const [strategyExpanded, setStrategyExpanded] = useState(false);

  const staffNameById = useMemo(() => {
    const m = {};
    for (const s of staffList) m[s.id] = s.full_name;
    return m;
  }, [staffList]);

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

  const submitStrategySession = async (e) => {
    e.preventDefault();
    if (!staff || !strategyDate) return;
    setSavingStrategy(true);
    const saved = await addStrategySession(staff.id, strategyDate, strategyNotes);
    setSavingStrategy(false);
    if (saved) {
      setStrategyNotes('');
      setStrategyDate(format(new Date(), 'yyyy-MM-dd'));
      setStrategyOpen(false);
    }
  };

  const handleCaseloadChange = (value) => updateCaseload(caseloadPayloadFor(value));

  const handlePackageChange = async (value) => {
    if (value === ADD_PACKAGE_VALUE) { setAddingPackage(true); return; }
    updatePackage(value || null);
  };

  const handleStatusChange = (value) => updateStatusOverride(value || null);

  const submitNewPackage = async (e) => {
    e.preventDefault();
    if (!newPackageName.trim()) return;
    const pkg = await createPackage(newPackageName.trim());
    if (pkg) await updatePackage(pkg.id);
    setNewPackageName('');
    setAddingPackage(false);
  };

  const caseloadSelectValue = caseloadValueFor(client);
  const scorecardStatus = scorecardStatusFor(avgWeekly);
  const visibleVisits = visitsExpanded ? visits : visits.slice(0, 10);
  const visibleContactLogs = contactLogsExpanded ? contactLogs : contactLogs.slice(0, 3);
  const strategy = strategyStatus(client.last_strategy_session, startOfDay(new Date()));
  const visibleStrategySessions = strategyExpanded ? strategySessions : strategySessions.slice(0, 3);
  const status = simplifiedStatus(client, pipelineIds);
  const overridden = hasStatusOverride(client);
  const autoTrial = !overridden && status === 'Trial';
  // Controlled value for the override select: collapse any legacy
  // non-simple override (e.g. a pre-2026-09-15 'Non-Member') down to
  // 'Inactive' so it still matches one of the <option>s below.
  const overrideSelectValue = client.status_override ? status : '';

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
              {status && (
                <span
                  title={overridden ? `Manually set — Mindbody has this client as "${client.status}"` : undefined}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    overridden
                      ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                      : status === 'Trial'
                        ? 'bg-violet-500/10 text-violet-600 border border-violet-500/20'
                        : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {status}{overridden && ' •'}
                </span>
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
            <select
              value={caseloadSelectValue}
              onChange={(e) => handleCaseloadChange(e.target.value)}
              className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900"
            >
              <option value="">Unassigned</option>
              <option value={GROUP_VALUE}>Group Program</option>
              {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Package</p>
            {addingPackage ? (
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
                {isManager && <option value={ADD_PACKAGE_VALUE}>+ Add new package…</option>}
              </select>
            )}
          </div>
          {!client.assigned_group && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Next programme due</p>
              <input
                type="date"
                value={client.next_program_due || ''}
                onChange={(e) => updateNextProgramDue(e.target.value || null)}
                className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900"
              />
            </div>
          )}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Status</p>
            <div className="flex items-center gap-1.5">
              <select
                value={overrideSelectValue}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900"
              >
                <option value="">{client.status} (Mindbody)</option>
                {SIMPLE_STATUSES.filter((s) => s !== client.status).map((s) => (
                  <option key={s} value={s}>{s} (manual)</option>
                ))}
              </select>
              {autoTrial && (
                <span
                  title="Currently on a front-end offer/intro pass — auto-detected from the Onboarding pipeline"
                  className="shrink-0 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 border border-violet-500/20"
                >
                  Trial
                </span>
              )}
            </div>
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

      {/* Strategy sessions */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
              <Target className="h-4 w-4 text-gray-400" /> Strategy sessions
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {strategy.never
                ? 'No strategy session logged yet'
                : <>Last session {fmtDate(client.last_strategy_session)} · {strategy.days === 0 ? 'today' : `${strategy.days} day${strategy.days === 1 ? '' : 's'} ago`}</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {strategy.due && (
              <span
                title={`Over ${STRATEGY_FOLLOWUP_DAYS} days since the last strategy session (or never had one)`}
                className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 border border-red-500/20"
              >
                <AlertTriangle className="h-3 w-3" /> Follow-up due
              </span>
            )}
            {staff && !strategyOpen && (
              <button
                onClick={() => setStrategyOpen(true)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
              >
                Log strategy session
              </button>
            )}
          </div>
        </div>

        {strategyOpen && (
          <form onSubmit={submitStrategySession} className="space-y-2 mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              Date completed
              <input
                type="date"
                value={strategyDate}
                max={format(new Date(), 'yyyy-MM-dd')}
                onChange={(e) => setStrategyDate(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <RichTextField value={strategyNotes} onChange={setStrategyNotes} placeholder="Session notes — goals, plan, next steps…" multiline />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={savingStrategy || !strategyDate}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
              >
                {savingStrategy ? 'Saving…' : 'Save session'}
              </button>
              <button
                type="button"
                onClick={() => { setStrategyOpen(false); setStrategyNotes(''); }}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {strategySessions.length > 0 && (
          <ul className="space-y-3">
            {visibleStrategySessions.map((s) => (
              <li key={s.id} className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-gray-700">
                    {fmtDate(s.session_date)} · {staffNameById[s.staff_id] || 'Staff'}
                  </p>
                  {(isManager || s.staff_id === staff?.id) && (
                    <button
                      onClick={() => { if (window.confirm('Delete this strategy session?')) deleteStrategySession(s.id); }}
                      title="Delete session"
                      className="text-gray-300 hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {s.notes
                  ? <p className="text-sm text-gray-800 whitespace-pre-wrap">{renderFormatted(s.notes)}</p>
                  : <p className="text-xs text-gray-400">No notes</p>}
              </li>
            ))}
          </ul>
        )}
        {!strategyExpanded && strategySessions.length > 3 && (
          <button onClick={() => setStrategyExpanded(true)} className="mt-3 text-xs font-medium text-emerald-600 hover:text-emerald-700">
            Show all {strategySessions.length} sessions
          </button>
        )}
        {strategyExpanded && strategySessions.length > 3 && (
          <button onClick={() => setStrategyExpanded(false)} className="mt-3 text-xs font-medium text-gray-500 hover:text-gray-700">
            Show fewer
          </button>
        )}
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
            {visibleContactLogs.map((c) => (
              <li key={c.id} className="py-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-700">{staffNameById[c.staff_id] || 'Staff'}</p>
                  <p className="text-[10px] text-gray-400">{format(parseISO(c.contacted_at), 'd MMM yyyy')}</p>
                </div>
                {c.note && <p className="text-sm text-gray-600 mt-0.5">{c.note}</p>}
              </li>
            ))}
          </ul>
          {!contactLogsExpanded && contactLogs.length > 3 && (
            <button
              onClick={() => setContactLogsExpanded(true)}
              className="mt-3 text-xs font-medium text-emerald-600 hover:text-emerald-700"
            >
              Show all {contactLogs.length} contacts
            </button>
          )}
          {contactLogsExpanded && contactLogs.length > 3 && (
            <button
              onClick={() => setContactLogsExpanded(false)}
              className="mt-3 text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              Show fewer
            </button>
          )}
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
