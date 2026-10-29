import { useState } from 'react';
import { LogIn } from 'lucide-react';
import defaultLogo from '../assets/newstrength-logo.svg';
import { staffAdmin } from '../utils/staffAdmin.js';

export default function LoginForm({ onSignIn, logo = defaultLogo, businessName = 'Newstrength', notice }) {
  const [forgot, setForgot]     = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState(null);
  const [busy, setBusy]         = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (forgot) {
      const res = await staffAdmin('forgot-password', { email });
      setBusy(false);
      if (res.error) return setError(res.error);
      setResetSent(true);
      return;
    }
    const { error: err } = await onSignIn(email, password);
    if (err) setError(err.message);
    setBusy(false);
  };

  const toggleForgot = () => { setForgot((f) => !f); setResetSent(false); setError(null); };

  return (
    <div className="mx-auto max-w-sm w-full">
      <img src={logo} alt={businessName} className="h-10 w-auto max-w-[200px] object-contain mx-auto mb-6" />
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-1">{forgot ? 'Reset your password' : 'Team sign in'}</h2>
        <p className="text-xs text-gray-500 mb-5">
          {forgot ? "Enter your work email and we'll send you a link to set a new password." : 'Use the email and password your manager gave you.'}
        </p>

        {notice && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{notice}</p>}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoComplete="email"
            />
          </div>
          {!forgot && <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoComplete="current-password"
            />
          </div>}

          {error && <p className="text-xs text-red-600">{error}</p>}
          {resetSent && <p className="text-xs text-emerald-700">If that email belongs to an active staff login, a reset link is on its way. Check junk too.</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            <LogIn className="h-4 w-4" />
            {forgot ? (busy ? 'Sending…' : 'Send reset link') : (busy ? 'Signing in…' : 'Sign in')}
          </button>
          <button type="button" onClick={toggleForgot} className="w-full text-center text-xs text-gray-500 hover:text-gray-800">
            {forgot ? 'Back to sign in' : 'Forgot password?'}
          </button>
        </form>
      </div>
    </div>
  );
}
