import { format, parseISO } from 'date-fns';
import { AlertTriangle, BookOpen } from 'lucide-react';
import { TASKS_BY_WEEK } from '../utils/onboardingTasks.js';

const PRODUCT_COLORS = {
  'Strong Dad':  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'Strong Mum':  'bg-pink-500/15 text-pink-400 border-pink-500/30',
  '4-Week':      'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  '14-Day':      'bg-violet-500/15 text-violet-400 border-violet-500/30',
  '3-Session':   'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

function productColor(short = '') {
  return PRODUCT_COLORS[short] || 'bg-gray-500/15 text-gray-400 border-gray-500/30';
}

function SessionPips({ weekSessions, currentWeek }) {
  const WEEK_COLORS = ['text-blue-400', 'text-amber-400', 'text-violet-400', 'text-emerald-400'];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {weekSessions.map((count, i) => {
        const w = i + 1;
        const isCurrent = w === currentWeek;
        const color = WEEK_COLORS[i];
        return (
          <span
            key={w}
            className={`inline-flex items-center gap-1 text-xs tabular-nums ${
              isCurrent ? `${color} font-semibold` : 'text-gray-600'
            }`}
          >
            <span className={`text-[10px] font-medium ${isCurrent ? color : 'text-gray-700'}`}>W{w}</span>
            <span className={isCurrent ? color : 'text-gray-600'}>{count}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function OnboardingCard({ client, isComplete, toggleTask, onOpenTask }) {
  const weekTasks  = TASKS_BY_WEEK[client.week] || [];
  const startDate  = parseISO(client.startDate);
  const totalDone  = weekTasks.filter((t) => isComplete(client.id, t.id)).length;
  const allDone    = totalDone === weekTasks.length && weekTasks.length > 0;

  return (
    <div className={`rounded-lg border bg-gray-900 p-3.5 space-y-3 transition-colors ${
      client.isAtRisk
        ? 'border-red-500/30 bg-red-950/10'
        : allDone
          ? 'border-emerald-500/20 bg-emerald-950/10'
          : 'border-gray-800'
    }`}>
      {/* Top row: name + at-risk badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-100 truncate">{client.name || 'Unknown'}</p>
          <p className="text-[11px] text-gray-600 truncate mt-0.5">
            {client.email || client.phone || '–'}
          </p>
        </div>
        {client.isAtRisk && (
          <span className="shrink-0 flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">
            <AlertTriangle className="h-2.5 w-2.5" />
            No sessions
          </span>
        )}
        {!client.isAtRisk && allDone && (
          <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
            Week done ✓
          </span>
        )}
      </div>

      {/* Product badge + start date */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${productColor(client.shortProduct)}`}>
          {client.shortProduct || client.product}
        </span>
        <span className="text-[11px] text-gray-600">
          Started {format(startDate, 'd MMM')}
        </span>
      </div>

      {/* Session counts per week */}
      <div className="flex items-center justify-between">
        <SessionPips weekSessions={client.weekSessions} currentWeek={client.week} />
        <span className="text-[11px] text-gray-600 tabular-nums shrink-0">
          {client.totalSessions} total
        </span>
      </div>

      {/* Divider */}
      {weekTasks.length > 0 && (
        <div className="border-t border-gray-800/60 pt-2.5 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-2">
            Week {client.week} tasks · {totalDone}/{weekTasks.length}
          </p>
          {weekTasks.map((task) => {
            const done = isComplete(client.id, task.id);
            return (
              <div key={task.id} className="flex items-center gap-2 group">
                {/* Checkbox */}
                <button
                  onClick={() => toggleTask(client.id, task.id)}
                  className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                    done
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-gray-700 bg-gray-800 hover:border-gray-500'
                  }`}
                >
                  {done && (
                    <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                {/* Label */}
                <span
                  className={`flex-1 text-xs leading-snug truncate ${
                    done ? 'line-through text-gray-600' : 'text-gray-300'
                  }`}
                >
                  {task.label}
                </span>

                {/* Script button */}
                <button
                  onClick={() => onOpenTask(task)}
                  className="shrink-0 p-1 rounded text-gray-700 hover:text-gray-400 hover:bg-gray-800 transition-colors opacity-0 group-hover:opacity-100"
                  title="View script"
                >
                  <BookOpen className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
