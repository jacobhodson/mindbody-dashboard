// The Mindbody status values this account actually uses (confirmed live —
// see the clients-database memory notes). Kept for reference only — the app
// itself no longer surfaces these individually (see SIMPLE_STATUSES below);
// managers found "Non-Member"/"Suspended"/"Terminated"/"Expired"/"Declined"
// as separate options more granular than useful day to day and asked for a
// plain Active/Inactive split instead (2026-09-15).
export const KNOWN_STATUSES = ['Active', 'Non-Member', 'Suspended', 'Terminated', 'Expired', 'Declined'];

// What the Status column/filter shows and what a manager can pick as an
// override — anything that isn't literally 'Active' collapses to 'Inactive'.
export const SIMPLE_STATUSES = ['Active', 'Inactive'];

// A manager's status_override takes precedence over the Mindbody-synced
// status column everywhere the app displays or filters by "status" — see
// 20260910000000_client_status_override.sql. Shared by ClientsList.jsx and
// ClientDetail.jsx so the two never disagree on what "effective status" means.
export function effectiveStatus(client) {
  return client.status_override || client.status;
}

// Collapses effectiveStatus down to the two values the UI shows — 'Active'
// or 'Inactive' — folding every other Mindbody status (and any legacy
// non-simple override written before this round) into 'Inactive'.
export function simplifiedStatus(client) {
  return effectiveStatus(client) === 'Active' ? 'Active' : 'Inactive';
}

export function hasStatusOverride(client) {
  return !!client.status_override && client.status_override !== client.status;
}
