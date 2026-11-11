import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { simplifiedStatus } from './clientStatus.js';

export const DEFAULT_MILESTONE_TARGETS = [10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
const DAY = 86400000;

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return y ? new Date(y, m - 1, d) : null;
}
// Feb 29 falls on Feb 28 in non-leap years.
function occurrence(year, month, day) {
  const d = new Date(year, month, day);
  return d.getMonth() === month ? d : new Date(year, month + 1, 0);
}

export const DATE_BUCKETS = [
  { key: 'past',      label: 'Just had',        hint: 'last 7 days' },
  { key: 'today',     label: 'Today' },
  { key: 'week',      label: 'This week' },
  { key: 'month',     label: 'Later this month' },
  { key: 'nextMonth', label: 'Next month' },
];

// Where a yearly date (birthday, anniversary) sits relative to today.
// Returns { bucket, date, days, years } or null when it's outside every bucket.
export function yearlyBucket(origin, today = startOfDay(new Date())) {
  if (!origin) return null;
  const y = today.getFullYear();
  const candidates = [y - 1, y, y + 1].map((yr) => occurrence(yr, origin.getMonth(), origin.getDate()));
  const past = candidates.filter((d) => d < today).pop();
  const next = candidates.find((d) => d >= today);
  const daysSince = past ? Math.round((today - past) / DAY) : Infinity;
  if (daysSince <= 7) {
    return { bucket: 'past', date: past, days: -daysSince, years: past.getFullYear() - origin.getFullYear() };
  }
  const days = Math.round((next - today) / DAY);
  const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + ((7 - today.getDay()) % 7)); // Sunday
  const sameMonth = next.getMonth() === today.getMonth() && next.getFullYear() === today.getFullYear();
  const nextMonthIdx = (today.getMonth() + 1) % 12;
  let bucket = null;
  if (days === 0) bucket = 'today';
  else if (next <= endOfWeek) bucket = 'week';
  else if (sameMonth) bucket = 'month';
  else if (next.getMonth() === nextMonthIdx && days < 62) bucket = 'nextMonth';
  if (!bucket) return null;
  return { bucket, date: next, days, years: next.getFullYear() - origin.getFullYear() };
}

/**
 * Everything the Milestones tab shows. Session counts come from the
 * client_visit_milestones() RPC (lifetime visits from the Mindbody mirror);
 * birthdays and anniversaries from the clients table.
 */
export function useMilestones({ pipelineIds }) {
  const [clients, setClients] = useState([]);
  const [visits, setVisits]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      supabase.from('clients')
        .select('id, mindbody_id, first_name, last_name, birth_date, creation_date, start_date, first_class_date, status, status_override, assigned_staff_id, assigned_group'),
      supabase.rpc('client_visit_milestones'),
    ]).then(([c, v]) => {
      if (!live) return;
      if (c.error || v.error) setError((c.error || v.error).message);
      setClients(c.data || []);
      setVisits(v.data || []);
    }).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, []);

  const people = useMemo(() => clients.map((c) => ({
    ...c,
    name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unnamed client',
    simple: simplifiedStatus(c, pipelineIds),
  })), [clients, pipelineIds]);

  const byMindbodyId = useMemo(() => new Map(people.map((p) => [p.mindbody_id, p])), [people]);

  const sessionRows = useMemo(() => visits
    .map((v) => ({ ...v, client: byMindbodyId.get(v.mindbody_id) }))
    .filter((v) => v.client), [visits, byMindbodyId]);

  // How far back the mirror's visit history goes vs. the earliest first class
  // in Mindbody: lifetime counts are partial until those meet.
  const coverage = useMemo(() => {
    const historyFrom = parseDate(visits[0]?.history_from);
    const firsts = clients.map((c) => c.first_class_date).filter(Boolean).sort();
    const gymStart = parseDate(firsts[0]);
    const partial = !!(historyFrom && gymStart && historyFrom - gymStart > 7 * DAY);
    return { historyFrom, gymStart, partial };
  }, [visits, clients]);

  return { people, sessionRows, coverage, loading, error };
}

// Clients within `within` sessions of their next target, who've visited in
// the last 30 days. eta = estimated date from their 28-day pace.
export function upcomingMilestones(rows, targets, within, today = startOfDay(new Date())) {
  const sorted = [...targets].sort((a, b) => a - b);
  return rows.flatMap((r) => {
    const total = Number(r.total_visits);
    const next = sorted.find((t) => t > total);
    if (!next) return [];
    const remaining = next - total;
    const last = parseDate(r.last_visit);
    if (remaining > within || !last || today - last > 30 * DAY) return [];
    const perDay = Number(r.visits_28d) / 28;
    const eta = perDay > 0 ? new Date(today.getTime() + Math.ceil(remaining / perDay) * DAY) : null;
    return [{ ...r, total, next, remaining, eta, perWeek: perDay * 7 }];
  }).sort((a, b) => a.remaining - b.remaining || (a.eta || Infinity) - (b.eta || Infinity));
}

// Milestones reached since `since` (a Date), newest first.
export function recentMilestoneHits(rows, since) {
  return rows.flatMap((r) => (r.recent_hits || [])
    .map((h) => ({ ...r, n: h.n, date: parseDate(h.date) }))
    .filter((h) => h.date >= since))
    .sort((a, b) => b.date - a.date || b.n - a.n);
}

export { parseDate, startOfDay };
