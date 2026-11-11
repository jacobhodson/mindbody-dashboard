import { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard.jsx';
import LoginForm from './components/LoginForm.jsx';
import SetPasswordForm from './components/SetPasswordForm.jsx';
import { supabase, authLink } from './lib/supabaseClient.js';
import { useAppSettings } from './utils/useAppSettings.js';
import { useContactLog } from './utils/useContactLog.js';
import { useAuth } from './utils/useAuth.js';
import { useStaff } from './utils/useStaff.js';

// Every /api/mb-* endpoint reads the Supabase Mindbody mirror (kept current
// by scheduled-mb-mirror.js), never Mindbody itself — so loading or
// refreshing the dashboard costs no Mindbody API calls.

const LOADING_ALL = { attendance: true, clientAnalytics: true, payments: true, revenue: true, onboarding: true, pt: true };

const ENDPOINTS = {
  attendance:      '/api/mb-attendance',
  clientAnalytics: '/api/mb-client-analytics',
  payments:        '/api/mb-payments',
  revenue:         '/api/mb-revenue',
  onboarding:      '/api/mb-onboarding',
  pt:              '/api/mb-pt-analytics',
};

async function safeFetch(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function App() {
  const { user, loading: authLoading, signIn, signOut } = useAuth();
  const { staff, isManager, isAdmin, reload: reloadStaff } = useStaff(user);
  const appSettings = useAppSettings();
  // Arrived from an invite / reset email: swap the link's token for a session,
  // then choose a password before anything else.
  const [pendingPassword, setPendingPassword] = useState(null);
  const [linkState, setLinkState] = useState(authLink ? 'verifying' : null); // 'verifying' | 'failed'
  useEffect(() => {
    if (!authLink) return;
    window.history.replaceState(null, '', window.location.pathname);
    supabase.auth.verifyOtp({ token_hash: authLink.tokenHash, type: authLink.type }).then(({ error }) => {
      if (error) { setLinkState('failed'); return; }
      setPendingPassword(authLink.type);
      setLinkState(null);
    });
  }, []);
  const [data, setData]               = useState({ attendance: null, clientAnalytics: null, payments: null, revenue: null, onboarding: null, pt: null });
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

  if (authLoading || linkState === 'verifying') {
    return <div className="min-h-screen bg-gray-50" />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center px-4">
        <LoginForm
          onSignIn={signIn} logo={appSettings.logo} businessName={appSettings.settings.business_name}
          notice={linkState === 'failed' ? 'That link has expired or was already used. Use "Forgot password?" to get a new one, or ask a manager.' : null}
        />
      </div>
    );
  }

  if (pendingPassword) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center px-4">
        <SetPasswordForm
          kind={pendingPassword}
          email={user.email}
          logo={appSettings.logo}
          appName={appSettings.settings.system_name}
          onDone={() => setPendingPassword(null)}
        />
      </div>
    );
  }

  // Deactivated in Settings → Team & access (their login is blocked too, but
  // an already-open session can outlive that until its token expires).
  if (staff && !staff.active) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center px-4">
        <div className="mx-auto max-w-sm w-full rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-gray-700">Your access to the {appSettings.settings.system_name} has been turned off. Talk to a manager if that's a mistake.</p>
          <button onClick={signOut} className="mt-4 rounded-lg bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300">Sign out</button>
        </div>
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
      isAdmin={isAdmin}
      reloadStaff={reloadStaff}
      appSettings={appSettings}
      onSignOut={signOut}
    />
  );
}
