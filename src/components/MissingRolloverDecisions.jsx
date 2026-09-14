import { CalendarClock } from 'lucide-react';

// Home-page notice: onboarding clients now in their final week (week 4 —
// days 21-27 of the program) with no rollover call made yet. Surfaced a
// full week before the program actually ends, same "catch it before it
// becomes a problem" idea as NewClientsToAllocate.jsx. Straight-in members
// never need a rollover decision (see OnboardingCard.jsx) so they're
// excluded, and a client already 'removed' from the pipeline shouldn't
// re-appear here either.
export default function MissingRolloverDecisions({ week4Clients = [], decisions = {}, setDecision, onViewClient }) {
  const pending = week4Clients.filter((c) => {
    if (c.isStraightIn) return false;
    const decision = decisions[c.id]?.decision;
    return !decision; // no decision at all (undecided, not 'removed' either)
  });

  if (pending.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50/40 p-5">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock className="h-4 w-4 text-amber-600" />
        <h2 className="font-semibold text-gray-900">Rollover Decisions Needed</h2>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
          {pending.length}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-4">In their final onboarding week with no rollover call made yet — decide before the program ends.</p>

      <div className="space-y-2">
        {pending.map((c) => {
          const decisionMeta = { shortProduct: c.shortProduct, isStraightIn: c.isStraightIn, product: c.product };
          return (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5"
            >
              <button onClick={() => onViewClient?.(c.id)} className="text-left min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate hover:underline">{c.name || 'Unknown'}</p>
                <p className="text-xs text-gray-500">{c.shortProduct || c.product} · day {c.daysSinceStart}</p>
              </button>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setDecision(c.id, 'rollover', decisionMeta)}
                  className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                >
                  ✓ Rolling over
                </button>
                <button
                  onClick={() => setDecision(c.id, 'no-rollover', decisionMeta)}
                  className="rounded-lg border border-gray-300 bg-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-300 hover:text-gray-700 transition-colors"
                >
                  ✗ Not rolling
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
