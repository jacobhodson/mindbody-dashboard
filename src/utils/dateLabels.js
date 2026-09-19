import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';

// Shared by the Home tab's actionable notices (NewClientsToAllocate.jsx,
// PipelineClientsToAllocate.jsx) so "Started N days ago" reads identically
// wherever a client's creation_date is shown.
export function daysAgoLabel(creationDate) {
  if (!creationDate) return null;
  const days = differenceInCalendarDays(startOfDay(new Date()), parseISO(creationDate));
  if (days <= 0) return 'Started today';
  if (days === 1) return 'Started yesterday';
  return `Started ${days} days ago`;
}
