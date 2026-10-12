import { differenceInCalendarDays, parseISO } from 'date-fns';

// A client is due another strategy session once their last one is more than
// this many days ago (or they've never had one). Shared by ClientDetail and
// ClientsList so the flag and the "Due" filter always agree.
export const STRATEGY_FOLLOWUP_DAYS = 90;

// lastDate is clients.last_strategy_session ('yyyy-MM-dd' or null).
// Returns { days: number|null, due: boolean, never: boolean }.
export function strategyStatus(lastDate, today) {
  if (!lastDate) return { days: null, due: true, never: true };
  const days = differenceInCalendarDays(today, parseISO(lastDate));
  return { days, due: days > STRATEGY_FOLLOWUP_DAYS, never: false };
}
