// Shared "Group Program" sentinel-select logic — used by both
// ClientDetail.jsx's caseload picker and ClientsList.jsx's inline version,
// so the two stay in sync rather than drifting.
export const GROUP_VALUE = '__group__';

export function caseloadSelectValue(client) {
  return client.assigned_group ? GROUP_VALUE : (client.assigned_staff_id || '');
}

// The payload shape useClientDetail.js's/useAllClients.js's updateCaseload
// expect: { group: true } | { staffId } | {} (unassigned).
export function caseloadPayloadFor(value) {
  if (value === GROUP_VALUE) return { group: true };
  if (value) return { staffId: value };
  return {};
}
