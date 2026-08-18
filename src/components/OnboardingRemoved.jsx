import { useState } from 'react';
import { UserMinus, RotateCcw, ChevronDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';

// Collapsed by default — this is a safety net for undoing a manual removal,
// not something staff need open during normal day-to-day use.
export default function OnboardingRemoved({ clients = [], setDecision }) {
  const [open, setOpen] = useState(false);

  if (clients.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 flex flex-col">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-5 py-3 text-left"
      >
        <UserMinus className="h-4 w-4 text-gray-600" />
        <h2 className="text-sm font-medium text-gray-500">Removed from pipeline</h2>
        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-500 border border-gray-700">
          {clients.length}
        </span>
        <ChevronDown className={`ml-auto h-3.5 w-3.5 text-gray-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="divide-y divide-gray-800/60 border-t border-gray-800">
          {clients.map((client) => (
            <div key={client.id} className="flex items-center gap-3 px-5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-400 truncate">{client.name || 'Unknown'}</p>
                <p className="text-xs text-gray-600 truncate">
                  {client.shortProduct || client.product}
                  {client.startDate && <span className="ml-2">Started {format(parseISO(client.startDate), 'd MMM')}</span>}
                </p>
              </div>
              <button
                onClick={() => setDecision(client.id, null)}
                className="shrink-0 flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1 text-xs font-medium text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
