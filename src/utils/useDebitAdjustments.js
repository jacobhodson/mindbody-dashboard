import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// Debit adjustments (suspension/holiday holds) — replaces the Google Form.
// Schema + rules: supabase/migrations/20261119000000_debit_adjustments.sql.
// submitted_by / processed_* are stamped by the DB, never sent from here.

export const DEBIT_STATUSES = [
  { key: 'submitted',   label: 'To process',  tone: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
  { key: 'in_progress', label: 'In progress', tone: 'bg-sky-500/10 text-sky-700 border-sky-500/30' },
  { key: 'processed',   label: 'Processed',   tone: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' },
  { key: 'cancelled',   label: 'Cancelled',   tone: 'bg-gray-100 text-gray-500 border-gray-300' },
];
export const DEBIT_STATUS = Object.fromEntries(DEBIT_STATUSES.map((s) => [s.key, s]));
export const DEBIT_KINDS = [
  { key: 'suspension', label: 'Suspension' },
  { key: 'holiday',    label: 'Holiday' },
];
export const isOpenDebit = (r) => r.status === 'submitted' || r.status === 'in_progress';

export const fmtDebitDate = (d) => (d
  ? new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  : '—');

const SELECT = `*,
  submitter:staff!debit_adjustments_submitted_by_fkey(full_name),
  processor:staff!debit_adjustments_processed_by_fkey(full_name)`;

export function useDebitAdjustments({ openOnly = false, enabled = true } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    let q = supabase.from('debit_adjustments').select(SELECT).order('created_at', { ascending: false });
    if (openOnly) q = q.in('status', ['submitted', 'in_progress']);
    const { data, error } = await q;
    if (!error) setRows(data || []);
    setLoading(false);
  }, [openOnly]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const update = useCallback(async (id, patch) => {
    const { error } = await supabase.from('debit_adjustments').update(patch).eq('id', id);
    if (error) return error.message;
    await load();
    return null;
  }, [load]);

  const remove = useCallback(async (id) => {
    const { error } = await supabase.from('debit_adjustments').delete().eq('id', id);
    if (error) return error.message;
    await load();
    return null;
  }, [load]);

  return { rows, loading, reload: load, update, remove };
}

export async function submitDebitAdjustment(fields) {
  const { error } = await supabase.from('debit_adjustments').insert(fields);
  return error ? error.message : null;
}
