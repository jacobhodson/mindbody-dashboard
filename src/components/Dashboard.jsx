import { format } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import StatsGrid from './StatsGrid.jsx';
import AttendanceChart from './AttendanceChart.jsx';
import InactiveClientsList from './InactiveClientsList.jsx';
import FringeClientsTable from './FringeClientsTable.jsx';
import PaymentIssuesTable from './PaymentIssuesTable.jsx';

export default function Dashboard({ data, loading, errors, lastRefresh, onRefresh }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-gray-800 bg-gray-900/80 backdrop-blur px-6 py-4">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">Operations Dashboard</h1>
            <p className="text-xs text-gray-500 mt-0.5">Live · auto-refreshes every 5 min</p>
          </div>
          <div className="flex items-center gap-4">
            {lastRefresh && (
              <span className="hidden sm:block text-xs text-gray-500">
                Last update {format(lastRefresh, 'h:mm a')}
              </span>
            )}
            <button
              onClick={onRefresh}
              disabled={Object.values(loading).some(Boolean)}
              className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${Object.values(loading).some(Boolean) ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">
        <StatsGrid
          attendance={data.attendance}
          clientAnalytics={data.clientAnalytics}
          payments={data.payments}
          loading={loading}
        />

        <AttendanceChart />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <InactiveClientsList
            data={data.clientAnalytics}
            loading={loading.clientAnalytics}
            error={errors.clientAnalytics}
          />
          <FringeClientsTable
            data={data.clientAnalytics}
            loading={loading.clientAnalytics}
            error={errors.clientAnalytics}
          />
        </div>

        <PaymentIssuesTable
          data={data.payments}
          loading={loading.payments}
          error={errors.payments}
        />
      </main>
    </div>
  );
}
