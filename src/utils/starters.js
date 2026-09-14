import { parseISO, differenceInCalendarDays } from 'date-fns';

// "Starters" = created in the last 30 days — new clients who likely still
// need a package/caseload manually allocated. Shared by ClientsList.jsx
// (the "No package" row badge) and useUnallocatedClients.js (the Home
// "New Clients to Allocate" panel), so the two never drift on what counts
// as "new".
export const STARTER_DAYS = 30;

export function isStarter(client, today) {
  return !!client.creation_date && differenceInCalendarDays(today, parseISO(client.creation_date)) <= STARTER_DAYS;
}
