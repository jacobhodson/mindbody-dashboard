import {
  format, parseISO, differenceInCalendarDays, getDaysInMonth, setYear, addYears, isBefore, isValid, startOfDay,
} from 'date-fns';
import { periodStartFor } from './periods.js';
import { simplifiedStatus } from './clientStatus.js';
import { strategyStatus, STRATEGY_FOLLOWUP_DAYS } from './strategySessions.js';

/**
 * Manager-made Home reminders (20261015020000_home_reminders.sql) — what
 * each trigger means and which reminders are due right now. Pure functions
 * so the Home list and the manager panel's "firing now" counts agree.
 *
 * Every hit carries an `occurrence`: the value that made it fire (the
 * client's due date, their last visit, this week's Monday…). "Done" is
 * stored against it, so a reminder comes back on its own once that value
 * changes — e.g. a new programme due date gets a fresh reminder.
 */

// Client conditions. `days` is the editable number; `allocatedDefault`
// pre-ticks "allocated clients only" on a new reminder.
export const CLIENT_CONDITIONS = {
  program_due: {
    label: 'Next programme due',
    daysLabel: 'days before it’s due',
    defaultDays: 7,
    allocatedDefault: true,
    test: (c, days, today) => {
      if (!c.next_program_due) return null;
      const left = differenceInCalendarDays(parseISO(c.next_program_due), today);
      if (left > days) return null;
      return {
        occurrence: c.next_program_due,
        detail: left < 0 ? `Programme overdue by ${-left} day${left === -1 ? '' : 's'}`
          : left === 0 ? 'Programme due today'
          : `Programme due ${format(parseISO(c.next_program_due), 'EEE d MMM')}`,
      };
    },
  },
  strategy_due: {
    label: 'Strategy session due',
    daysLabel: 'days since their last one',
    defaultDays: STRATEGY_FOLLOWUP_DAYS,
    allocatedDefault: true,
    test: (c, days, today) => {
      const s = strategyStatus(c.last_strategy_session, today);
      if (!s.never && s.days <= days) return null;
      return {
        occurrence: c.last_strategy_session || 'never',
        detail: s.never ? 'No strategy session on record' : `Last strategy session ${s.days} days ago`,
      };
    },
  },
  no_visit: {
    label: 'Hasn’t visited in a while',
    daysLabel: 'days without a visit',
    defaultDays: 14,
    allocatedDefault: true,
    test: (c, days, today) => {
      if (!c.last_visit_date) return null;
      const gap = differenceInCalendarDays(today, parseISO(c.last_visit_date));
      if (gap < days) return null;
      return { occurrence: c.last_visit_date, detail: `Last visit ${gap} days ago` };
    },
  },
  birthday: {
    label: 'Birthday coming up',
    daysLabel: 'days before their birthday',
    defaultDays: 3,
    allocatedDefault: false,
    test: (c, days, today) => {
      const born = c.birth_date ? parseISO(c.birth_date) : null;
      if (!born || !isValid(born)) return null;
      let next = setYear(born, today.getFullYear());
      if (isBefore(next, today)) next = addYears(next, 1);
      const left = differenceInCalendarDays(next, today);
      if (left > days) return null;
      return {
        occurrence: format(next, 'yyyy-MM-dd'),
        detail: left === 0 ? 'Birthday today 🎂' : `Birthday ${format(next, 'EEE d MMM')}`,
      };
    },
  },
  red_alert: {
    label: 'Has a Mindbody red alert',
    allocatedDefault: false,
    test: (c) => {
      const alert = (c.red_alert || '').trim();
      return alert ? { occurrence: alert.slice(0, 200), detail: alert } : null;
    },
  },
  no_coach: {
    label: 'No coach assigned',
    allocatedDefault: false,
    noAllocatedOption: true,
    test: (c) => (c.assigned_staff_id || c.assigned_group ? null : { occurrence: 'unassigned', detail: 'Not on anyone’s caseload' }),
  },
};

export const CADENCES = {
  once:    'Once, on a date',
  daily:   'Every day',
  weekly:  'Every week',
  monthly: 'Every month',
};

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const AUDIENCES = {
  everyone: 'Everyone',
  managers: 'Managers only',
  staff:    'A specific person',
  coach:    'The client’s coach',
};

/** A schedule reminder's current occurrence, or null if it isn't due yet. */
export function scheduleOccurrence(r, today) {
  const todayStr = format(today, 'yyyy-MM-dd');
  switch (r.cadence) {
    case 'once':
      return r.schedule_date && todayStr >= r.schedule_date ? r.schedule_date : null;
    case 'daily':
      return todayStr;
    case 'weekly': {
      const weekday = ((today.getDay() + 6) % 7) + 1; // Mon=1..Sun=7
      return weekday >= (r.schedule_day || 1) ? periodStartFor('weekly', today) : null;
    }
    case 'monthly': {
      const day = Math.min(r.schedule_day || 1, getDaysInMonth(today));
      return today.getDate() >= day ? periodStartFor('monthly', today) : null;
    }
    default:
      return null;
  }
}

/** When a schedule reminder fires, in words — for the panel. */
export function describeTrigger(r) {
  if (r.trigger_type === 'client') {
    const cond = CLIENT_CONDITIONS[r.condition];
    if (!cond) return r.condition;
    const parts = [cond.label];
    if (cond.daysLabel && r.days != null) parts.push(`(${r.days} ${cond.daysLabel})`);
    if (r.allocated_only && !cond.noAllocatedOption) parts.push('· allocated clients');
    return parts.join(' ');
  }
  if (r.cadence === 'once') return r.schedule_date ? `On ${format(parseISO(r.schedule_date), 'd MMM yyyy')}` : 'Once';
  if (r.cadence === 'weekly') return `Every ${WEEKDAYS[(r.schedule_day || 1) - 1]}`;
  if (r.cadence === 'monthly') return `Monthly on day ${r.schedule_day || 1}`;
  return CADENCES[r.cadence] || r.cadence;
}

/**
 * Everything one reminder is firing for right now, ignoring who it's for
 * and whether it's been done: [{ client|null, occurrence, detail }].
 */
export function reminderHits(r, { clients, pipelineIds, today }) {
  if (r.trigger_type === 'schedule') {
    const occurrence = scheduleOccurrence(r, today);
    return occurrence ? [{ client: null, occurrence, detail: null }] : [];
  }
  const cond = CLIENT_CONDITIONS[r.condition];
  if (!cond) return [];
  const days = r.days ?? cond.defaultDays ?? 0;
  const hits = [];
  for (const c of clients) {
    if (simplifiedStatus(c, pipelineIds) === 'Inactive') continue;
    if (r.allocated_only && !cond.noAllocatedOption && !c.assigned_staff_id && !c.assigned_group) continue;
    const hit = cond.test(c, days, today);
    if (hit) hits.push({ client: c, ...hit });
  }
  return hits;
}

/** Is this hit for the signed-in person? */
export function hitIsForMe(r, hit, { staffId, isManager }) {
  switch (r.audience) {
    case 'everyone': return true;
    case 'managers': return isManager;
    case 'staff':    return r.audience_staff_id === staffId;
    case 'coach': {
      const coach = hit.client?.assigned_staff_id;
      // Group-programme / unallocated clients have no coach — managers pick those up.
      return coach ? coach === staffId : isManager;
    }
    default: return false;
  }
}

export const completionKey = (reminderId, clientId, occurrence) => `${reminderId}|${clientId || ''}|${occurrence}`;

export const todayDate = () => startOfDay(new Date());
