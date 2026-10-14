import { Lock, PencilRuler } from 'lucide-react';

/**
 * The Notion-style lock for managers: pages open locked (read view) and the
 * add / remove / reorder / edit controls only appear once build mode is on.
 * Not remembered between visits — every tab opens locked.
 */
export default function BuildModeToggle({ on, onChange, disabled, disabledReason }) {
  return (
    <button
      onClick={() => onChange(!on)}
      disabled={disabled}
      title={disabled ? disabledReason : on ? 'Lock the page' : 'Unlock to add, remove, edit and reorder'}
      aria-pressed={on}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        on
          ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
      }`}
    >
      {on ? <><PencilRuler className="h-3.5 w-3.5" /> Build mode on — click to lock</> : <><Lock className="h-3.5 w-3.5" /> Locked</>}
    </button>
  );
}
