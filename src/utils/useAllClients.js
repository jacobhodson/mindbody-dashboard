import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Loads the full client roster (mirrors useAllStaff.js exactly) — used by
 * ClientsList and by the client-picker datalists in TaskChecklist.jsx
 * (ContactLogForm/TaskForm).
 */
export function useAllClients() {
  const [clientsList, setClientsList] = useState([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    supabase.from('clients').select('*').order('last_name')
      .then(({ data, error }) => { if (!error) setClientsList(data || []); })
      .finally(() => setLoading(false));
  }, []);

  return { clientsList, loading };
}
