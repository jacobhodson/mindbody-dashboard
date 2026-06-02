import { PauseCircle, CheckCircle, Calendar } from 'lucide-react';
import { format, parseISO, isPast, differenceInDays } from 'date-fns';

function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('suspend')) return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
  if (s.includes('inactive') || s.includes('declined')) return 'text-red-400 bg-red-500/10 border-red-500/20';
  return 'text-gray-400 bg-gray-700/30 border-gray-700/50';
}

function parseEndDate(info) {
  // Mindbody may use ResumeDate or EndDate depending on the endpoint version
  if (!info) return null;
  const raw = info.ResumeDate || info.EndDate || info.SuspensionEnd || null;
  if (!raw) return null;
  try { return parseISO(raw); } catch { return null; }
}

function parseStartDate(info) {
  if (!info) return null;
  const raw = info.SuspendedDate || info.StartDate || info.BookedDate || null;
  if (!raw) return null;
  try { return parseISO(raw); } catch { return null; }
}

function suspensionMeta(client) {
  const info     = client.suspensionInfo;
  const endDate  = parseEndDate(info);
  const startDate = parseStartDate(info);
  const reason   = info?.Reason || (info?.ReasonId ? `Reason #${info.ReasonId}` : null);

  let endLabel = null;
  if (endDate) {
    if (isPast(endDate)) {
      endLabel = `Ended ${format(endDate, 'd MMM yyyy')}`;
    } else {
      const days = differenceInDays(endDate, new Date());
      endLabel = days === 0
        ? 'Resumes today'
        : days === 1
          ? 'Resumes tomorrow'
          : `Resumes ${format(endDate, 'd MMM yyyy')} (${days}d)`;
    }
  }

  const startLabel = startDate ? `From ${format(startDate, 'd MMM')}` : null;

  return { reason, startLabel, endLabel };
}

export default function SuspensionsList({ data, loading, error }) {
  const clients = data?.suspensions || [];

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <PauseCircle className="h-4 w-4 text-orange-400" />
          <h2 className="font-semibold text-white">On Suspension</h2>
          {!loading && (
            <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400 border border-orange-500/20">
              {clients.length}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">Active suspension or non-active status</p>
      </div>

      {/* Body */}
      <div className="overflow-y-auto max-h-72 scrollbar-thin">
        {loading && (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-800" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="p-5 text-sm text-red-400">Could not load: {error}</p>
        )}

        {!loading && !error && clients.length === 0 && (
          <div className="py-10 text-center">
            <CheckCircle className="h-7 w-7 text-emerald-500/40 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No suspended clients</p>
          </div>
        )}

        {!loading && !error && clients.map((client) => {
          const { reason, startLabel, endLabel } = suspensionMeta(client);
          return (
            <div
              key={client.id}
              className="flex items-center gap-3 px-5 py-3 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-200 truncate">{client.name || 'Unknown'}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {reason && (
                    <span className="text-xs text-gray-600 truncate">{reason}</span>
                  )}
                  {startLabel && (
                    <span className="text-xs text-gray-600">{startLabel}</span>
                  )}
                  {endLabel && (
                    <span className="flex items-center gap-1 text-xs text-orange-400 font-medium">
                      <Calendar className="h-3 w-3 shrink-0" />
                      {endLabel}
                    </span>
                  )}
                  {!reason && !startLabel && !endLabel && (
                    <span className="text-xs text-gray-600">{client.status}</span>
                  )}
                </div>
              </div>
              <span className={`ml-2 shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${statusColor(client.status)}`}>
                {client.status || 'Suspended'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
