import { useState } from 'react';
import { X, Check, Ban, Trash2, Loader2, Lock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { LEAVE_TYPES, STATUS_BY_KEY, typeMeta, weekdayCount, todayIso } from '../../utils/leave.js';

const input = 'w-full rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';
const label = 'block text-xs font-medium text-gray-600 mb-1';

/**
 * Request / edit one leave block. Staff can only book for themselves;
 * managers can book for anyone and approve, decline or tick "balance
 * updated". Editing the dates/type of a decided request sends it back to
 * pending (the DB trigger enforces this for non-managers).
 */
export default function LeaveForm({ request, defaults, staff, staffList, isManager, nameById, onSave, onDelete, onClose }) {
  const isNew = !request;
  const canEdit = isNew || isManager || request.staff_id === staff?.id;
  const [f, setF] = useState(() => ({
    staff_id:   request?.staff_id   ?? defaults?.staff_id ?? staff?.id ?? '',
    title:      request?.title      ?? '',
    leave_type: request?.leave_type ?? 'annual',
    start_date: request?.start_date ?? defaults?.start_date ?? todayIso(),
    end_date:   request?.end_date   ?? defaults?.end_date ?? defaults?.start_date ?? todayIso(),
    work_days:  request?.work_days  ?? '',
    notes:      request?.notes      ?? '',
  }));
  // Work days follows the dates (Mon–Fri count) until someone types their own.
  const [daysTouched, setDaysTouched] = useState(request?.work_days != null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const autoDays = weekdayCount(f.start_date, f.end_date);
  const workDays = daysTouched ? f.work_days : autoDays;
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setStart = (e) => {
    const v = e.target.value;
    setF((p) => ({ ...p, start_date: v, end_date: !p.end_date || p.end_date < v ? v : p.end_date }));
  };

  const datesChanged = request && (f.start_date !== request.start_date || f.end_date !== request.end_date || f.leave_type !== request.leave_type);

  const save = async (extra = {}) => {
    if (!f.title.trim()) { setErr('Add a short description (e.g. "Bali trip").'); return; }
    if (!f.staff_id) { setErr('Pick who the leave is for.'); return; }
    if (f.end_date < f.start_date) { setErr('The end date is before the start date.'); return; }
    setSaving(true); setErr(null);
    const fields = {
      staff_id: f.staff_id,
      title: f.title.trim(),
      leave_type: f.leave_type,
      start_date: f.start_date,
      end_date: f.end_date,
      work_days: workDays === '' || workDays == null ? null : Number(workDays),
      notes: f.notes.trim() || null,
      ...extra,
    };
    const ok = await onSave(fields);
    setSaving(false);
    if (ok) onClose();
    else setErr('Could not save — check your connection and try again.');
  };

  const decide = async (status) => {
    setSaving(true);
    const ok = await onSave({ status });
    setSaving(false);
    if (ok) onClose();
  };

  const status = request ? STATUS_BY_KEY[request.status] : null;
  const pickable = isManager ? staffList : staffList.filter((s) => s.id === staff?.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-gray-300 bg-white shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute right-4 top-4 text-gray-500 hover:text-gray-700">
          <X className="h-5 w-5" />
        </button>
        <h3 className="text-lg font-semibold text-gray-900">{isNew ? 'Request leave' : canEdit ? 'Edit leave' : 'Leave details'}</h3>
        {status && (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className={`rounded-full border px-2 py-0.5 font-medium ${status.pill}`}>{status.label}</span>
            {request.decided_at && request.status !== 'pending' && (
              <span>
                by {nameById[request.decided_by] || 'a manager'} · {format(parseISO(request.decided_at), 'd MMM yyyy')}
              </span>
            )}
            {request.balance_updated && <span className="text-emerald-700">· Balance updated</span>}
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className={label}>Team member</label>
            <select value={f.staff_id} onChange={set('staff_id')} disabled={!canEdit || !isManager} className={input}>
              {!f.staff_id && <option value="">Choose…</option>}
              {pickable.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              {request && !pickable.some((s) => s.id === request.staff_id) && (
                <option value={request.staff_id}>{nameById[request.staff_id] || 'Unknown'}</option>
              )}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={label}>Type of leave</label>
            <select value={f.leave_type} onChange={set('leave_type')} disabled={!canEdit} className={input}>
              {LEAVE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-gray-500">{typeMeta(f.leave_type).hint}</p>
          </div>
          <div className="col-span-2">
            <label className={label}>Short description</label>
            <input value={f.title} onChange={set('title')} disabled={!canEdit} placeholder="e.g. Fiji family holiday" className={input} />
          </div>
          <div>
            <label className={label}>From</label>
            <input type="date" value={f.start_date} onChange={setStart} disabled={!canEdit} className={input} />
          </div>
          <div>
            <label className={label}>To (inclusive)</label>
            <input type="date" value={f.end_date} min={f.start_date} onChange={set('end_date')} disabled={!canEdit} className={input} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={label}>Work days taken</label>
            <input
              type="number" step="0.5" min="0"
              value={workDays ?? ''}
              onChange={(e) => { setDaysTouched(true); setF((p) => ({ ...p, work_days: e.target.value })); }}
              disabled={!canEdit}
              className={input}
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Mon–Fri in this range: {autoDays}.{' '}
              {daysTouched && canEdit && (
                <button type="button" onClick={() => setDaysTouched(false)} className="text-emerald-700 hover:underline">Use that</button>
              )}
              {' '}Use 0.5 for a half day.
            </p>
          </div>
          {canEdit && (
            <div className="col-span-2">
              <label className={label}>Why / notes (cover arranged, hours, etc.)</label>
              <textarea value={f.notes} onChange={set('notes')} rows={3} placeholder="e.g. Dan covering Wednesday PM classes" className={input} />
              <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
                <Lock className="h-3 w-3" /> Private — only {isManager && f.staff_id !== staff?.id ? 'this team member' : 'you'} and managers can see notes.
              </p>
            </div>
          )}
        </div>

        {datesChanged && request.status !== 'pending' && !isManager && (
          <p className="mt-3 text-xs text-amber-700">Changing the dates or type sends this back to a manager for approval.</p>
        )}
        {err && <p className="mt-3 text-xs text-red-600">{err}</p>}

        {isManager && request && (
          <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-600 mb-2">Manager</p>
            <div className="flex flex-wrap items-center gap-2">
              {request.status !== 'approved' && (
                <button onClick={() => decide('approved')} disabled={saving} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500">
                  <Check className="h-3.5 w-3.5" /> Approve
                </button>
              )}
              {request.status !== 'declined' && (
                <button onClick={() => decide('declined')} disabled={saving} className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100">
                  <Ban className="h-3.5 w-3.5" /> Decline
                </button>
              )}
              {request.status !== 'pending' && (
                <button onClick={() => decide('pending')} disabled={saving} className="rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-200">
                  Back to pending
                </button>
              )}
              <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={request.balance_updated}
                  onChange={(e) => onSave({ balance_updated: e.target.checked })}
                  className="h-3.5 w-3.5 accent-emerald-600"
                />
                Leave balance updated (Xero)
              </label>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center gap-2">
          {request && canEdit && (
            <button
              onClick={async () => { if (window.confirm('Delete this leave entry?') && await onDelete()) onClose(); }}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
              {canEdit ? 'Cancel' : 'Close'}
            </button>
            {canEdit && (
              <>
                {isNew && isManager && (
                  <button onClick={() => save({ status: 'approved' })} disabled={saving} className="rounded-lg border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                    Add as approved
                  </button>
                )}
                <button onClick={() => save()} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isNew ? 'Send request' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
