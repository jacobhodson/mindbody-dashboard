import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Shown after arriving from an invite or password-reset email (App.jsx,
 * authLink + verifyOtp): the link has already signed the person in, so all that's
 * left is choosing a password.
 */
export default function SetPasswordForm({ kind, email, logo, appName, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState(null);
  const [busy, setBusy]         = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(err.message);
    onDone();
  };

  const inputClass = 'w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="mx-auto max-w-sm w-full">
      <img src={logo} alt="" className="h-10 w-auto max-w-[200px] object-contain mx-auto mb-6" />
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          {kind === 'invite' ? `Welcome to the ${appName}` : 'Choose a new password'}
        </h2>
        <p className="text-xs text-gray-500 mb-5">
          {kind === 'invite' ? 'Choose a password to finish setting up your login' : 'Set a new password'} for <strong className="text-gray-700">{email}</strong>.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="new-password">Password</label>
            <input id="new-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} autoComplete="new-password" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="confirm-password">Confirm password</label>
            <input id="confirm-password" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} autoComplete="new-password" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            <KeyRound className="h-4 w-4" />
            {busy ? 'Saving…' : 'Save password & continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
