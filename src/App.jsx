import { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard.jsx';
import { useContactLog } from './utils/useContactLog.js';

// Data is fetched live from Mindbody on page load and on manual refresh.
// A scheduled Netlify function refreshes a server-side cache at midnight Sydney
// time — but the frontend always reads fresh so there's no stale-cache risk.
// The 5-minute auto-refresh interval has been removed to save API credits.

const LOADING_ALL = { attendance: true, clientAnalytics: true, payments: true, revenue: true };
const LOADED_ALL  = { attendance: false, clientAnalytics: false, payments: false, revenue: false };

async function safeFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function App() {
  const [data, setData]               = useState({ attendance: null, clientAnalytics: null, payments: null, revenue: null });
  const [loading, setLoading]         = useState(LOADING_ALL);
  const [errors, setErrors]           = useState({});
  const [lastRefresh, setLastRefresh] = useState(null);
  const contactLog = useContactLog();

  const refresh = useCallback(() => {
    setLoading(LOADING_ALL);
    setErrors({});

    const load = (key, url) =>
      safeFetch(url)
        .then((json) => setData((prev) => ({ ...prev, [key]: json })))
        .catch((e)   => setErrors((prev) => ({ ...prev, [key]: e.message })))
        .finally(()  => setLoading((prev) => ({ ...prev, [key]: false })));

    Promise.all([
      load('attendance',      '/api/mb-attendance'),
      load('clientAnalytics', '/api/mb-client-analytics'),
      load('payments',        '/api/mb-payments'),
      load('revenue',         '/api/mb-revenue'),
    ]).then(() => setLastRefresh(new Date()));
  }, []);

  // Fetch once on mount — no polling interval
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <Dashboard
      data={data}
      loading={loading}
      errors={errors}
      lastRefresh={lastRefresh}
      onRefresh={refresh}
      contactLog={contactLog}
    />
  );
}
