/**
 * useContactLog — fetches and manages the persistent contact log.
 * Persists via Supabase (`contact_log`), replacing the old Notion-backed
 * version — every entry now carries a real staff_id (Notion's version never
 * captured who logged a contact, only what/when).
 *
 * Return shape is unchanged from the Notion version so RedsList.jsx,
 * FringeClientsTable.jsx, OnboardingReds.jsx, OnboardingCard.jsx, and
 * PTRedsList.jsx need no changes:
 *
 *   contacted        Map of clientId → most-recent log entry (within 7 days)
 *   isContacted(id)  true if contacted within last 7 days
 *   logContact(id, name, note)  saves a new entry; updates local state immediately
 *   getClientLogs(id)  fetch full history for one client
 *   loadingLog       true while the initial fetch is running
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const DAYS_7 = 7 * 24 * 60 * 60 * 1000;

export function useContactLog(staff) {
  const [contacted, setContacted] = useState({}); // { clientId: { at, note, name } }
  const [loadingLog, setLoadingLog] = useState(true);

  useEffect(() => {
    if (!staff) return;
    const cutoff = new Date(Date.now() - DAYS_7).toISOString();
    supabase
      .from('contact_log')
      .select('*')
      .not('client_mindbody_id', 'is', null)
      .gte('contacted_at', cutoff)
      .order('contacted_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) return;
        const map = {};
        for (const row of data || []) {
          if (!map[row.client_mindbody_id]) {
            map[row.client_mindbody_id] = { at: row.contacted_at, note: row.note, name: row.client_name };
          }
        }
        setContacted(map);
      })
      .finally(() => setLoadingLog(false));
  }, [staff]);

  const isContacted = useCallback(
    (clientId) => Boolean(contacted[String(clientId)]),
    [contacted]
  );

  const logContact = useCallback(async (clientId, clientName, note) => {
    if (!staff) throw new Error('Not signed in');
    // Resolve the internal clients.id too (not just the legacy
    // client_mindbody_id) so this entry shows up on the client's profile
    // page (ClientDetail.jsx's Contact log section queries by client_id).
    const { data: clientRow } = await supabase
      .from('clients').select('id').eq('mindbody_id', String(clientId)).maybeSingle();
    const { error } = await supabase.from('contact_log').insert({
      staff_id:           staff.id,
      client_mindbody_id: String(clientId),
      client_id:          clientRow?.id || null,
      client_name:        clientName,
      note:               note || null,
    });
    if (error) throw new Error(error.message);

    const entry = { at: new Date().toISOString(), note, name: clientName };
    setContacted((prev) => ({ ...prev, [String(clientId)]: entry }));
    return { logged: true, entry };
  }, [staff]);

  const getClientLogs = useCallback(async (clientId) => {
    const { data, error } = await supabase
      .from('contact_log')
      .select('*')
      .eq('client_mindbody_id', String(clientId))
      .order('contacted_at', { ascending: false });
    if (error) return [];
    return data.map((row) => ({ at: row.contacted_at, note: row.note, name: row.client_name }));
  }, []);

  return { contacted, isContacted, logContact, getClientLogs, loadingLog };
}
