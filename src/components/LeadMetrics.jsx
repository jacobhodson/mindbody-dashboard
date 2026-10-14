import { useState, useEffect } from 'react';
import { format, parseISO, startOfWeek } from 'date-fns';
import { Gauge } from 'lucide-react';
import { supabase } from '../lib/supabaseClient.js';

const WEEKS = 12;

/**
 * Scorecard → Lead Metrics: the weekly client-mix snapshot
 * (weekly_client_snapshots, written nightly by
 * scheduled-client-mix-snapshot.js) — active clients by membership type,
 * the onboarding pipeline, and Red %. Not a target to hit each week, just
 * a line to watch. The current week's row keeps updating nightly until the
 * week ends; earlier rows are each week's Sunday-night figures.
 */
export default function LeadMetrics() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('weekly_client_snapshots').select('*')
      .order('week_start', { ascending: false }).limit(WEEKS)
      .then(({ data, error }) => { if (!error) setRows(data || []); })
      .finally(() => setLoading(false));
  }, []);

  const thisWeek = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-emerald-600" />
          <h2 className="font-semibold text-gray-900">Lead Metrics</h2>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          Active clients, membership mix, onboarding pipeline and Red % — snapshotted weekly (Mon–Sun). Live figures are on the Group Training tab.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-right text-xs text-gray-500">
              <th className="px-5 py-2 font-medium text-left">Week of</th>
              <th className="px-3 py-2 font-medium">Active</th>
              <th className="px-3 py-2 font-medium">Group</th>
              <th className="px-3 py-2 font-medium">PT</th>
              <th className="px-3 py-2 font-medium">Online</th>
              <th className="px-3 py-2 font-medium">Pipeline</th>
              <th className="px-3 py-2 font-medium">Reds</th>
              <th className="px-3 py-2 font-medium">Red %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200/60">
            {loading ? (
              <tr><td colSpan={8} className="px-5 py-6"><div className="h-4 w-full animate-pulse rounded bg-gray-200" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-5 py-6 text-center text-sm text-gray-400">No weekly snapshots yet — the first one is taken overnight.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.week_start} className="text-right">
                <td className="px-5 py-2 text-left font-medium text-gray-900 whitespace-nowrap">
                  {format(parseISO(r.week_start), 'd MMM yyyy')}
                  {r.week_start === thisWeek && <span className="ml-1.5 text-[10px] font-normal text-gray-400">in progress</span>}
                </td>
                <td className="px-3 py-2 font-semibold tabular-nums text-gray-900">{r.active_clients}</td>
                <td className="px-3 py-2 tabular-nums text-gray-600">{r.group_clients}</td>
                <td className="px-3 py-2 tabular-nums text-gray-600">{r.pt_clients}</td>
                <td className="px-3 py-2 tabular-nums text-gray-600">{r.online_clients}</td>
                <td className="px-3 py-2 tabular-nums text-gray-600">{r.pipeline_clients}</td>
                <td className="px-3 py-2 tabular-nums text-gray-600">{r.red_clients}</td>
                <td className="px-3 py-2 font-semibold tabular-nums text-gray-900">{r.red_pct != null ? `${Number(r.red_pct)}%` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
