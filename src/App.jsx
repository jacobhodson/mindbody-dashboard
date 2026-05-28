import { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard.jsx';

const REFRESH_MS = 5 * 60 * 1000;

async function safeFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function App() {
  const [data, setData] = useState({ attendance: null, clientAnalytics: null, payments: null });
  const [loading, setLoading] = useState({ attendance: true, clientAnalytics: true, payments: true });
  const [errors, setErrors] = useState({});
  const [lastRefresh, setLastRefresh] = useState(null);

  const refresh = useCallback(() => {
    setLoading({ attendance: true, clientAnalytics: true, payments: true });
    setErrors({});

    const load = (key, url) =>
      safeFetch(url)
        .then((json) => setData((prev) => ({ ...prev, [key]: json })))
        .catch((e) => setErrors((prev) => ({ ...prev, [key]: e.message })))
        .finally(() => setLoading((prev) => ({ ...prev, [key]: false })));

    Promise.all([
      load('attendance',       '/api/mb-attendance'),
      load('clientAnalytics',  '/api/mb-client-analytics'),
      load('payments',         '/api/mb-payments'),
    ]).then(() => setLastRefresh(new Date()));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return <Dashboard data={data} loading={loading} errors={errors} lastRefresh={lastRefresh} onRefresh={refresh} />;
}
