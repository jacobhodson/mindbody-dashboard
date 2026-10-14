import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { completionKey } from './reminders.js';

/**
 * Manager-made Home reminders, their "Done" clicks, and the Active/Draft
 * switches for the built-in Home cards (20261015020000_home_reminders.sql).
 * Everyone reads all three; only managers can change reminders or cards.
 */
export function useReminders() {
  const [reminders, setReminders]     = useState([]);
  const [completions, setCompletions] = useState([]);
  const [cardSettings, setCardSettings] = useState({});
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  const load = useCallback(async () => {
    const [r, c, s] = await Promise.all([
      supabase.from('reminders').select('*').order('sort_order').order('created_at'),
      supabase.from('reminder_completions').select('*'),
      supabase.from('home_card_settings').select('key, active'),
    ]);
    const err = r.error || c.error || s.error;
    if (err) setError(err.message);
    else {
      setError(null);
      setReminders(r.data || []);
      setCompletions(c.data || []);
      setCardSettings(Object.fromEntries((s.data || []).map((x) => [x.key, x.active])));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const completionByKey = useMemo(
    () => new Map(completions.map((x) => [completionKey(x.reminder_id, x.client_id, x.occurrence), x])),
    [completions],
  );

  const run = async (query) => {
    const { error: err } = await query;
    if (err) { setError(err.message); return false; }
    await load();
    return true;
  };

  /** No row = active (the cards were always on before this panel existed). */
  const cardActive = useCallback((key) => cardSettings[key] !== false, [cardSettings]);

  const setCardActive = (key, active) => {
    setCardSettings((prev) => ({ ...prev, [key]: active }));
    return run(supabase.from('home_card_settings').upsert({ key, active, updated_at: new Date().toISOString() }));
  };

  const saveReminder = (fields, id) => (id
    ? run(supabase.from('reminders').update(fields).eq('id', id))
    : run(supabase.from('reminders').insert({
      ...fields,
      sort_order: reminders.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1,
    })));

  const deleteReminder = (id) => run(supabase.from('reminders').delete().eq('id', id));

  const complete = async (reminderId, clientId, occurrence) => {
    // Optimistic — the row vanishes from Home straight away.
    const temp = { id: `tmp-${Math.random()}`, reminder_id: reminderId, client_id: clientId || null, occurrence };
    setCompletions((prev) => [...prev, temp]);
    const { error: err } = await supabase.from('reminder_completions')
      .insert({ reminder_id: reminderId, client_id: clientId || null, occurrence });
    // Someone else got there first — that's still done.
    if (err && err.code !== '23505') {
      setError(err.message);
      setCompletions((prev) => prev.filter((x) => x !== temp));
      return false;
    }
    await load();
    return true;
  };

  const undo = (completion) => run(supabase.from('reminder_completions').delete().eq('id', completion.id));

  return {
    reminders, completionByKey, loading, error,
    cardActive, setCardActive, saveReminder, deleteReminder, complete, undo, reload: load,
  };
}
