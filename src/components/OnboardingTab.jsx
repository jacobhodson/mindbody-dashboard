import { useState, useMemo, useCallback } from 'react';
import { startOfWeek, subWeeks, format } from 'date-fns';
import { Users2 } from 'lucide-react';
import OnboardingBoard   from './OnboardingBoard.jsx';
import OnboardingReds    from './OnboardingReds.jsx';
import OnboardingRemoved from './OnboardingRemoved.jsx';
import { useOnboardingTasks } from '../utils/useOnboardingTasks.js';
import { useOnboardingTaskTemplates } from '../utils/useOnboardingTaskTemplates.js';
import { useOnboardingStartOverrides } from '../utils/useOnboardingStartOverrides.js';
import { useAllClients } from '../utils/useAllClients.js';
import { useAllStaff } from '../utils/useAllStaff.js';

// Short-program products get removed from the board if no-rollover is selected
const SHORT_PRODUCTS = new Set(['3-Session', '14-Day']);

function StatPill({ label, value, color = 'text-gray-700' }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-center">
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function OnboardingTab({
  data,
  loading,
  error,
  contactLog,
  decisions,
  getDecision,
  setDecision,
  staff,
  isManager,
  refreshOnboarding,
}) {
  const { templates: taskTemplates, tasksByWeek } = useOnboardingTaskTemplates();
  const { isComplete, toggleTask } = useOnboardingTasks(staff, taskTemplates);
  const { clientsList, updateCaseload } = useAllClients();
  const { staffList } = useAllStaff();
  const { setStartOverride } = useOnboardingStartOverrides(staff);
  const [myClientsOnly, setMyClientsOnly] = useState(false);

  // Both the date-picker on a card and dragging a card to another column
  // boil down to the same write: set (or clear) this client's start-date
  // override, then re-pull the live onboarding data so the board reflects
  // the week mb-onboarding.js now computes for them.
  const handleSetStartDate = useCallback(async (clientId, dateStr) => {
    await setStartOverride(clientId, dateStr);
    await refreshOnboarding?.();
  }, [setStartOverride, refreshOnboarding]);

  // Dragging to week N sets the override to the Monday of "N-1 weeks before
  // this week's Monday" — guarantees they land in week N today regardless
  // of what day it is, and stays a plain start-date override under the
  // hood, same as the date picker.
  const handleDropToWeek = useCallback((clientId, targetWeek) => {
    const thisMonday   = startOfWeek(new Date(), { weekStartsOn: 1 });
    const targetMonday = subWeeks(thisMonday, targetWeek - 1);
    return handleSetStartDate(clientId, format(targetMonday, 'yyyy-MM-dd'));
  }, [handleSetStartDate]);

  // Coach assignment per onboarding client, keyed by Mindbody ID (the id
  // OnboardingCard/pipelineReds work with) rather than the Supabase `clients`
  // row id — same caseload fields the Clients tab edits
  // (assigned_staff_id/assigned_group), so a coach set there immediately
  // shows up here too. `id` is kept for updateCaseload, which needs the
  // Supabase row id, not the Mindbody one.
  const assignmentByMindbodyId = useMemo(() => {
    const m = {};
    for (const c of clientsList) {
      m[c.mindbody_id] = { id: c.id, staffId: c.assigned_staff_id, group: c.assigned_group };
    }
    return m;
  }, [clientsList]);

  const staffNameById = useMemo(() => {
    const m = {};
    for (const s of staffList) m[s.id] = s.full_name;
    return m;
  }, [staffList]);

  // "My clients" filters every board/reds/removed list down to clients
  // whose caseload (assigned_staff_id) is the logged-in staff member — so a
  // coach can see just their own onboarding tasks instead of the whole team's.
  const mine = (c) => !myClientsOnly || assignmentByMindbodyId[c.id]?.staffId === staff?.id;

  // Clients manually removed from the pipeline (any product, any week) —
  // e.g. an existing member whose contract change was mistaken for a new
  // onboarding purchase, or a one-off trial visitor. Excluded from every
  // board column below regardless of product type; short-product clients
  // who explicitly chose no-rollover are excluded too, but that's a
  // narrower, rollover-specific case (see SHORT_PRODUCTS above).
  const displayData = useMemo(() => {
    if (!data) return null;
    const keep = (arr = []) =>
      arr.filter((c) => {
        if (decisions[c.id]?.decision === 'removed') return false;
        if (!mine(c)) return false;
        if (!SHORT_PRODUCTS.has(c.shortProduct)) return true;
        return decisions[c.id]?.decision !== 'no-rollover';
      });
    const w1 = keep(data.week1);
    const w2 = keep(data.week2);
    const w3 = keep(data.week3);
    const w4 = keep(data.week4);
    const reds = keep(data.pipelineReds);
    return {
      ...data,
      week1: w1, week2: w2, week3: w3, week4: w4,
      pipelineReds: reds,
      summary: {
        ...data.summary,
        total:      w1.length + w2.length + w3.length + w4.length,
        atRisk:     reds.length,
        week1Count: w1.length,
        week2Count: w2.length,
        week3Count: w3.length,
        week4Count: w4.length,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, decisions, myClientsOnly, assignmentByMindbodyId, staff?.id]);

  // Clients currently hidden by a 'removed' decision, so staff can restore
  // one if it was a mistake. Read from the raw (unfiltered) data — displayData
  // has already dropped them.
  const removedClients = useMemo(() => {
    if (!data) return [];
    const all = [...(data.week1 || []), ...(data.week2 || []), ...(data.week3 || []), ...(data.week4 || [])];
    const seen = new Set();
    return all.filter((c) => {
      if (decisions[c.id]?.decision !== 'removed') return false;
      if (!mine(c)) return false;
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, decisions, myClientsOnly, assignmentByMindbodyId, staff?.id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
        <div className="flex gap-4 overflow-x-auto">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="shrink-0 w-72 h-64 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-red-600">Could not load onboarding data: {error}</p>
      </div>
    );
  }

  const summary      = displayData?.summary    || {};
  const pipelineReds = displayData?.pipelineReds || [];

  const isEmpty = !displayData || (
    (displayData.week1?.length || 0) +
    (displayData.week2?.length || 0) +
    (displayData.week3?.length || 0) +
    (displayData.week4?.length || 0) === 0
  );

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 flex-1">
          <StatPill label="In pipeline" value={summary.total      ?? 0} color="text-gray-900" />
          <StatPill label="At risk"     value={summary.atRisk     ?? 0} color={summary.atRisk > 0 ? 'text-red-600' : 'text-gray-700'} />
          <StatPill label="Week 1"      value={summary.week1Count ?? 0} color="text-blue-600" />
          <StatPill label="Week 2"      value={summary.week2Count ?? 0} color="text-amber-600" />
          <StatPill label="Week 3"      value={summary.week3Count ?? 0} color="text-violet-600" />
          <StatPill label="Week 4"      value={summary.week4Count ?? 0} color="text-emerald-600" />
        </div>
        <label className="shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-700 cursor-pointer">
          <input type="checkbox" checked={myClientsOnly} onChange={(e) => setMyClientsOnly(e.target.checked)} />
          My clients only
        </label>
      </div>

      {/* Kanban board */}
      {isEmpty ? (
        <div className="rounded-xl border border-gray-200 bg-white py-20 text-center">
          <Users2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">
            {myClientsOnly ? 'No onboarding clients assigned to you' : 'No active onboarding clients'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Clients appear here when they purchase a 3-Session Pass, 14-Day Pass,<br />
            4-Week Kickstarter, Strong Dad or Strong Mum Transformation — or join<br />
            straight onto a full membership.
          </p>
        </div>
      ) : (
        <OnboardingBoard
          data={displayData}
          isComplete={isComplete}
          toggleTask={toggleTask}
          contactLog={contactLog}
          getDecision={getDecision}
          setDecision={setDecision}
          tasksByWeek={tasksByWeek}
          assignmentByMindbodyId={assignmentByMindbodyId}
          staffNameById={staffNameById}
          staffList={staffList}
          isManager={isManager}
          updateCaseload={updateCaseload}
          onSetStartDate={handleSetStartDate}
          onDropToWeek={handleDropToWeek}
        />
      )}

      {/* Pipeline reds — below the board so you can see the full kanban first */}
      {pipelineReds.length > 0 && (
        <OnboardingReds
          clients={pipelineReds}
          contactLog={contactLog}
          assignmentByMindbodyId={assignmentByMindbodyId}
          staffNameById={staffNameById}
        />
      )}

      {/* Manually removed — collapsed by default, one click to undo a mistake */}
      {removedClients.length > 0 && (
        <OnboardingRemoved clients={removedClients} setDecision={setDecision} />
      )}
    </div>
  );
}
