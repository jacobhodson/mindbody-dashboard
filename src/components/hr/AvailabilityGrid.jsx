import { useMemo } from 'react';
import { format, parseISO, isWeekend } from 'date-fns';
import { daysBetween, typeMeta, todayIso, STATUS_BY_KEY } from '../../utils/leave.js';

export const dayWidth = (n) => (n <= 7 ? 72 : n <= 14 ? 44 : n <= 31 ? 30 : n <= 92 ? 22 : 16);

/**
 * People × days, like the Google Sheet: every cell is either green
 * (available) or coloured by the leave type that has them away, so you can
 * see who's IN on a given day, not just who's off. The top row counts how
 * many are in each day. Click a green cell to book that person off from that
 * day; click a coloured one to open the request.
 */
export default function AvailabilityGrid({ requests, people, from, to, staff, isManager, onOpen, onNew }) {
  const days = useMemo(() => daysBetween(from, to), [from, to]);
  const w = dayWidth(days.length);
  const today = todayIso();

  // staffId -> day -> request
  const cellMap = useMemo(() => {
    const m = {};
    for (const r of requests) {
      if (r.status === 'declined') continue;
      const row = (m[r.staff_id] ||= {});
      for (const d of daysBetween(r.start_date < from ? from : r.start_date, r.end_date > to ? to : r.end_date)) {
        // Approved beats pending if two overlap on the same day.
        if (!row[d] || (row[d].status === 'pending' && r.status === 'approved')) row[d] = r;
      }
    }
    return m;
  }, [requests, from, to]);

  const months = useMemo(() => {
    const out = [];
    for (const d of days) {
      const key = d.slice(0, 7);
      if (out.length && out[out.length - 1].key === key) out[out.length - 1].n += 1;
      else out.push({ key, n: 1 });
    }
    return out;
  }, [days]);

  if (people.length === 0) return <p className="text-sm text-gray-500">No team members match the filter.</p>;

  const nameCol = 'sticky left-0 z-10 bg-white border-r border-gray-200 px-3 text-xs font-medium text-gray-800 whitespace-nowrap';

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
      <table className="border-separate border-spacing-0" style={{ minWidth: '100%' }}>
        <thead>
          {months.length > 1 && (
            <tr>
              <th className={`${nameCol} py-1`} />
              {months.map((m) => (
                <th key={m.key} colSpan={m.n} className="border-b border-l border-gray-200 py-1 text-left pl-1 text-[11px] font-semibold text-gray-600 whitespace-nowrap overflow-hidden">
                  {format(parseISO(`${m.key}-01`), m.n * w < 60 ? 'MMM' : 'MMMM yyyy')}
                </th>
              ))}
            </tr>
          )}
          <tr>
            <th className={`${nameCol} py-1 text-left text-[11px] text-gray-500 font-normal`}>Team member</th>
            {days.map((d) => {
              const dt = parseISO(d);
              return (
                <th
                  key={d}
                  style={{ width: w, minWidth: w }}
                  className={`border-b border-gray-200 py-1 text-center font-normal ${isWeekend(dt) ? 'bg-gray-50' : ''} ${d === today ? 'bg-emerald-50' : ''}`}
                >
                  {w >= 22 && <div className="text-[9px] uppercase text-gray-400">{format(dt, w >= 44 ? 'EEE' : 'EEEEE')}</div>}
                  <div className={`text-[11px] ${d === today ? 'font-bold text-emerald-700' : 'text-gray-700'}`}>{format(dt, 'd')}</div>
                </th>
              );
            })}
          </tr>
          <tr>
            <th className={`${nameCol} py-1 text-left text-[11px] text-gray-500 font-normal border-b border-gray-200`}>In / {people.length}</th>
            {days.map((d) => {
              const away = people.filter((p) => cellMap[p.id]?.[d]).length;
              const inCount = people.length - away;
              const tone = away === 0 ? 'text-emerald-700' : away === 1 ? 'text-gray-700' : away === 2 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';
              return (
                <th key={d} className={`border-b border-gray-200 py-1 text-center text-[11px] font-semibold ${tone}`} title={`${inCount} in, ${away} away`}>
                  {inCount}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => {
            const canBook = isManager || p.id === staff?.id;
            return (
              <tr key={p.id}>
                <td className={`${nameCol} py-1.5 border-b border-gray-100`}>{p.full_name}</td>
                {days.map((d) => {
                  const r = cellMap[p.id]?.[d];
                  const weekend = isWeekend(parseISO(d));
                  if (!r) {
                    return (
                      <td key={d} className="border-b border-gray-100 p-px">
                        <button
                          onClick={canBook ? () => onNew({ staff_id: p.id, start_date: d }) : undefined}
                          title={`${p.full_name} — available ${format(parseISO(d), 'EEE d MMM')}${canBook ? ' (click to book leave)' : ''}`}
                          className={`block h-6 w-full rounded-sm border ${
                            weekend ? 'bg-emerald-50/60 border-emerald-100' : 'bg-emerald-100 border-emerald-200'
                          } ${canBook ? 'hover:bg-emerald-200 cursor-pointer' : 'cursor-default'} ${d === today ? 'ring-1 ring-emerald-600' : ''}`}
                        />
                      </td>
                    );
                  }
                  const t = typeMeta(r.leave_type);
                  const half = r.start_date === r.end_date && Number(r.work_days) === 0.5;
                  return (
                    <td key={d} className="border-b border-gray-100 p-px">
                      <button
                        onClick={() => onOpen(r)}
                        title={`${p.full_name} — ${r.title} (${t.label}, ${STATUS_BY_KEY[r.status].label})`}
                        className={`relative block h-6 w-full overflow-hidden rounded-sm text-[10px] font-bold text-white ${t.bar} ${r.status === 'pending' ? 'leave-pending' : ''} ${d === today ? 'ring-1 ring-gray-900' : ''}`}
                      >
                        {half && <span className="absolute inset-y-0 right-0 w-1/2 bg-emerald-100" />}
                        {w >= 22 && <span className="relative">{half ? '½' : t.letter}</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
