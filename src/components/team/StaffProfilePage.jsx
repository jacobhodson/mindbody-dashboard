import { useState } from 'react';
import { Mail, CalendarCheck2, FileText, BarChart3 } from 'lucide-react';
import { useAllStaff } from '../../utils/useAllStaff.js';
import { BackLink } from './TeamWholePage.jsx';
import { PersonAvatar, roleLabel } from './people.jsx';
import OneOnOnes from './OneOnOnes.jsx';
import StaffDocuments from './StaffDocuments.jsx';
import StaffPerformance from './StaffPerformance.jsx';

/**
 * One staff member's page on the Team tab: weekly 1-1s (notes + to-dos),
 * documents linked to them, and — at the bottom — their slice of the Team
 * performance data. Managers only for now; the tables are keyed by staff_id
 * so staff could later be given their own page.
 */
export default function StaffProfilePage({ person, staff, team, onBack, onOpenWages, ...rest }) {
  // useAllStaff is the active roster; the to-do assignee picker needs it.
  const { staffList } = useAllStaff();

  return (
    <div className="space-y-6">
      <BackLink onClick={onBack} />

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="h-24 bg-gradient-to-br from-emerald-400 to-sky-600 sm:h-28" />
        <div className="flex flex-wrap items-end gap-4 px-5 pb-5 sm:px-8">
          <div className="-mt-10">
            <PersonAvatar person={person} size="h-20 w-20 text-2xl" />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{person.full_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">{roleLabel(person)}</span>
              {person.email && (
                <a href={`mailto:${person.email}`} className="flex items-center gap-1 hover:text-gray-800">
                  <Mail className="h-3.5 w-3.5" /> {person.email}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <Section icon={CalendarCheck2} title="1-1 meetings" hint="One per week. Notes and to-dos — assigned to-dos also show on that person's Home checklist.">
        <OneOnOnes person={person} staff={staff} staffList={staffList} isManager={rest.isManager} />
      </Section>

      <Section icon={FileText} title="Documents" hint="First aid, CPR, contracts and the like. Private — links expire after a minute.">
        <StaffDocuments person={person} />
      </Section>

      <Section icon={BarChart3} title="Performance" hint="The same figures as the Team page, for this person only.">
        <StaffPerformance person={person} team={team} onOpenWages={onOpenWages} {...rest} />
      </Section>
    </div>
  );
}

function Section({ icon: Icon, title, hint, children }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left sm:px-6"
      >
        <span>
          <span className="flex items-center gap-2 font-semibold text-gray-900">
            <Icon className="h-4 w-4 text-emerald-600" /> {title}
          </span>
          {hint && <span className="mt-0.5 block text-xs text-gray-500">{hint}</span>}
        </span>
        <span className="text-xs text-gray-400">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && <div className="border-t border-gray-100 px-5 py-4 sm:px-6">{children}</div>}
    </section>
  );
}
