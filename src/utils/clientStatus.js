// The Mindbody status values this account actually uses (confirmed live —
// see the clients-database memory notes). Kept for reference only — the app
// itself no longer surfaces these individually (see SIMPLE_STATUSES below);
// managers found "Non-Member"/"Suspended"/"Terminated"/"Expired"/"Declined"
// as separate options more granular than useful day to day and asked for a
// plain Active/Inactive split instead (2026-09-15).
export const KNOWN_STATUSES = ['Active', 'Non-Member', 'Suspended', 'Terminated', 'Expired', 'Declined'];

// What the Status column/filter shows and what a manager can pick as an
// override — anything that isn't literally 'Active' collapses to 'Inactive',
// unless the client is currently on a front-end offer (see 'Trial' below).
export const SIMPLE_STATUSES = ['Active', 'Inactive', 'Trial'];

// A manager's status_override takes precedence over the Mindbody-synced
// status column everywhere the app displays or filters by "status" — see
// 20260910000000_client_status_override.sql. Shared by ClientsList.jsx and
// ClientDetail.jsx so the two never disagree on what "effective status" means.
export function effectiveStatus(client) {
  return client.status_override || client.status;
}

// Collapses effectiveStatus down to the values the UI shows — 'Active',
// 'Inactive', or 'Trial' — folding every other Mindbody status (and any
// legacy non-simple override written before the 2026-09-15 round) into
// 'Inactive'.
//
// `pipelineIds` (optional, a Set of `clients.mindbody_id`) is the set of
// clients currently on a front-end offer/intro pass — 3-Session Pass,
// 14-Day Pass, 4-Week Kickstarter, Strong Dad/Mum — per the Onboarding tab's
// own pipeline detection (see mb-onboarding.js; straight-in members are
// deliberately excluded there, since they joined straight onto a full
// membership and are correctly 'Active' already). Passed in by Dashboard.jsx
// since it's the only place that already has the live onboarding fetch —
// callers that don't pass it (e.g. useUnallocatedClients.js) just never see
// 'Trial', which is the existing Active/Inactive behaviour unchanged.
//
// A manual override always wins over pipeline detection — a manager can
// override straight to 'Trial' too (e.g. a front-end-offer sale Mindbody
// doesn't surface cleanly), not just Active/Inactive.
export function simplifiedStatus(client, pipelineIds) {
  if (client.status_override) {
    if (SIMPLE_STATUSES.includes(client.status_override)) return client.status_override;
    return client.status_override === 'Active' ? 'Active' : 'Inactive';
  }
  if (pipelineIds?.has(client.mindbody_id)) return 'Trial';
  return client.status === 'Active' ? 'Active' : 'Inactive';
}

export function hasStatusOverride(client) {
  return !!client.status_override && client.status_override !== client.status;
}
