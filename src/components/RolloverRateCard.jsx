import { TrendingUp } from 'lucide-react';

// Read-only, pipeline-fed card — no owners/edit/archive, same reasoning as
// MetricTargetCard's isMindbody-gated attendance/revenue cards: this isn't
// something a manager types a target into, it's computed from
// onboarding_rollover_decisions via useRolloverStats.js. Sits alongside the
// regular metric cards in Scoreboard.jsx's grid and follows its Week/Month
// tab like everything else there.
export default function RolloverRateCard({ cadenceLabel, rollovers, decided, pct }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
        <p className="text-sm font-semibold text-gray-900">Rollover Rate</p>
      </div>
      <p className="text-xs text-gray-500 mt-0.5">From onboarding decisions — {cadenceLabel.toLowerCase()}</p>

      <div className="mt-2.5">
        {decided === 0 ? (
          <p className="text-xs text-gray-400 py-1.5">No rollover decisions {cadenceLabel === 'This week' ? 'this week' : 'this month'} yet</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold tabular-nums text-gray-900">{pct}%</span>
              <span className="text-xs text-gray-500 tabular-nums">{rollovers} / {decided} rolled over</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
