import { useState, useMemo, useCallback } from 'react';
import { format, isToday } from 'date-fns';
import { RefreshCw, Home as HomeIcon, Activity, DollarSign, Users2, Users, Dumbbell, LogOut, BarChart3, Menu, Contact, Mountain, CalendarCheck, BookOpen, Plane } from 'lucide-react';
import logo from '../assets/newstrength-logo.svg';
import Sidebar             from './Sidebar.jsx';
import Home                from './Home.jsx';
import Scorecard           from './Scorecard.jsx';
import StatsGrid          from './StatsGrid.jsx';
import ClientMixSnapshot  from './ClientMixSnapshot.jsx';
import AttendanceChart    from './AttendanceChart.jsx';
import NoShowsList        from './NoShowsList.jsx';
import SuspensionsList    from './SuspensionsList.jsx';
import RedsList           from './RedsList.jsx';
import FringeClientsTable from './FringeClientsTable.jsx';
import FinancesTab        from './FinancesTab.jsx';
import OnboardingTab          from './OnboardingTab.jsx';
import PersonalTrainingTab    from './PersonalTrainingTab.jsx';
import CelebrationsPanel   from './CelebrationsPanel.jsx';
import ClientsList         from './ClientsList.jsx';
import ClientDetail        from './ClientDetail.jsx';
import TeamTab             from './TeamTab.jsx';
import RocksTab            from './RocksTab.jsx';
import MeetingsTab         from './MeetingsTab.jsx';
import PlaybookTab         from './playbook/PlaybookTab.jsx';
import HRTab               from './hr/HRTab.jsx';
import NotificationBell    from './NotificationBell.jsx';
import { usePlaybook }     from '../utils/usePlaybook.js';
import { PlaybookLinkProvider } from '../utils/playbookLink.jsx';
import { useOnboardingRollover } from '../utils/useOnboardingRollover.js';

// Sidebar order. Tabs sharing a `group` sit together under a collapsible
// heading (see Sidebar.jsx); ungrouped ones are top-level items.
const TABS = [
  { key: 'home',              label: 'Home',              Icon: HomeIcon  },
  { key: 'clients',           label: 'Clients',           Icon: Contact,       group: 'Coaching' },
  { key: 'onboarding',        label: 'Onboarding',        Icon: Users2,        group: 'Coaching' },
  { key: 'personalTraining',  label: 'Personal Training', Icon: Dumbbell,      group: 'Coaching' },
  { key: 'operations',        label: 'Group Training',    Icon: Activity,      group: 'Coaching' },
  { key: 'finances',          label: 'Finances',          Icon: DollarSign,    group: 'Business', managerOnly: true },
  { key: 'scorecard',         label: 'Scorecard',         Icon: BarChart3,     group: 'Business' },
  { key: 'team',              label: 'Team',              Icon: Users,         group: 'Business', managerOnly: true },
  { key: 'rocks',             label: 'Rocks',             Icon: Mountain,      group: 'Business' },
  { key: 'meetings',          label: 'Meetings',          Icon: CalendarCheck, group: 'Business' },
  { key: 'hr',                label: 'HR',                Icon: Plane,         group: 'Business' },
  { key: 'playbook',          label: 'Playbook',          Icon: BookOpen  },
];

// Short-program products: removed from pipeline on no-rollover
const SHORT_PRODUCTS = new Set(['3-Session', '14-Day']);

export default function Dashboard({ data, loading, errors, lastRefresh, onRefresh, refreshOnboarding, contactLog, user, staff, isManager, onSignOut }) {
  const [tab, setTab] = useState('home');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [selectedClientMindbodyId, setSelectedClientMindbodyId] = useState(null);
  const anyLoading    = Object.values(loading).some(Boolean);

  // Deep-link into a client's profile from anywhere in the app (Red's List,
  // Fringe Clients, PT Red's List) — the app has no router, so this is just
  // lifted tab-state, same pattern as every other tab switch here.
  const onViewClient = (mindbodyId) => { setSelectedClientMindbodyId(mindbodyId); setTab('clients'); };

  const { decisions, getDecision, setDecision } = useOnboardingRollover();

  // Playbook: owned here so any task's "How to" link can open a page.
  const playbook = usePlaybook();
  const [playbookPageId, setPlaybookPageId] = useState(null);
  const openPlaybookPage = useCallback((id) => { setPlaybookPageId(id); setTab('playbook'); }, []);

  // Which rock's full page is open (lifted so Meetings' Rock Review can link to one).
  const [openRockId, setOpenRockId] = useState(null);
  const openRock = useCallback((id) => { setOpenRockId(id || null); setTab('rocks'); }, []);

  // All onboarding clients (from each week column)
  const allOnboardingClients = useMemo(() => [
    ...(data.onboarding?.week1 || []),
    ...(data.onboarding?.week2 || []),
    ...(data.onboarding?.week3 || []),
    ...(data.onboarding?.week4 || []),
  ], [data.onboarding]);

  // IDs of currently active onboarding clients — excludes any short-product
  // clients who have explicitly said no-rollover (they're done with onboarding)
  const onboardingIds = useMemo(() => new Set(
    allOnboardingClients
      .filter((c) => {
        if (!SHORT_PRODUCTS.has(c.shortProduct)) return true;
        return decisions[c.id]?.decision !== 'no-rollover';
      })
      .map((c) => c.id)
  ), [allOnboardingClients, decisions]);

  const atRiskCount = useMemo(() => {
    const reds = data.onboarding?.pipelineReds || [];
    return reds.filter((c) => {
      if (!SHORT_PRODUCTS.has(c.shortProduct)) return true;
      return decisions[c.id]?.decision !== 'no-rollover';
    }).length;
  }, [data.onboarding, decisions]);

  // Mindbody IDs of clients currently on a genuine front-end offer/intro
  // pass — same active-pipeline + decision filtering as onboardingIds above,
  // but excluding straight-in members (they joined straight onto a full
  // membership, so they're correctly 'Active' already, not a trial/offer
  // client). Feeds the Clients tab's third "Trial" status — see
  // clientStatus.js's simplifiedStatus().
  const tradeOnboardingIds = useMemo(() => new Set(
    allOnboardingClients
      .filter((c) => !c.isStraightIn)
      .filter((c) => decisions[c.id]?.decision !== 'removed')
      .filter((c) => {
        if (!SHORT_PRODUCTS.has(c.shortProduct)) return true;
        return decisions[c.id]?.decision !== 'no-rollover';
      })
      .map((c) => c.id)
  ), [allOnboardingClients, decisions]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur px-6 py-4">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="-ml-1 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <img src={logo} alt="Newstrength" className="h-8 w-auto" />
            <div className="hidden sm:block border-l border-gray-200 pl-3">
              <h1 className="text-lg font-semibold tracking-tight text-gray-900">Operations Dashboard</h1>
              <p className="text-xs text-gray-500 mt-0.5">{import.meta.env.VITE_BUSINESS_NAME || 'Your Gym'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {lastRefresh && (
              <span className="hidden sm:block text-xs text-gray-500">
                Data from {isToday(lastRefresh) ? format(lastRefresh, 'h:mm a') : format(lastRefresh, 'EEE d MMM, h:mm a')}
              </span>
            )}
            {user && (
              <NotificationBell
                staff={staff} isManager={isManager}
                onNavigate={(key, linkId) => { if (key === 'rocks' && linkId) openRock(linkId); else setTab(key); }}
              />
            )}
            <button
              onClick={onRefresh}
              disabled={anyLoading}
              className="flex items-center gap-1.5 rounded-lg bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300 hover:text-gray-900 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${anyLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            {user && (
              <button
                onClick={onSignOut}
                title={user.email}
                className="flex items-center gap-1.5 rounded-lg bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300 hover:text-gray-900 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex items-start">
        <Sidebar
          tabs={TABS.filter((t) => !t.managerOnly || isManager)}
          activeTab={tab}
          onSelect={(key) => { if (key === 'rocks') setOpenRockId(null); setTab(key); }}
          atRiskCount={atRiskCount}
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
          isManager={isManager}
        />

        {/* ── Tab content ── */}
        <PlaybookLinkProvider pages={playbook.pages} open={openPlaybookPage}>
        <main className="flex-1 min-w-0 mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-8">

        {/* ─ Home ─ */}
        {tab === 'home' && (
          <Home
            user={user} staff={staff} isManager={isManager} onViewClient={onViewClient}
            onboardingData={data.onboarding} pipelineIds={tradeOnboardingIds}
            week4Clients={data.onboarding?.week4} decisions={decisions} setDecision={setDecision}
            onOpenHR={() => setTab('hr')}
          />
        )}

        {/* ─ Group Training (key 'operations') ─ */}
        {tab === 'operations' && (
          <>
            <StatsGrid
              attendance={data.attendance}
              clientAnalytics={data.clientAnalytics}
              loading={loading}
            />
            <ClientMixSnapshot
              clientAnalytics={data.clientAnalytics}
              onboarding={data.onboarding}
              decisions={decisions}
              loading={loading}
            />
            <AttendanceChart />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <NoShowsList
                data={data.clientAnalytics}
                loading={loading.clientAnalytics}
                error={errors.clientAnalytics}
              />
              <SuspensionsList
                data={data.clientAnalytics}
                loading={loading.clientAnalytics}
                error={errors.clientAnalytics}
              />
            </div>
            <RedsList
              data={data.clientAnalytics}
              loading={loading.clientAnalytics}
              error={errors.clientAnalytics}
              contactLog={contactLog}
              onboardingIds={onboardingIds}
              onViewClient={onViewClient}
            />
            <FringeClientsTable
              contactLog={contactLog}
              onboardingIds={onboardingIds}
              onViewClient={onViewClient}
            />
            <CelebrationsPanel
              data={data.celebrations}
              loading={loading.celebrations}
              error={errors.celebrations}
            />
          </>
        )}

        {/* ─ Finances ─ */}
        {tab === 'finances' && isManager && (
          <FinancesTab data={data} loading={loading} errors={errors} isManager={isManager} />
        )}

        {/* ─ Onboarding ─ */}
        {tab === 'onboarding' && (
          <OnboardingTab
            data={data.onboarding}
            loading={loading.onboarding}
            error={errors.onboarding}
            contactLog={contactLog}
            decisions={decisions}
            getDecision={getDecision}
            setDecision={setDecision}
            staff={staff}
            isManager={isManager}
            refreshOnboarding={refreshOnboarding}
          />
        )}

        {/* ─ Personal Training ─ */}
        {tab === 'personalTraining' && (
          <PersonalTrainingTab
            data={data.pt}
            loading={loading.pt}
            error={errors.pt}
            contactLog={contactLog}
            onViewClient={onViewClient}
            isManager={isManager}
          />
        )}

        {/* ─ Clients ─ */}
        {tab === 'clients' && (
          selectedClientMindbodyId ? (
            <ClientDetail
              mindbodyId={selectedClientMindbodyId}
              isManager={isManager}
              staff={staff}
              pipelineIds={tradeOnboardingIds}
              onBack={() => setSelectedClientMindbodyId(null)}
            />
          ) : (
            <ClientsList onSelect={setSelectedClientMindbodyId} isManager={isManager} pipelineIds={tradeOnboardingIds} />
          )
        )}

        {/* ─ Team ─ */}
        {tab === 'team' && isManager && (
          <TeamTab
            isManager={isManager}
            currentStaffId={staff?.id}
            ptData={data.pt}
            ptLoading={loading.pt}
            ptError={errors.pt}
            pipelineIds={tradeOnboardingIds}
            onViewClient={onViewClient}
          />
        )}

        {/* ─ Scorecard ─ */}
        {tab === 'scorecard' && <Scorecard staff={staff} isManager={isManager} />}

        {/* ─ Rocks ─ */}
        {tab === 'rocks' && <RocksTab staff={staff} isManager={isManager} openRockId={openRockId} onOpenRockChange={setOpenRockId} />}

        {/* ─ Meetings ─ */}
        {tab === 'meetings' && (
          <MeetingsTab
            staff={staff}
            isManager={isManager}
            onOpenRocks={openRock}
            reds={{
              data: data.clientAnalytics,
              loading: loading.clientAnalytics,
              error: errors.clientAnalytics,
              contactLog,
              onboardingIds,
              onViewClient,
            }}
          />
        )}

        {/* ─ HR (Leave Planner) ─ */}
        {tab === 'hr' && <HRTab staff={staff} isManager={isManager} />}

        {/* ─ Playbook ─ */}
        {tab === 'playbook' && (
          <PlaybookTab playbook={playbook} isManager={isManager} pageId={playbookPageId} onSelectPage={setPlaybookPageId} />
        )}
        </main>
        </PlaybookLinkProvider>
      </div>
    </div>
  );
}
