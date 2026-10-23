import { useMemo, useState } from 'react';
import { formatDistanceToNowStrict, format } from 'date-fns';
import { Search } from 'lucide-react';
import { CHANNELS } from '../../utils/leadSource.js';

const STATUSES = [
  { key: 'open', label: 'Open' }, { key: 'won', label: 'Won' }, { key: 'lost', label: 'Lost' }, { key: 'all', label: 'All' },
];
const btn = (active) => `px-3 py-1.5 font-medium transition-colors ${
  active ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
}`;

export function ChannelChip({ channel }) {
  const c = CHANNELS[channel];
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${c.chip}`}>{c.label}</span>;
}

function LeadCard({ lead, onOpen }) {
  const since = lead.last_stage_change_at || lead.created_at;
  return (
    <button
      onClick={() => onOpen(lead)}
      className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:border-emerald-400 hover:shadow transition"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900 leading-snug">{lead.contact?.name || lead.name || 'Unnamed lead'}</p>
        <ChannelChip channel={lead.channel} />
      </div>
      <p className="mt-1 text-[11px] text-gray-500 truncate">{lead.detail}</p>
      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
        <span>{lead.created_at ? `In ${format(new Date(lead.created_at), 'd MMM')}` : ''}</span>
        <span>
          {lead.status !== 'open' ? <span className="capitalize">{lead.status}</span>
            : since ? `${formatDistanceToNowStrict(new Date(since))} in stage` : ''}
        </span>
      </div>
    </button>
  );
}

/** The Leads pipeline as columns, one per GHL stage, in GHL's order. */
export default function LeadBoard({ pipeline, leads, onOpen }) {
  const [status, setStatus]   = useState('open');
  const [channel, setChannel] = useState('all');
  const [q, setQ]             = useState('');

  const columns = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const shown = leads.filter((l) =>
      (status === 'all' || l.status === status) &&
      (channel === 'all' || l.channel === channel) &&
      (!needle || [l.contact?.name, l.name, l.contact?.email, l.contact?.phone].some((v) => v && String(v).toLowerCase().includes(needle))));
    const byStage = {};
    for (const l of shown) (byStage[l.stage_id] ||= []).push(l);
    for (const list of Object.values(byStage)) list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const cols = (pipeline.stages || []).map((s) => ({ ...s, leads: byStage[s.id] || [] }));
    const known = new Set(cols.map((c) => c.id));
    const orphans = shown.filter((l) => !known.has(l.stage_id));
    if (orphans.length) cols.push({ id: '_unknown', name: 'Other stage', leads: orphans });
    return cols;
  }, [pipeline, leads, status, channel, q]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-gray-900">{pipeline.name}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads"
              className="w-44 rounded-lg border border-gray-300 bg-white py-1.5 pl-7 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
            {[{ key: 'all', label: 'All sources' }, ...Object.entries(CHANNELS).map(([key, c]) => ({ key, label: c.label }))].map((c) => (
              <button key={c.key} onClick={() => setChannel(c.key)} className={btn(channel === c.key)}>{c.label}</button>
            ))}
          </div>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
            {STATUSES.map((s) => <button key={s.key} onClick={() => setStatus(s.key)} className={btn(status === s.key)}>{s.label}</button>)}
          </div>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {columns.map((col) => (
          <div key={col.id} className="flex flex-col shrink-0 w-64 rounded-xl border border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200">
              <p className="text-sm font-semibold text-gray-800 truncate">{col.name}</p>
              <span className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs font-bold text-gray-700">{col.leads.length}</span>
            </div>
            <div className="flex flex-col gap-2 p-2 overflow-y-auto max-h-[65vh]">
              {col.leads.length === 0
                ? <p className="py-6 text-center text-xs text-gray-300">No leads</p>
                : col.leads.map((l) => <LeadCard key={l.id} lead={l} onOpen={onOpen} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
