import { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard.jsx';
import LoginForm from './components/LoginForm.jsx';
import { useContactLog } from './utils/useContactLog.js';
import { useAuth } from './utils/useAuth.js';
import { useStaff } from './utils/useStaff.js';

// Every /api/mb-* endpoint reads the Supabase Mindbody mirror (kept current
// by scheduled-mb-mirror.js), never Mindbody itself — so loading or
// refreshing the dashboard costs no Mindbody API calls.

const LOADING_ALL = { attendance: true, clientAnalytics: true, payments: true, revenue: true, onboarding: true, pt: true, celebrations: true };

const ENDPOINTS = {
  attendance:      '/api/mb-attendance',
  clientAnalytics: '/api/mb-client-analytics',
  payments:        '/api/mb-payments',
  revenue:         '/api/mb-revenue',
  onboarding:      '/api/mb-onboarding',
  pt:              '/api/mb-pt-analytics',
  celebrations:    '/api/mb-celebrations',
};

async function safeFetch(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function App() {
  const { user, loading: authLoading, signIn, signOut } = useAuth();
  const { staff, isManager } = useStaff(user);
  const [data, setData]               = useState({ attendance: null, clientAnalytics: null, payments: null, revenue: null, onboarding: null, pt: null, celebrations: null });
  const [loading, setLoading]         = useState(LOADING_ALL);
  const [errors, setErrors]           = useState({});
  const [lastRefresh, setLastRefresh] = useState(null);
  const contactLog = useContactLog(staff);

  const refresh = useCallback(() => {
    setLoading(LOADING_ALL);
    setErrors({});

    Promise.all(Object.entries(ENDPOINTS).map(([key, url]) =>
      safeFetch(url)
        .then(json => setData(prev => ({ ...prev, [key]: json })))
        .catch(e  => setErrors(prev => ({ ...prev, [key]: e.message })))
        .finally(() => setLoading(prev => ({ ...prev, [key]: false })))
    )).then(() => setLastRefresh(new Date()));
  }, []);

  // Lighter-weight than refresh() — just re-pulls the onboarding endpoint,
  // for after a start-date override/drag-drop changes which week a client
  // falls in server-side (see mb-onboarding.js).
  const refreshOnboarding = useCallback(() => {
    setLoading(prev => ({ ...prev, onboarding: true }));
    return safeFetch('/api/mb-onboarding')
      .then(json => setData(prev => ({ ...prev, onboarding: json })))
      .catch(e   => setErrors(prev => ({ ...prev, onboarding: e.message })))
      .finally(() => setLoading(prev => ({ ...prev, onboarding: false })));
  }, []);

  // Load once per signed-in user. Keyed on the id, not the user object:
  // Supabase hands back a new user object on every hourly token refresh,
  // which used to re-run this whole load for every open tab.
  const userId = user?.id;
  useEffect(() => { if (userId) refresh(); }, [userId, refresh]);

  if (authLoading) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center px-4">
        <LoginForm onSignIn={signIn} />
      </div>
    );
  }

  return (
    <Dashboard
      data={data}
      loading={loading}
      errors={errors}
      lastRefresh={lastRefresh}
      onRefresh={refresh}
      refreshOnboarding={refreshOnboarding}
      contactLog={contactLog}
      user={user}
      staff={staff}
      isManager={isManager}
      onSignOut={signOut}
    />
  );
}
