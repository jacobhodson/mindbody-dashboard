import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { useGroupPerformance } from '../../utils/useGroupPerformance.js';
import { monthKeyFor, monthOptions } from '../../utils/snapshotPeriods.js';
import TeamByCoach from '../TeamByCoach.jsx';

const LIVE_PERIODS = [
  ['thisWeek', 'This week'], ['lastWeek', 'Last week'], ['thisMonth', 'This month'], ['lastMonth', 'Last month'],
];

function fmtAUD(n) { return n == null ? '–' : `$${Math.round(n).toLocaleString('en-AU')}`; }

// The live endpoints key coaches by Mindbody name, not our staff id — match
// on first name, the same rule scheduled-coach-snapshot.js uses.
function matchCoach(rows, fullName) {
  const first = (fullName || '').split(/\s+/)[0];
  return first ? (rows || []).find((c) => (c.staffName || '').includes(first)) : null;
}

/**
 * Bottom of a person's profile: their slice of the Team page. Live PT and
 * group-class figures (same sources as the Team page's PT Sessions / Group
 * Classes views), then TeamByCoach pinned to them — the year's LER chart,
 * monthly revenue/wages/LER/active clients table, and task completion.
 */
export default function StaffPerformance({ person, team, isManager, ptData, ptLoading, onOpenWages }) {
  const year = new Date().getFullYear();
  const [period, setPeriod] = useState(monthKeyFor(new Date()));
  const { data: groupData, loading: groupLoading } = useGroupPerformance(isManager && person.is_coach !== false);

  if (person.is_coach === false) {
    return <p className="text-sm text-gray-500">{person.full_name} isn't marked as a coach, so there are no coaching figures for them.</p>;
  }

  const pt = matchCoach(ptData?.coachPerformance?.byCoach, person.full_name);
  const group = matchCoach(groupData?.byCoach, person.full_name);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="px-4 py-2 font-medium">Live</th>
              {LIVE_PERIODS.map(([k, l]) => <th key={k} className="px-3 py-2 text-right font-medium">{l}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <LiveRow label="PT & semi-private" row={pt} loading={ptLoading} unit="sessions" />
            <LiveRow label="Group classes" row={group} loading={groupLoading} unit="classes" />
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-gray-500">
          Tasks for
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {monthOptions(year).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
        <button onClick={onOpenWages} className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:underline">
          <Wallet className="h-3.5 w-3.5" /> Edit wages on the Team page
        </button>
      </div>

      <TeamByCoach
        staffList={team.staffList}
        monthlyRows={team.monthlyRows}
        statsFor={team.statsFor}
        period={period}
        year={year}
        loading={team.loading}
        fixedStaffId={person.id}
      />
    </div>
  );
}

function LiveRow({ label, row, loading, unit }) {
  return (
    <tr>
      <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">{label}</td>
      {LIVE_PERIODS.map(([k]) => (
        <td key={k} className="px-3 py-2.5 text-right tabular-nums">
          {loading ? <span className="ml-auto block h-4 w-12 animate-pulse rounded bg-gray-200" /> : (
            <>
              <span className="font-semibold text-gray-900">{fmtAUD(row?.[k]?.value ?? (row ? 0 : null))}</span>
              <span className="block text-[11px] text-gray-400">{row?.[k]?.count ?? 0} {unit}</span>
            </>
          )}
        </td>
      ))}
    </tr>
  );
}
