import { useMemo } from 'react';
import { BellRing, Check, ExternalLink } from 'lucide-react';
import HomeCard, { CountPill } from './HomeCard.jsx';
import { reminderHits, hitIsForMe, completionKey, todayDate } from '../utils/reminders.js';

/**
 * The manager-made reminders that are due for the signed-in person right
 * now (see utils/reminders.js). Client reminders list each matching client
 * with "Open client" and "Done"; schedule reminders are a single "Done".
 * Disappears entirely when nothing's due.
 */
export default function HomeReminders({ rem, clients, pipelineIds, staff, isManager, onViewClient }) {
  const groups = useMemo(() => {
    const today = todayDate();
    const me = { staffId: staff?.id, isManager };
    return rem.reminders
      .filter((r) => r.active)
      .map((r) => ({
        reminder: r,
        hits: reminderHits(r, { clients, pipelineIds, today })
          .filter((h) => hitIsForMe(r, h, me))
          .filter((h) => !rem.completionByKey.has(completionKey(r.id, h.client?.id, h.occurrence))),
      }))
      .filter((g) => g.hits.length);
  }, [rem.reminders, rem.completionByKey, clients, pipelineIds, staff, isManager]);

  if (rem.loading || !groups.length) return null;

  return (
    <HomeCard
      id="reminders"
      tone="sky"
      icon={BellRing}
      title="Reminders"
      count={groups.reduce((n, g) => n + g.hits.length, 0)}
      // Minimised: one pill per reminder, e.g. "Programs due 5".
      summary={groups.map(({ reminder: r, hits }) => (
        <span key={r.id} className="flex items-center gap-1 rounded-full border border-sky-200 bg-white py-0.5 pl-2 pr-0.5 text-xs text-gray-700">
          <span className="max-w-[12rem] truncate">{r.title}</span>
          <CountPill tone="sky">{hits.length}</CountPill>
        </span>
      ))}
    >
      <div className="mb-2" />
      {rem.error && <p className="mb-2 text-xs text-red-600">{rem.error}</p>}

      <div className="space-y-4">
        {groups.map(({ reminder: r, hits }) => (
          <div key={r.id}>
            <p className="text-sm font-medium text-gray-900">{r.title}</p>
            {r.description && <p className="mb-2 text-xs text-gray-500">{r.description}</p>}
            <div className="space-y-1.5">
              {hits.map((h) => (
                <div key={`${h.client?.id || ''}-${h.occurrence}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <div className="min-w-0">
                    {h.client ? (
                      <>
                        <p className="truncate text-sm text-gray-900">{h.client.first_name} {h.client.last_name}</p>
                        <p className="truncate text-[11px] text-gray-500">{h.detail}</p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-700">Due now</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {h.client && (
                      <button
                        onClick={() => onViewClient?.(h.client.mindbody_id)}
                        className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        <ExternalLink className="h-3 w-3" /> Open
                      </button>
                    )}
                    <button
                      onClick={() => rem.complete(r.id, h.client?.id, h.occurrence)}
                      className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                    >
                      <Check className="h-3 w-3" /> Done
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </HomeCard>
  );
}
