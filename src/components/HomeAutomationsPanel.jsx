import { useState, useEffect, useMemo, useCallback } from 'react';
import { Lock, LockOpen, Plus, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import {
  CLIENT_CONDITIONS, CADENCES, WEEKDAYS, AUDIENCES, describeTrigger, reminderHits, todayDate,
} from '../utils/reminders.js';

// The built-in Home pop-ups — keys match home_card_settings and Home.jsx.
export const HOME_CARDS = [
  { key: 'leave_approvals',   label: 'Leave to approve',             when: 'A leave request is waiting on a decision', who: 'Managers' },
  { key: 'my_leave',          label: 'My leave updates',             when: 'Your upcoming leave is awaiting approval, or was approved/declined in the last 7 days', who: 'Each person, their own only' },
  { key: 'xero_mapping',      label: 'Staff needing Xero mapping',   when: 'A staff member has no matching Xero employee', who: 'Managers' },
  { key: 'new_clients',       label: 'New clients to allocate',      when: 'A client who started in the last 30 days has no coach', who: 'Everyone' },
  { key: 'pipeline_clients',  label: 'Pipeline clients to allocate', when: 'A front-end-offer client is missing a coach (or a package — managers)', who: 'Everyone' },
  { key: 'my_pipeline',       label: 'My pipeline tasks',            when: 'You have clients in onboarding with actions due', who: 'Each coach, for their clients' },
  { key: 'missing_rollovers', label: 'Missing rollover decisions',   when: 'A week-4 client has no rollover decision yet', who: 'Everyone' },
];

const CADENCE_WORD = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

const input = 'w-full rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';

/**
 * Managers-only panel at the foot of Home, padlocked shut by default: every
 * automatic pop-up on Home (the built-in cards, the recurring checklist
 * tasks, and manager-made reminders) with an Active/Draft switch, plus the
 * place to create and edit conditional reminders.
 */
export default function HomeAutomationsPanel({ rem, clients, pipelineIds, onTasksChanged }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-5 py-3 text-left"
      >
        {open ? <LockOpen className="h-4 w-4 text-amber-600" /> : <Lock className="h-4 w-4 text-gray-400" />}
        <span className="flex-1 text-sm font-semibold text-gray-900">Reminders &amp; automations</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Managers</span>
      </button>

      {open && (
        <div className="space-y-6 border-t border-gray-100 px-5 py-4">
          {rem.error && <p className="text-xs text-red-600">{rem.error}</p>}
          <ReminderSection rem={rem} clients={clients} pipelineIds={pipelineIds} />
          <CardSection rem={rem} />
          <TaskSection onChanged={onTasksChanged} />
        </div>
      )}
    </div>
  );
}

function Section({ title, hint, children, action }) {
  return (
    <section>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ActiveSwitch({ active, onChange }) {
  return (
    <button
      onClick={() => onChange(!active)}
      title={active ? 'Active — click to move back to Draft' : 'Draft — click to make it Active'}
      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
        active
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          : 'border-gray-300 bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
    >
      {active ? 'Active' : 'Draft'}
    </button>
  );
}

function Row({ title, sub, children }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-900">{title}</p>
        {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
      </div>
      {children}
    </li>
  );
}

// ── Built-in cards ────────────────────────────────────────────────────────

function CardSection({ rem }) {
  return (
    <Section title="Automatic Home cards" hint="Built into the dashboard. Draft hides the card for everyone.">
      <ul className="divide-y divide-gray-100">
        {HOME_CARDS.map((c) => (
          <Row key={c.key} title={c.label} sub={`${c.when} · ${c.who}`}>
            <ActiveSwitch active={rem.cardActive(c.key)} onChange={(v) => rem.setCardActive(c.key, v)} />
          </Row>
        ))}
      </ul>
    </Section>
  );
}

// ── Recurring checklist tasks ─────────────────────────────────────────────

function TaskSection({ onChanged }) {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState(null);
  const { staffList } = useAllStaff();
  const nameById = useMemo(() => Object.fromEntries(staffList.map((s) => [s.id, s.full_name])), [staffList]);

  // Shared tasks only (no owner) — personal to-dos are each person's own.
  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('task_templates').select('id, label, cadence, scope, assigned_staff_id, active, due_day')
      .in('cadence', ['daily', 'weekly', 'monthly'])
      .is('owner_staff_id', null).is('rock_id', null).is('meeting_id', null).is('issue_id', null)
      .order('cadence').order('sort_order');
    if (err) setError(err.message); else { setError(null); setTasks(data || []); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (t, active) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, active } : x)));
    const { error: err } = await supabase.from('task_templates').update({ active }).eq('id', t.id);
    if (err) setError(err.message);
    await load();
    onChanged?.();
  };

  const who = (t) => (t.assigned_staff_id ? nameById[t.assigned_staff_id] || 'One person'
    : t.scope === 'team' ? 'Team — once for everyone' : 'Everyone — each person');

  return (
    <Section title="Recurring checklist tasks" hint="The daily / weekly / monthly tasks in everyone's checklist. Draft takes them off the checklist.">
      {error && <p className="text-xs text-red-600">{error}</p>}
      {tasks === null ? <p className="text-xs text-gray-400">Loading…</p> : !tasks.length ? (
        <p className="text-xs text-gray-400">No shared recurring tasks.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {tasks.map((t) => (
            <Row key={t.id} title={t.label} sub={`${CADENCE_WORD[t.cadence]} · ${who(t)}`}>
              <ActiveSwitch active={t.active} onChange={(v) => toggle(t, v)} />
            </Row>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ── Manager-made reminders ────────────────────────────────────────────────

function ReminderSection({ rem, clients, pipelineIds }) {
  const [editing, setEditing] = useState(null); // reminder row, or {} for new
  const { staffList } = useAllStaff();
  const nameById = useMemo(() => Object.fromEntries(staffList.map((s) => [s.id, s.full_name])), [staffList]);
  const today = useMemo(() => todayDate(), []);
  const firing = (r) => reminderHits(r, { clients, pipelineIds, today }).length;

  const audienceText = (r) => (r.audience === 'staff' ? nameById[r.audience_staff_id] || 'A specific person' : AUDIENCES[r.audience]);

  const remove = (r) => {
    if (window.confirm(`Delete the reminder "${r.title}"? Its Done history goes with it.`)) rem.deleteReminder(r.id);
  };

  return (
    <Section
      title="Conditional reminders"
      hint="Made here. They pop up on Home for the people you choose, with a Done button."
      action={!editing && (
        <button onClick={() => setEditing({})} className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500">
          <Plus className="h-3.5 w-3.5" /> New reminder
        </button>
      )}
    >
      {editing && (
        <ReminderForm
          initial={editing}
          staffList={staffList}
          clients={clients}
          pipelineIds={pipelineIds}
          onCancel={() => setEditing(null)}
          onSave={async (fields) => { if (await rem.saveReminder(fields, editing.id)) setEditing(null); }}
        />
      )}
      {!rem.reminders.length && !editing ? (
        <p className="text-xs text-gray-400">No reminders yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rem.reminders.filter((r) => r.id !== editing?.id).map((r) => {
            const n = firing(r);
            return (
              <Row
                key={r.id}
                title={r.title}
                sub={`${describeTrigger(r)} · ${audienceText(r)} · ${n ? `${n} firing now` : 'nothing due now'}`}
              >
                <button onClick={() => setEditing(r)} title="Edit" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => remove(r)} title="Delete" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                <ActiveSwitch active={r.active} onChange={(v) => rem.saveReminder({ active: v }, r.id)} />
              </Row>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function ReminderForm({ initial, staffList, clients, pipelineIds, onSave, onCancel }) {
  const [f, setF] = useState(() => ({
    title: initial.title || '',
    description: initial.description || '',
    trigger_type: initial.trigger_type || 'client',
    condition: initial.condition || 'program_due',
    days: initial.days ?? CLIENT_CONDITIONS[initial.condition || 'program_due'].defaultDays,
    allocated_only: initial.allocated_only ?? true,
    cadence: initial.cadence || 'weekly',
    schedule_date: initial.schedule_date || '',
    schedule_day: initial.schedule_day || 1,
    audience: initial.audience || 'coach',
    audience_staff_id: initial.audience_staff_id || '',
    active: initial.active ?? false,
  }));
  const [saving, setSaving] = useState(false);
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));
  const cond = CLIENT_CONDITIONS[f.condition];

  const pickCondition = (condition) => {
    const c = CLIENT_CONDITIONS[condition];
    set({ condition, days: c.defaultDays ?? null, allocated_only: c.allocatedDefault });
  };
  const pickTrigger = (trigger_type) => set({
    trigger_type,
    audience: trigger_type === 'schedule' && f.audience === 'coach' ? 'everyone' : f.audience,
  });

  const fields = () => {
    const base = {
      title: f.title.trim(),
      description: f.description.trim() || null,
      trigger_type: f.trigger_type,
      audience: f.audience,
      audience_staff_id: f.audience === 'staff' ? f.audience_staff_id || null : null,
      active: f.active,
      condition: null, days: null, allocated_only: true, cadence: null, schedule_date: null, schedule_day: null,
    };
    if (f.trigger_type === 'client') {
      return {
        ...base,
        condition: f.condition,
        days: cond.daysLabel ? Math.max(0, Math.min(365, parseInt(f.days, 10) || 0)) : null,
        allocated_only: cond.noAllocatedOption ? false : f.allocated_only,
      };
    }
    return {
      ...base,
      cadence: f.cadence,
      schedule_date: f.cadence === 'once' ? f.schedule_date || null : null,
      schedule_day: f.cadence === 'weekly' || f.cadence === 'monthly' ? Number(f.schedule_day) : null,
    };
  };

  const preview = useMemo(() => {
    try { return reminderHits(fields(), { clients, pipelineIds, today: todayDate() }).length; } catch { return 0; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, clients, pipelineIds]);

  const valid = f.title.trim()
    && (f.trigger_type !== 'schedule' || f.cadence !== 'once' || f.schedule_date)
    && (f.audience !== 'staff' || f.audience_staff_id);

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    await onSave(fields());
    setSaving(false);
  };

  const label = 'mb-1 block text-[11px] font-medium text-gray-600';

  return (
    <form onSubmit={submit} className="mb-3 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/30 p-3">
      <div>
        <label className={label}>Reminder</label>
        <input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Write next programme" className={input} autoFocus />
      </div>
      <div>
        <label className={label}>Details (optional)</label>
        <textarea value={f.description} onChange={(e) => set({ description: e.target.value })} rows={2} placeholder="What to do — shown under the title" className={input} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Pops up when…</label>
          <select value={f.trigger_type} onChange={(e) => pickTrigger(e.target.value)} className={input}>
            <option value="client">A client matches a condition</option>
            <option value="schedule">On a date / schedule</option>
          </select>
        </div>

        {f.trigger_type === 'client' ? (
          <div>
            <label className={label}>Condition</label>
            <select value={f.condition} onChange={(e) => pickCondition(e.target.value)} className={input}>
              {Object.entries(CLIENT_CONDITIONS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className={label}>How often</label>
            <select value={f.cadence} onChange={(e) => set({ cadence: e.target.value, schedule_day: 1 })} className={input}>
              {Object.entries(CADENCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        )}
      </div>

      {f.trigger_type === 'client' && (cond.daysLabel || !cond.noAllocatedOption) && (
        <div className="flex flex-wrap items-center gap-4">
          {cond.daysLabel && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input value={f.days ?? ''} onChange={(e) => set({ days: e.target.value })} inputMode="numeric" className={`${input} w-20`} aria-label="Days" />
              {cond.daysLabel}
            </label>
          )}
          {!cond.noAllocatedOption && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={f.allocated_only} onChange={(e) => set({ allocated_only: e.target.checked })} />
              Allocated clients only
            </label>
          )}
        </div>
      )}

      {f.trigger_type === 'schedule' && f.cadence === 'once' && (
        <div>
          <label className={label}>Date</label>
          <input type="date" value={f.schedule_date} onChange={(e) => set({ schedule_date: e.target.value })} className={`${input} sm:w-48`} />
        </div>
      )}
      {f.trigger_type === 'schedule' && f.cadence === 'weekly' && (
        <div>
          <label className={label}>From</label>
          <select value={f.schedule_day} onChange={(e) => set({ schedule_day: e.target.value })} className={`${input} sm:w-48`}>
            {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
          </select>
        </div>
      )}
      {f.trigger_type === 'schedule' && f.cadence === 'monthly' && (
        <div>
          <label className={label}>From day of the month</label>
          <select value={f.schedule_day} onChange={(e) => set({ schedule_day: e.target.value })} className={`${input} sm:w-48`}>
            {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Shows for</label>
          <select value={f.audience} onChange={(e) => set({ audience: e.target.value })} className={input}>
            {Object.entries(AUDIENCES)
              .filter(([k]) => k !== 'coach' || f.trigger_type === 'client')
              .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {f.audience === 'staff' && (
          <div>
            <label className={label}>Person</label>
            <select value={f.audience_staff_id} onChange={(e) => set({ audience_staff_id: e.target.value })} className={input}>
              <option value="">Choose…</option>
              {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
        )}
      </div>
      {f.audience === 'coach' && (
        <p className="text-[11px] text-gray-500">Group-programme and unallocated clients go to managers.</p>
      )}

      <p className="text-xs text-gray-600">
        {f.trigger_type === 'client'
          ? <>Right now this matches <strong>{preview}</strong> client{preview === 1 ? '' : 's'}.</>
          : preview ? 'This would be showing now.' : 'Not due yet.'}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="mr-auto flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} />
          Active (unticked = Draft, nobody sees it)
        </label>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
        <button type="submit" disabled={saving || !valid} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
          {saving ? 'Saving…' : initial.id ? 'Save' : 'Create reminder'}
        </button>
      </div>
    </form>
  );
}
