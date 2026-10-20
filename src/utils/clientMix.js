// Client mix — who's on which kind of membership, the onboarding pipeline,
// and what share of active clients are on Red's List. Pure functions, shared
// by the Operations tab (ClientMixSnapshot.jsx, live) and
// netlify/functions/scheduled-client-mix-snapshot.js (weekly snapshot), so
// the two can never disagree on a definition.

// Short programmes: a "no-rollover" decision takes the client out of the
// pipeline (they've finished, not rolled onto a membership).
export const SHORT_PRODUCTS = new Set(['3-Session', '14-Day']);

// Contract name -> 'pt' | 'online' | 'group' | 'addon', from the contract
// names this account actually sells (checked live 2026-10-13). Anything with
// a semi-private / personal component counts as PT, including the hybrid
// "1x Semi-private + group" and "2 Semi Private + Online Coaching" packages;
// add-ons (Open Gym Add-on) aren't a membership on their own.
export function contractCategory(name = '') {
  const n = name.toLowerCase();
  if (/semi|personal/.test(n)) return 'pt';
  if (/online/.test(n)) return 'online';
  if (/add-on|addon/.test(n)) return 'addon';
  return 'group';
}

const PRIORITY = ['pt', 'online', 'group', 'addon'];

// activeContracts: rows from the active_member_contracts() RPC
// ({ client_id, contract_name }, one per active contract). Each client is
// counted once, under their highest-touch membership (PT > Online > Group),
// so Group + PT + Online + Other always adds up to Total.
export function categoriseClients(activeContracts) {
  const byClient = new Map(); // client_id -> category
  for (const row of activeContracts || []) {
    const id = String(row.client_id);
    const cat = contractCategory(row.contract_name);
    const prev = byClient.get(id);
    if (!prev || PRIORITY.indexOf(cat) < PRIORITY.indexOf(prev)) byClient.set(id, cat);
  }
  return byClient;
}

// Onboarding clients hidden from Red's List (Dashboard's onboardingIds):
// everyone in weeks 1–4 except short-programme no-rollovers.
export function onboardingClientIds(onboardingClients, decisions) {
  return new Set(
    onboardingClients
      .filter((c) => !SHORT_PRODUCTS.has(c.shortProduct) || decisions[c.id]?.decision !== 'no-rollover')
      .map((c) => String(c.id)),
  );
}

// The onboarding pipeline — clients on a genuine front-end offer/intro pass
// (Dashboard's tradeOnboardingIds; the Clients tab's 'Trial' status).
// Straight-in members joined onto a full membership, so they're not "in the
// pipeline"; a 'removed' decision or a short-programme no-rollover takes
// someone out.
export function pipelineClientIds(onboardingClients, decisions) {
  return new Set(
    onboardingClients
      .filter((c) => !c.isStraightIn)
      .filter((c) => decisions[c.id]?.decision !== 'removed')
      .filter((c) => !SHORT_PRODUCTS.has(c.shortProduct) || decisions[c.id]?.decision !== 'no-rollover')
      .map((c) => c.id),
  );
}

// onboarding: the /api/mb-onboarding response (week1..week4 columns).
export function allOnboardingClients(onboarding) {
  return [
    ...(onboarding?.week1 || []), ...(onboarding?.week2 || []),
    ...(onboarding?.week3 || []), ...(onboarding?.week4 || []),
  ];
}

// Everything the Operations snapshot and the weekly row show.
//  - reds: /api/mb-client-analytics `reds` (default 7-day window — the same
//    list Red's List shows on load). Red's List hides onboarding clients.
//    Red % is group-only on both sides: reds whose membership category is
//    Group ÷ active Group members. PT/Online clients (incl. hybrid
//    "Semi-private + group") are excluded — PT reds live on the PT tab.
export function summariseClientMix({ activeContracts, reds, onboarding, decisions }) {
  const categories = categoriseClients(activeContracts);
  const counts = { pt: 0, online: 0, group: 0, addon: 0 };
  for (const cat of categories.values()) counts[cat]++;

  const onboardingClients = allOnboardingClients(onboarding);
  const hiddenFromReds = onboardingClientIds(onboardingClients, decisions);
  const redIds = new Set(
    (reds || [])
      .map((c) => String(c.id))
      .filter((id) => !hiddenFromReds.has(id) && categories.get(id) === 'group'),
  );

  const active = categories.size;
  return {
    group:    counts.group,
    pt:       counts.pt,
    online:   counts.online,
    other:    counts.addon,
    active,
    pipeline: pipelineClientIds(onboardingClients, decisions).size,
    // Straight-in new members still in their first 4 weeks — onboarding,
    // but already on a full membership (so already in `active`). Shown
    // alongside the pipeline on the Operations tab; not snapshotted.
    newMembersOnboarding: onboardingClients
      .filter((c) => c.isStraightIn && decisions[c.id]?.decision !== 'removed').length,
    reds:     redIds.size,
    redPct:   counts.group > 0 ? Math.round((redIds.size / counts.group) * 1000) / 10 : null,
  };
}
