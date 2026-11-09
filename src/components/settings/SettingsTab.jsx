import { useState } from 'react';
import { Settings, UserRound, Users, ShieldCheck, Palette, Plug, CalendarCheck } from 'lucide-react';
import ProfileSettings      from './ProfileSettings.jsx';
import TeamAccessSettings   from './TeamAccessSettings.jsx';
import PermissionsSettings  from './PermissionsSettings.jsx';
import BrandingSettings     from './BrandingSettings.jsx';
import IntegrationsSettings from './IntegrationsSettings.jsx';
import AttendanceSettings   from './AttendanceSettings.jsx';

// Everyone gets My Profile; managers get team/permissions/branding; only
// the admin (owner) gets Integrations, where API connections live.
const SECTIONS = [
  { key: 'profile',      label: 'My profile',     Icon: UserRound },
  { key: 'team',         label: 'Team & access',  Icon: Users,       level: 'manager' },
  { key: 'permissions',  label: 'Permissions',    Icon: ShieldCheck, level: 'manager' },
  { key: 'attendance',   label: 'Attendance',     Icon: CalendarCheck, level: 'manager' },
  { key: 'branding',     label: 'Branding',       Icon: Palette,     level: 'manager' },
  { key: 'integrations', label: 'Integrations',   Icon: Plug,        level: 'admin' },
];

export default function SettingsTab({ staff, isManager, isAdmin, reloadStaff, tabs, tabAccess, appSettings }) {
  const sections = SECTIONS.filter((s) => !s.level || (s.level === 'manager' ? isManager : isAdmin));
  const [section, setSection] = useState('profile');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Settings className="h-5 w-5 text-emerald-600" /> Settings
          </h1>
          <p className="text-sm text-gray-500">
            {isManager ? 'Your login, your team, who sees what, and how the dashboard looks.' : 'Your name, email and password.'}
          </p>
        </div>

        {sections.length > 1 && (
          <div className="flex flex-wrap rounded-lg border border-gray-300 overflow-hidden text-xs">
            {sections.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setSection(key)}
                className={`flex items-center gap-1 px-3 py-1.5 font-medium transition-colors ${
                  section === key ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {section === 'profile'      && <ProfileSettings staff={staff} reloadStaff={reloadStaff} />}
      {section === 'team'         && isManager && <TeamAccessSettings staff={staff} isAdmin={isAdmin} reloadStaff={reloadStaff} />}
      {section === 'permissions'  && isManager && <PermissionsSettings staff={staff} tabs={tabs} tabAccess={tabAccess} />}
      {section === 'attendance'   && isManager && <AttendanceSettings staff={staff} />}
      {section === 'branding'     && isManager && <BrandingSettings staff={staff} appSettings={appSettings} />}
      {section === 'integrations' && isAdmin   && <IntegrationsSettings />}
    </div>
  );
}
