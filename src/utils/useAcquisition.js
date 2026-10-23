import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { leadChannel } from './leadSource.js';

// Same pipeline-name match as netlify/functions/utils/ghl.js (emoji and
// punctuation ignored, so "📈 Leads Pipeline" matches).
const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const isLeadsPipeline = (p) => normName(p?.name).includes('leads pipeline');

async function selectAll(build) {
  let all = [], from = 0;
  while (true) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    all = all.concat(data || []);
    if (!data || data.length < 1000) return all;
    from += 1000;
  }
}

/** Calls a GHL-backed Netlify function as the signed-in staff member. */
export async function ghlApi(fn, { query, body } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const res = await fetch(`/api/${fn}${qs}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${session?.access_token || ''}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

/**
 * The Leads pipeline from the GHL mirror (ghl_* tables, filled by
 * scheduled-ghl-sync.js). Each lead = opportunity + its contact + channel.
 */
export function useAcquisition() {
  const [state, setState] = useState({ pipeline: null, leads: [], lastSync: null, loading: true, error: null });

  const load = useCallback(async () => {
    try {
      const [{ data: pipelines, error: pErr }, { data: logs }] = await Promise.all([
        supabase.from('ghl_pipelines').select('id, name, location_id, stages'),
        supabase.from('ghl_sync_log').select('started_at, finished_at, ok, detail').order('started_at', { ascending: false }).limit(5),
      ]);
      if (pErr) throw new Error(pErr.message);
      const pipeline = (pipelines || []).find(isLeadsPipeline) || null;
      const lastSync = (logs || []).find((l) => l.finished_at) || null;
      if (!pipeline) { setState({ pipeline: null, leads: [], lastSync, loading: false, error: null }); return; }

      const [opps, contacts, links] = await Promise.all([
        selectAll(() => supabase.from('ghl_opportunities')
          .select('id, stage_id, status, name, contact_id, source, monetary_value, assigned_to, created_at, updated_at, last_stage_change_at')
          .eq('pipeline_id', pipeline.id).order('id')),
        selectAll(() => supabase.from('ghl_contacts').select('id, name, email, phone, source, tags, attribution, last_attribution, date_added').order('id')),
        selectAll(() => supabase.from('ghl_lead_links').select('kind, ghl_contact_id, ghl_opportunity_id, referred_by, created_at').neq('kind', 'dismissed').order('id')),
      ]);
      const contactById = Object.fromEntries(contacts.map((c) => [c.id, c]));
      const linkByOpp = Object.fromEntries(links.map((l) => [l.ghl_opportunity_id, l]));
      const linkByContact = Object.fromEntries(links.map((l) => [l.ghl_contact_id, l]));
      const stageName = Object.fromEntries((pipeline.stages || []).map((s) => [s.id, s.name]));

      const leads = opps.map((o) => {
        const contact = contactById[o.contact_id] || null;
        const link = linkByOpp[o.id] || linkByContact[o.contact_id] || null;
        return { ...o, contact, link, stageName: stageName[o.stage_id] || 'Unknown stage', ...leadChannel({ opportunity: o, contact, link }) };
      });
      setState({ pipeline, leads, lastSync, loading: false, error: null });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const [syncing, setSyncing] = useState(false);
  const syncNow = useCallback(async () => {
    setSyncing(true);
    try { await ghlApi('scheduled-ghl-sync'); }
    finally { setSyncing(false); await load(); }
  }, [load]);

  return useMemo(() => ({ ...state, reload: load, syncNow, syncing }), [state, load, syncNow, syncing]);
}
