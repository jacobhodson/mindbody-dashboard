import { useState, useEffect } from 'react';
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';

/**
 * Two independent responsive behaviors:
 *  - Mobile (< md): off-canvas drawer, hidden by default, toggled by the
 *    hamburger button in Dashboard's header (mobileOpen/onCloseMobile,
 *    controlled from there since the toggle button lives in a sibling).
 *  - Desktop (>= md): inline in the layout as before, with its own
 *    collapse-to-icons toggle (persisted locally per browser).
 */
export default function Sidebar({ tabs, activeTab, onSelect, atRiskCount, mobileOpen, onCloseMobile }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  const handleSelect = (key) => {
    onSelect(key);
    onCloseMobile?.();
  };

  return (
    <>
      {/* Backdrop — mobile drawer only */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onCloseMobile} />
      )}

      <nav
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white py-4 px-3
          transition-transform duration-200 ease-in-out
          md:sticky md:top-[79px] md:z-auto md:h-[calc(100vh-79px)] md:translate-x-0 md:transition-[width] md:duration-200
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          ${collapsed ? 'md:w-16' : 'md:w-56'}`}
      >
        <button
          onClick={onCloseMobile}
          className="mb-2 self-end text-gray-400 hover:text-gray-700 md:hidden"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex-1 space-y-1 overflow-y-auto">
          {tabs.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => handleSelect(key)}
              title={collapsed ? label : undefined}
              className={`flex w-full items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors ${
                collapsed ? 'md:justify-center' : ''
              } ${
                activeTab === key
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={`flex-1 text-left ${collapsed ? 'md:hidden' : ''}`}>{label}</span>
              {key === 'onboarding' && atRiskCount > 0 && (
                <span className={`rounded-full border border-red-500/30 bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-600 ${collapsed ? 'md:hidden' : ''}`}>
                  {atRiskCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 md:flex"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : (<><ChevronsLeft className="h-4 w-4" /> Collapse</>)}
        </button>
      </nav>
    </>
  );
}
