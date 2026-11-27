import { CalendarClock } from 'lucide-react';
import HomeCard from './HomeCard.jsx';

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
    <HomeCard id="missing_rollovers" tone="amber" icon={CalendarClock} title="Rollover Decisions Needed" count={pending.length}>
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
    </HomeCard>
  );
}
