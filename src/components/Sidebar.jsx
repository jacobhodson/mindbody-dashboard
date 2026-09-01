export default function Sidebar({ tabs, activeTab, onSelect, atRiskCount }) {
  return (
    <nav className="w-56 shrink-0 border-r border-gray-200 bg-white py-4 px-3 space-y-1">
      {tabs.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`w-full flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === key
              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700'
              : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{label}</span>
          {key === 'onboarding' && atRiskCount > 0 && (
            <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-600 border border-red-500/30">
              {atRiskCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
