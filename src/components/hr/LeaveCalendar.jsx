import { useMemo, useState } from 'react';
import { format, parseISO, startOfWeek, endOfWeek, isWeekend } from 'date-fns';
import { daysBetween, awayOn, typeMeta, iso, todayIso } from '../../utils/leave.js';

const MAX_CHIPS = 4;

/**
 * Month calendar (Mon–Sun). Each day lists who's away, coloured by leave
 * type, plus a small "x in" count. Click a chip to open the request, or the
 * empty part of a day to request leave starting that day.
 */
export default function LeaveCalendar({ requests, people, from, to, nameById, onOpen, onNew }) {
  const [expanded, setExpanded] = useState(null);
  const month = from.slice(0, 7);
  const today = todayIso();
  const peopleIds = useMemo(() => new Set(people.map((p) => p.id)), [people]);
  const shown = useMemo(() => requests.filter((r) => peopleIds.has(r.staff_id)), [requests, peopleIds]);

  const days = useMemo(() => daysBetween(
    iso(startOfWeek(parseISO(from), { weekStartsOn: 1 })),
    iso(endOfWeek(parseISO(to), { weekStartsOn: 1 })),
  ), [from, to]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="px-2 py-1.5 text-[11px] font-semibold uppercase text-gray-500">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const inMonth = d.slice(0, 7) === month;
          const away = awayOn(shown, d).sort((a, b) => (nameById[a.staff_id] || '').localeCompare(nameById[b.staff_id] || ''));
          const awayPeople = new Set(away.map((r) => r.staff_id)).size;
          const open = expanded === d;
          const list = open ? away : away.slice(0, MAX_CHIPS);
          return (
            <div
              key={d}
              onClick={() => onNew({ start_date: d })}
              className={`min-h-[6.5rem] cursor-pointer border-b border-r border-gray-100 p-1.5 hover:bg-gray-50 ${
                !inMonth ? 'bg-gray-50/70 text-gray-400' : isWeekend(parseISO(d)) ? 'bg-gray-50/40' : ''
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className={`text-xs ${d === today ? 'rounded-full bg-emerald-600 px-1.5 font-bold text-white' : inMonth ? 'font-medium text-gray-700' : ''}`}>
                  {format(parseISO(d), 'd')}
                </span>
                {inMonth && people.length > 0 && (
                  <span className={`text-[10px] ${awayPeople === 0 ? 'text-emerald-700' : awayPeople >= 2 ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>
                    {people.length - awayPeople} in
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {list.map((r) => {
                  const t = typeMeta(r.leave_type);
                  return (
                    <button
                      key={r.id}
                      onClick={(e) => { e.stopPropagation(); onOpen(r); }}
                      title={`${nameById[r.staff_id]} — ${r.title} (${t.label})`}
                      className={`block w-full truncate rounded px-1 py-px text-left text-[10px] font-medium text-white ${t.bar} ${r.status === 'pending' ? 'leave-pending' : ''}`}
                    >
                      {nameById[r.staff_id] || '?'} · {r.title}{r.status === 'pending' && ' (pending)'}
                    </button>
                  );
                })}
                {away.length > MAX_CHIPS && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(open ? null : d); }}
                    className="text-[10px] text-gray-500 hover:text-gray-800"
                  >
                    {open ? 'Show less' : `+${away.length - MAX_CHIPS} more`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
