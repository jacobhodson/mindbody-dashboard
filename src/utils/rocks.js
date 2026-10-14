// Rock status / Craft Cycle stage options — values match the check
// constraints in 20261014000000_rocks_and_meetings.sql.

export const ROCK_STATUSES = [
  { key: 'doing',    label: 'Doing',    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: 'ongoing',  label: 'Ongoing',  badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'planned',  label: 'Planned',  badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  { key: 'on_hold',  label: 'On Hold',  badge: 'bg-red-50 text-red-700 border-red-200' },
  { key: 'done',     label: 'Done',     badge: 'bg-violet-50 text-violet-700 border-violet-200' },
];

export const ROCK_STATUS_BY_KEY = Object.fromEntries(ROCK_STATUSES.map((s) => [s.key, s]));

export const ROCK_STAGES = [
  { key: 'build',      label: 'Build' },
  { key: 'braintrust', label: 'Braintrust' },
  { key: 'close',      label: 'Close' },
];

export const ROCK_STAGE_LABEL = Object.fromEntries(ROCK_STAGES.map((s) => [s.key, s.label]));

// Cover presets for rocks without a photo. Stored on rocks.cover as
// 'gradient:<key>'; class strings are written out in full so Tailwind
// keeps them.
export const ROCK_GRADIENTS = {
  1: 'bg-gradient-to-br from-indigo-700 via-fuchsia-600 to-red-500',
  2: 'bg-gradient-to-br from-emerald-400 to-sky-600',
  3: 'bg-gradient-to-br from-amber-300 via-orange-400 to-rose-500',
  4: 'bg-gradient-to-br from-sky-200 via-indigo-300 to-violet-400',
  5: 'bg-gradient-to-br from-lime-300 to-emerald-700',
  6: 'bg-gradient-to-br from-slate-600 to-slate-900',
};

export function gradientClassFor(cover) {
  const m = /^gradient:(\w+)$/.exec(cover || '');
  return m ? ROCK_GRADIENTS[m[1]] || null : null;
}
