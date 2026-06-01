import { PauseCircle, CheckCircle } from 'lucide-react';

function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('suspend')) return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
  if (s.includes('inactive') || s.includes('declined')) return 'text-red-400 bg-red-500/10 border-red-500/20';
  return 'text-gray-400 bg-gray-700/30 border-gray-700/50';
}

function suspensionLabel(client) {
  const info = client.suspensionInfo;
  if (!info || Object.keys(info).length === 0) return client.status || 'Non-active';
  const parts = [];
  if (info.ReasonId || info.Reason) parts.push(info.Reason || `Reason #${info.ReasonId}`);
  if (info.StartDate) parts.push(`from ${new Date(info.StartDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`);
  if (info.EndDate)   parts.push(`to ${new Date(info.EndDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`);
  return parts.length ? parts.join(' · ') : (client.status || 'Suspended');
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

        {!loading && !error && clients.map((client) => (
          <div
            key={client.id}
            className="flex items-center justify-between px-5 py-2.5 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-200 truncate">{client.name || 'Unknown'}</p>
              <p className="text-xs text-gray-500 truncate">
                {suspensionLabel(client)}
              </p>
            </div>
            <span className={`ml-3 shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${statusColor(client.status)}`}>
              {client.status || 'Suspended'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
