// The Mindbody status values this account actually uses (confirmed live —
// see the clients-database memory notes). ClientsList.jsx derives its
// dropdown from the live data instead, but ClientDetail.jsx edits one
// client at a time and has no roster to derive options from, so it falls
// back to this fixed list.
export const KNOWN_STATUSES = ['Active', 'Non-Member', 'Suspended', 'Terminated', 'Expired', 'Declined'];

// A manager's status_override takes precedence over the Mindbody-synced
// status column everywhere the app displays or filters by "status" — see
// 20260910000000_client_status_override.sql. Shared by ClientsList.jsx and
// ClientDetail.jsx so the two never disagree on what "effective status" means.
export function effectiveStatus(client) {
  return client.status_override || client.status;
}

export function hasStatusOverride(client) {
  return !!client.status_override && client.status_override !== client.status;
}
