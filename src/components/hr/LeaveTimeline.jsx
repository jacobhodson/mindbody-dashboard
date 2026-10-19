import { useMemo } from 'react';
import { format, parseISO, isWeekend, differenceInCalendarDays } from 'date-fns';
import { daysBetween, typeMeta, todayIso, formatRange } from '../../utils/leave.js';
import { dayWidth } from './AvailabilityGrid.jsx';

const LANE_H = 26;
const NAME_W = 120;

/**
 * Notion-style timeline: one row per person, a bar per leave block spanning
 * its dates (clipped to the period). Overlapping blocks for the same person
 * stack into extra lanes.
 */
export default function LeaveTimeline({ requests, people, from, to, onOpen }) {
  const days = useMemo(() => daysBetween(from, to), [from, to]);
  const w = Math.max(dayWidth(days.length), 18);
  const today = todayIso();
  const rows = useMemo(() => people.map((p) => {
    const start = parseISO(from);
    const mine = requests
      .filter((r) => r.staff_id === p.id && r.status !== 'declined')
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    const laneEnds = [];
    const bars = mine.map((r) => {
      let lane = laneEnds.findIndex((end) => end < r.start_date);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(r.end_date); } else laneEnds[lane] = r.end_date;
      const s = r.start_date < from ? from : r.start_date;
      const e = r.end_date > to ? to : r.end_date;
      return {
        r, lane,
        left: differenceInCalendarDays(parseISO(s), start) * w,
        width: (differenceInCalendarDays(parseISO(e), parseISO(s)) + 1) * w,
        clippedL: r.start_date < from, clippedR: r.end_date > to,
      };
    });
    return { p, bars, lanes: Math.max(1, laneEnds.length) };
  }), [people, requests, from, to, w]);

  if (people.length === 0) return <p className="text-sm text-gray-500">No team members match the filter.</p>;

  const totalW = days.length * w;
  const todayIdx = days.indexOf(today);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
      <div style={{ width: NAME_W + totalW }}>
        {/* header */}
        <div className="flex border-b border-gray-200 sticky top-0 bg-white">
          <div className="sticky left-0 z-20 shrink-0 border-r border-gray-200 bg-white px-3 py-1 text-[11px] text-gray-500" style={{ width: NAME_W }}>Team member</div>
          {days.map((d) => {
            const dt = parseISO(d);
            const first = dt.getDate() === 1 || d === from;
            return (
              <div
                key={d}
                style={{ width: w }}
                className={`shrink-0 py-1 text-center ${isWeekend(dt) ? 'bg-gray-50' : ''} ${first ? 'border-l border-gray-300' : ''}`}
              >
                <div className="h-3 text-[9px] font-semibold text-gray-500 whitespace-nowrap overflow-visible">{first ? format(dt, 'MMM') : ''}</div>
                <div className={`text-[10px] ${d === today ? 'font-bold text-emerald-700' : 'text-gray-600'}`}>
                  {w >= 22 || dt.getDate() % 5 === 1 ? format(dt, 'd') : ''}
                </div>
              </div>
            );
          })}
        </div>

        {rows.map(({ p, bars, lanes }) => (
          <div key={p.id} className="flex border-b border-gray-100">
            <div className="sticky left-0 z-10 shrink-0 border-r border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800" style={{ width: NAME_W }}>
              {p.full_name}
            </div>
            <div className="relative" style={{ width: totalW, height: lanes * LANE_H + 6 }}>
              {/* weekend shading + today line */}
              {days.map((d, i) => isWeekend(parseISO(d)) && (
                <div key={d} className="absolute inset-y-0 bg-gray-50" style={{ left: i * w, width: w }} />
              ))}
              {todayIdx >= 0 && <div className="absolute inset-y-0 w-px bg-emerald-500" style={{ left: todayIdx * w + w / 2 }} />}
              {bars.map(({ r, lane, left, width, clippedL, clippedR }) => {
                const t = typeMeta(r.leave_type);
                return (
                  <button
                    key={r.id}
                    onClick={() => onOpen(r)}
                    title={`${r.title} · ${t.label} · ${formatRange(r)}${r.status === 'pending' ? ' · pending' : ''}`}
                    className={`absolute flex items-center overflow-hidden whitespace-nowrap px-1.5 text-[11px] font-medium text-white shadow-sm hover:brightness-110 ${t.bar} ${
                      r.status === 'pending' ? 'leave-pending' : ''
                    } ${clippedL ? 'rounded-l-none' : 'rounded-l-md'} ${clippedR ? 'rounded-r-none' : 'rounded-r-md'}`}
                    style={{ left: left + 1, width: Math.max(width - 2, 4), top: 3 + lane * LANE_H, height: LANE_H - 4 }}
                  >
                    {clippedL && '‹ '}{r.title}{r.status === 'pending' && ' (pending)'}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
