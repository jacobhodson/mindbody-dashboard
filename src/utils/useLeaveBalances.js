import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const STALE_MS = 6 * 60 * 60 * 1000;

/**
 * Xero leave balances from the `leave_balances` snapshot. RLS returns only
 * your own rows unless you're a manager. If the snapshot is older than six
 * hours (or empty) it asks /api/xero-leave-balances to refresh it from Xero
 * in the background, then re-reads. `refresh()` forces it (managers).
 */
export function useLeaveBalances() {
  const [balances, setBalances]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(null);

  const read = useCallback(async () => {
    const { data, error: err } = await supabase.from('leave_balances').select('*');
    if (err) setError(err.message);
    else setBalances(data || []);
    setLoading(false);
    return data || [];
  }, []);

  const callRefresh = useCallback(async (force) => {
    setRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/xero-leave-balances${force ? '?force=1' : ''}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Refresh failed (${res.status})`);
      setError(null);
      await read();
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, [read]);

  useEffect(() => {
    read().then((rows) => {
      const newest = rows.reduce((m, r) => (r.as_of > m ? r.as_of : m), '');
      if (!newest || Date.now() - new Date(newest).getTime() > STALE_MS) callRefresh(false);
    });
  }, [read, callRefresh]);

  return { balances, loading, refreshing, error, refresh: () => callRefresh(true) };
}
