import { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard.jsx';
import { useContactLog } from './utils/useContactLog.js';

// All dashboard data is served from a cached snapshot (Netlify Blobs).
// The snapshot is refreshed automatically at midnight Sydney time by a
// scheduled function, or on demand when the user clicks Refresh.

const LOADING_ALL = { attendance: true, clientAnalytics: true, payments: true, revenue: true };
const LOADED_ALL  = { attendance: false, clientAnalytics: false, payments: false, revenue: false };

export default function App() {
  const [data, setData]           = useState({ attendance: null, clientAnalytics: null, payments: null, revenue: null });
  const [loading, setLoading]     = useState(LOADING_ALL);
  const [errors, setErrors]       = useState({});
  const [lastRefresh, setLastRefresh] = useState(null);
  const contactLog = useContactLog();

  // Load snapshot (cached) on mount, or force live refresh on demand
  const load = useCallback(async (force = false) => {
    setLoading(LOADING_ALL);
    setErrors({});
    try {
      const res      = await fetch('/api/mb-snapshot', { method: force ? 'POST' : 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const snapshot = await res.json();

      setData({
        attendance:      snapshot.attendance      ?? null,
        clientAnalytics: snapshot.clientAnalytics ?? null,
        payments:        snapshot.payments        ?? null,
        revenue:         snapshot.revenue         ?? null,
      });
      // Show when the data was actually collected (may be from midnight cache)
      setLastRefresh(snapshot.cachedAt ? new Date(snapshot.cachedAt) : new Date());
    } catch (e) {
      setErrors({ global: e.message });
    } finally {
      setLoading(LOADED_ALL);
    }
  }, []);

  // Load from cache on first render — no polling interval
  useEffect(() => { load(false); }, [load]);

  return (
    <Dashboard
      data={data}
      loading={loading}
      errors={errors}
      lastRefresh={lastRefresh}
      onRefresh={() => load(true)}   // true = force live re-fetch
      contactLog={contactLog}
    />
  );
}
