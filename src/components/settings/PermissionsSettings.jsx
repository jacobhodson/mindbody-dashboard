import { useState } from 'react';
import { Lock, Check } from 'lucide-react';
import { Panel } from './settingsUi.jsx';

/**
 * Role × tab grid (role_tab_access). Visibility only — tabs whose data is
 * manager-only in the database (`lockedManagerOnly`) can't be opened to
 * coaches here, and Admin always sees everything.
 */
export default function PermissionsSettings({ staff, tabs, tabAccess }) {
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null);

  const toggle = async (role, tab) => {
    setError(null);
    setSaving(`${role}:${tab.key}`);
    const res = await tabAccess.setAllowed(role, tab.key, !tabAccess.isAllowed(role, tab), staff?.id);
    setSaving(null);
    if (res.error) setError(res.error);
  };

  const editable = tabs.filter((t) => !t.alwaysVisible);

  return (
    <Panel
      title="Permissions"
      description="Which tabs each level sees in the sidebar. Changes apply the next time someone loads the dashboard."
    >
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="overflow-x-auto -mx-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              <th className="px-6 py-2">Tab</th>
              <th className="px-3 py-2 text-center w-28">Coach</th>
              <th className="px-3 py-2 text-center w-28">Manager</th>
              <th className="px-6 py-2 text-center w-28">Admin</th>
            </tr>
          </thead>
          <tbody>
            {editable.map((tab) => (
              <tr key={tab.key} className="border-b border-gray-100">
                <td className="px-6 py-2.5">
                  <span className="flex items-center gap-2 text-gray-800">
                    <tab.Icon className="h-4 w-4 text-gray-400" /> {tab.label}
                    {tab.group && <span className="text-xs text-gray-400">· {tab.group}</span>}
                  </span>
                </td>
                {['coach', 'manager'].map((role) => {
                  const locked = role === 'coach' && tab.lockedManagerOnly;
                  return (
                    <td key={role} className="px-3 py-2.5 text-center">
                      {locked ? (
                        <span title="Holds manager-only data (wages, revenue) — can't be opened to coaches" className="inline-flex text-gray-300">
                          <Lock className="h-4 w-4" />
                        </span>
                      ) : (
                        <input
                          type="checkbox"
                          aria-label={`${tab.label} visible to ${role}s`}
                          checked={tabAccess.isAllowed(role, tab)}
                          disabled={saving === `${role}:${tab.key}`}
                          onChange={() => toggle(role, tab)}
                          className="h-4 w-4 accent-emerald-600"
                        />
                      )}
                    </td>
                  );
                })}
                <td className="px-6 py-2.5 text-center">
                  <span title="Admins always see every tab" className="inline-flex text-emerald-600"><Check className="h-4 w-4" /></span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-gray-500">
        Home and Settings are always visible to everyone. <Lock className="inline h-3 w-3" /> tabs show wages and revenue,
        which the database only ever releases to managers — so they can't be opened to coaches.
      </p>
    </Panel>
  );
}
