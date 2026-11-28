import { useState, useEffect, useMemo, useCallback } from 'react';
import { Users, CalendarCheck2, FileText, AlertTriangle, TrendingUp } from 'lucide-react';
import { format, parseISO, addDays, subMonths } from 'date-fns';
import { supabase } from '../lib/supabaseClient.js';
import { useAllStaff } from '../utils/useAllStaff.js';
import { useCoachMonthlySnapshots } from '../utils/useCoachMonthlySnapshots.js';
import { useCoachRolling30 } from '../utils/useCoachRolling30.js';
import { useTeamTaskStats } from '../utils/useTeamTaskStats.js';
import { mondayOf } from '../utils/useOneOnOnes.js';
import { lerTone } from '../utils/teamMetrics.js';
import { ROCK_GRADIENTS } from '../utils/rocks.js';
import TeamWholePage from './team/TeamWholePage.jsx';
import StaffProfilePage from './team/StaffProfilePage.jsx';
import { PersonAvatar, roleLabel } from './team/people.jsx';

/**
 * Manager-only Team tab (2026-11-27 redesign) — a card gallery styled like
 * the Rocks tab: one "Team" tile (the whole-team performance views that used
 * to be the entire tab — team/TeamWholePage.jsx) and one tile per active
 * staff member. A person's tile opens their profile page
 * (team/StaffProfilePage.jsx): weekly 1-1s with to-dos, documents (first aid
 * etc., private bucket), and their slice of the performance data.
 *
 * `openId` (null = gallery, 'team', or a staff id) is lifted to Dashboard so
 * clicking "Team" in the sidebar always lands back on the gallery.
 *
 * The snapshot/task-stat hooks are loaded once here and shared by the Team
 * page, every profile page and the tile LER figures.
 */
export default function TeamTab({ isManager, staff, currentStaffId, ptData, ptLoading, ptError, pipelineIds, onViewClient, openId, onOpenChange }) {
  const year = new Date().getFullYear();
  const [localOpenId, setLocalOpenId] = useState(null);
  const current = onOpenChange ? openId : localOpenId;
  const setOpen = onOpenChange || setLocalOpenId;
  const [wholeMode, setWholeMode] = useState('coach');

  const { staffList, loading: staffLoading, reload: reloadStaff } = useAllStaff();
  const { rows: monthlyRows, loading: monthlyLoading, reload: reloadMonthly } = useCoachMonthlySnapshots(isManager, year);
  const { latest: rollingLatest, loading: rollingLoading, reload: reloadRolling } = useCoachRolling30(isManager);
  const { statsFor, loading: tasksLoading } = useTeamTaskStats(isManager);
  const summary = useProfileSummary(isManager, current);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [current]);

  if (!isManager) return null;

  const team = {
    staffList, reloadStaff, monthlyRows, reloadMonthly, rollingLatest, reloadRolling, statsFor,
    loading: staffLoading || monthlyLoading || rollingLoading || tasksLoading,
  };
  const pageProps = { isManager, currentStaffId, ptData, ptLoading, ptError, pipelineIds, onViewClient, team };

  if (current === 'team') {
    return <TeamWholePage key={wholeMode} {...pageProps} initialMode={wholeMode} onBack={() => { setWholeMode('coach'); setOpen(null); }} />;
  }

  const person = current ? staffList.find((s) => s.id === current) : null;
  if (person) {
    return (
      <StaffProfilePage
        person={person}
        staff={staff}
        {...pageProps}
        onBack={() => setOpen(null)}
        onOpenWages={() => { setWholeMode('wages'); setOpen('team'); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Users className="h-5 w-5 text-emerald-600" /> Team
        </h1>
        <p className="text-sm text-gray-500">
          Open someone's page for their weekly 1-1s, documents and numbers, or the Team tile for everyone at once.
        </p>
      </div>

      {staffLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TeamTile count={staffList.length} onOpen={() => setOpen('team')} />
          {staffList.map((s) => (
            <PersonTile
              key={s.id}
              person={s}
              summary={summary.forStaff(s.id)}
              ler={lastMonthLer(monthlyRows, s)}
              onOpen={() => setOpen(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Last 1-1 week and document counts per person, for the tiles. Re-read
// whenever the gallery is shown again so edits on a profile show up.
function useProfileSummary(enabled, openId) {
  const [oneOnOnes, setOneOnOnes] = useState([]);
  const [docs, setDocs]           = useState([]);
  useEffect(() => {
    if (!enabled || openId) return;
    supabase.from('one_on_ones').select('staff_id, week_start, notes').order('week_start', { ascending: false })
      .then(({ data }) => setOneOnOnes(data || []));
    supabase.from('staff_documents').select('staff_id, expires_on')
      .then(({ data }) => setDocs(data || []));
  }, [enabled, openId]);

  const forStaff = useCallback((staffId) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const soon  = format(addDays(new Date(), 30), 'yyyy-MM-dd');
    const mine  = docs.filter((d) => d.staff_id === staffId);
    return {
      lastWeek: oneOnOnes.find((o) => o.staff_id === staffId)?.week_start || null,
      docCount: mine.length,
      expired:  mine.filter((d) => d.expires_on && d.expires_on < today).length,
      expiring: mine.filter((d) => d.expires_on && d.expires_on >= today && d.expires_on <= soon).length,
    };
  }, [oneOnOnes, docs]);

  return { forStaff };
}

// LER for the last COMPLETED month (same rule as the Team averages).
function lastMonthLer(monthlyRows, person) {
  if (person.is_coach === false) return null;
  const month = format(subMonths(new Date(), 1), 'yyyy-MM-01');
  const row = monthlyRows.find((r) => r.staff_id === person.id && r.month === month);
  return row?.ler != null ? { value: Number(row.ler), label: format(parseISO(month), 'MMM') } : null;
}

// Stable gradient per person so their tile doesn't change colour.
function gradientFor(id) {
  const keys = Object.keys(ROCK_GRADIENTS).filter((k) => k !== '6');
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ROCK_GRADIENTS[keys[h % keys.length]];
}

function TeamTile({ count, onOpen }) {
  return (
    <button
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className={`flex h-24 items-end px-3.5 pb-2 ${ROCK_GRADIENTS[6]}`}>
        <Users className="h-8 w-8 text-white/90" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <p className="text-sm font-semibold text-gray-900">Team</p>
        <p className="text-xs text-gray-500">LER, group classes, PT sessions, client caseload and wages — everyone side by side.</p>
        <p className="mt-auto pt-1 text-[11px] text-gray-400">{count} people</p>
      </div>
    </button>
  );
}

function PersonTile({ person, summary, ler, onOpen }) {
  const thisWeek = mondayOf();
  const had = summary.lastWeek;
  return (
    <button
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className={`h-16 ${gradientFor(person.id)}`} />
      <div className="flex flex-1 flex-col gap-2 px-3.5 pb-3.5">
        <div className="-mt-7 flex items-end justify-between gap-2">
          <PersonAvatar person={person} />
          <span className="mb-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600">
            {roleLabel(person)}
          </span>
        </div>
        <p className="text-sm font-semibold leading-snug text-gray-900">{person.full_name}</p>
        <div className="flex flex-col gap-1 text-xs text-gray-500">
          <span className={`flex items-center gap-1.5 ${had === thisWeek ? 'text-emerald-700' : ''}`}>
            <CalendarCheck2 className="h-3.5 w-3.5" />
            {had === thisWeek ? '1-1 this week' : had ? `Last 1-1: week of ${format(parseISO(had), 'd MMM')}` : 'No 1-1s yet'}
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            {summary.docCount ? `${summary.docCount} document${summary.docCount === 1 ? '' : 's'}` : 'No documents'}
            {summary.expired > 0 && (
              <span className="flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                <AlertTriangle className="h-3 w-3" /> {summary.expired} expired
              </span>
            )}
            {summary.expiring > 0 && (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                {summary.expiring} expiring soon
              </span>
            )}
          </span>
          {ler && (
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              LER {ler.label}: <span className={`font-semibold ${lerTone(ler.value) || 'text-gray-900'}`}>{ler.value.toFixed(2)}x</span>
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
