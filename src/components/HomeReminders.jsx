import { useMemo } from 'react';
import { BellRing, Check, ExternalLink } from 'lucide-react';
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
    <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-5">
      <div className="mb-3 flex items-center gap-2">
        <BellRing className="h-4 w-4 text-sky-600" />
        <h2 className="font-semibold text-gray-900">Reminders</h2>
        <span className="rounded-full border border-sky-500/30 bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
          {groups.reduce((n, g) => n + g.hits.length, 0)}
        </span>
      </div>
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
    </div>
  );
}
