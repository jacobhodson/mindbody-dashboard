import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient.js';
import { classifySession } from '../../../netlify/functions/utils/session-classify.js';
import { Panel, Status, primaryButton, secondaryButton } from './settingsUi.jsx';

// Settings → Attendance. Which Mindbody appointment types count on the
// Personal Training tab, and which class types count in Group Training
// attendance. Stored in attendance_type_rules, one row per type that
// differs from its default (no row = default), read by
// netlify/functions/utils/attendance-rules.js.

const SECTIONS = {
  appointment: {
    title: 'Personal Training — appointment types',
    description: 'Ticked appointment types count as PT: the PT tab (session counts, PT Red’s List, unchecked sessions, coach performance), Team tab coach PT sessions, and each client’s PT session total.',
    defaultNote: 'Default: types whose name reads as Personal Training or Semi Private.',
    // Mirrors ptCategory()'s fallback in attendance-rules.js.
    isDefault: (name) => ['pt', 'sp'].includes(classifySession(name || '')),
  },
  class: {
    title: 'Group Training — class types',
    description: 'Ticked class types count in Group Training attendance (stat cards, attendance chart, 4-week averages) and in each client’s classes-attended total.',
    defaultNote: 'Default: every class counts.',
    isDefault: () => true,
  },
};

export default function AttendanceSettings({ staff }) {
  const [options, setOptions] = useState(null);
  const [rules, setRules]     = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = async () => {
    const [opt, rul] = await Promise.all([
      supabase.rpc('attendance_type_options'),
      supabase.from('attendance_type_rules').select('kind, type_id, included'),
    ]);
    if (opt.error || rul.error) return setLoadError((opt.error || rul.error).message);
    setOptions(opt.data || []);
    setRules(rul.data || []);
  };
  useEffect(() => { load(); }, []);

  if (loadError) return <Panel title="Attendance"><p className="text-sm text-red-600">Could not load attendance types: {loadError}</p></Panel>;
  if (!options) return <Panel title="Attendance"><div className="h-32 animate-pulse rounded-lg bg-gray-100" /></Panel>;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      {Object.keys(SECTIONS).map((kind) => (
        <TypeSection
          key={kind}
          kind={kind}
          config={SECTIONS[kind]}
          options={options.filter((o) => o.kind === kind)}
          rules={rules.filter((r) => r.kind === kind)}
          staffId={staff?.id}
          onSaved={load}
        />
      ))}
    </div>
  );
}

function TypeSection({ kind, config, options, rules, staffId, onSaved }) {
  // Saved state: rule if there is one, else the default.
  const saved = useMemo(() => {
    const byId = new Map(rules.map((r) => [String(r.type_id), r.included]));
    const out = {};
    for (const o of options) out[o.type_id] = byId.has(o.type_id) ? byId.get(o.type_id) : config.isDefault(o.name);
    return out;
  }, [options, rules, config]);

  const [ticked, setTicked] = useState(saved);
  const [showUnused, setShowUnused] = useState(false);
  const [busy, setBusy]     = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => { setTicked(saved); }, [saved]);

  // Duplicate names (e.g. two "Personal Training" types) get their id shown.
  const nameCounts = useMemo(() => {
    const m = {};
    for (const o of options) m[o.name] = (m[o.name] || 0) + 1;
    return m;
  }, [options]);

  const sorted = [...options].sort((a, b) => b.uses_120d - a.uses_120d || a.name.localeCompare(b.name));
  const used   = sorted.filter((o) => o.uses_120d > 0);
  const unused = sorted.filter((o) => o.uses_120d === 0);
  const dirty  = options.some((o) => ticked[o.type_id] !== saved[o.type_id]);
  const changedFromDefault = options.filter((o) => ticked[o.type_id] !== config.isDefault(o.name)).length;

  const save = async () => {
    setBusy(true); setResult(null);
    const upserts = [];
    const deletes = [];
    for (const o of options) {
      if (ticked[o.type_id] === config.isDefault(o.name)) deletes.push(o.type_id);
      else upserts.push({ kind, type_id: o.type_id, type_name: o.name, included: ticked[o.type_id], updated_by: staffId ?? null, updated_at: new Date().toISOString() });
    }
    let error = null;
    if (upserts.length) ({ error } = await supabase.from('attendance_type_rules').upsert(upserts));
    if (!error && deletes.length) ({ error } = await supabase.from('attendance_type_rules').delete().eq('kind', kind).in('type_id', deletes));
    setBusy(false);
    if (error) return setResult({ error: error.message });
    setResult({ ok: 'Saved. Reload the dashboard to see the new counts.' });
    onSaved();
  };

  const resetToDefault = () => {
    const out = {};
    for (const o of options) out[o.type_id] = config.isDefault(o.name);
    setTicked(out);
  };

  const row = (o) => {
    const isDefault = ticked[o.type_id] === config.isDefault(o.name);
    return (
      <label key={o.type_id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
        <input
          type="checkbox"
          checked={!!ticked[o.type_id]}
          onChange={(e) => setTicked((t) => ({ ...t, [o.type_id]: e.target.checked }))}
          className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span className={`flex-1 min-w-0 text-sm ${o.uses_120d ? 'text-gray-900' : 'text-gray-500'}`}>
          <span className="truncate">{o.name || 'Unnamed'}</span>
          {nameCounts[o.name] > 1 && <span className="ml-1.5 text-xs text-gray-400">#{o.type_id}</span>}
          {!isDefault && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">Changed</span>}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-gray-400">{o.uses_120d.toLocaleString()}</span>
      </label>
    );
  };

  return (
    <Panel
      title={config.title}
      description={config.description}
      action={changedFromDefault > 0 && (
        <button type="button" onClick={resetToDefault} className="flex shrink-0 items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
          <RotateCcw className="h-3 w-3" /> Reset to default
        </button>
      )}
    >
      <div className="flex items-center justify-between px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
        <span>Counts?</span><span>Last 120 days</span>
      </div>
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {used.map(row)}
        {unused.length > 0 && (
          showUnused ? unused.map(row) : (
            <button type="button" onClick={() => setShowUnused(true)} className="w-full px-3 py-2 text-left text-xs text-gray-500 hover:bg-gray-50">
              Show {unused.length} type{unused.length === 1 ? '' : 's'} not used in the last 120 days
            </button>
          )
        )}
        {options.length === 0 && <p className="px-3 py-4 text-sm text-gray-500">No types in the Mindbody mirror yet.</p>}
      </div>
      <p className="mt-2 text-xs text-gray-400">{config.defaultNote}</p>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={save} disabled={!dirty || busy} className={primaryButton}>{busy ? 'Saving…' : 'Save'}</button>
        {dirty && <button type="button" onClick={() => { setTicked(saved); setResult(null); }} className={secondaryButton}>Cancel</button>}
        <Status result={result} />
      </div>
    </Panel>
  );
}
