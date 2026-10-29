import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import { staffAdmin, verifyPassword, ROLE_LABELS } from '../../utils/staffAdmin.js';
import { Panel, Status, inputClass, primaryButton } from './settingsUi.jsx';

export default function ProfileSettings({ staff, reloadStaff }) {
  if (!staff) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <NameForm staff={staff} reloadStaff={reloadStaff} />
      <EmailForm staff={staff} reloadStaff={reloadStaff} />
      <PasswordForm staff={staff} />
      <Panel title="Access level" description="Set by a manager in Team & access.">
        <p className="text-sm text-gray-700">
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">{ROLE_LABELS[staff.role] || staff.role}</span>
          {staff.is_coach && staff.role !== 'coach' && <span className="ml-2 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700">Coach</span>}
        </p>
      </Panel>
    </div>
  );
}

function NameForm({ staff, reloadStaff }) {
  const [name, setName]     = useState(staff.full_name || '');
  const [busy, setBusy]     = useState(false);
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setResult(null);
    const { error } = await supabase.from('staff').update({ full_name: name.trim() }).eq('id', staff.id);
    setBusy(false);
    if (error) return setResult({ error: error.message });
    setResult({ ok: 'Name updated.' });
    reloadStaff?.();
  };

  return (
    <Panel title="Name" description="How you appear on tasks, rocks and the team list.">
      <form onSubmit={submit} className="space-y-3">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} aria-label="Name" required />
        <Status result={result} />
        <button type="submit" disabled={busy || !name.trim() || name.trim() === staff.full_name} className={primaryButton}>
          {busy ? 'Saving…' : 'Save name'}
        </button>
      </form>
    </Panel>
  );
}

function EmailForm({ staff, reloadStaff }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [result, setResult]     = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setResult(null);
    const res = await staffAdmin('change-email', { staff_id: staff.id, email, current_password: password });
    setBusy(false);
    if (res.error) return setResult({ error: res.error });
    setEmail(''); setPassword('');
    setResult({ ok: 'Email updated — use it next time you sign in.' });
    reloadStaff?.();
  };

  return (
    <Panel title="Email" description={<>You sign in with <strong className="text-gray-700">{staff.email}</strong>.</>}>
      <form onSubmit={submit} className="space-y-3">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="New email" className={inputClass} aria-label="New email" required autoComplete="email" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Current password" className={inputClass} aria-label="Current password" required autoComplete="current-password" />
        <Status result={result} />
        <button type="submit" disabled={busy || !email || !password} className={primaryButton}>
          {busy ? 'Saving…' : 'Change email'}
        </button>
      </form>
    </Panel>
  );
}

function PasswordForm({ staff }) {
  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy]       = useState(false);
  const [result, setResult]   = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setResult(null);
    if (next.length < 8) return setResult({ error: 'Use at least 8 characters.' });
    if (next !== confirm) return setResult({ error: "The new passwords don't match." });
    setBusy(true);
    if (!(await verifyPassword(staff.email, current))) {
      setBusy(false);
      return setResult({ error: 'Current password is incorrect.' });
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (error) return setResult({ error: error.message });
    setCurrent(''); setNext(''); setConfirm('');
    setResult({ ok: 'Password changed.' });
  };

  return (
    <Panel title="Password" description="At least 8 characters.">
      <form onSubmit={submit} className="space-y-3">
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" className={inputClass} aria-label="Current password" required autoComplete="current-password" />
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password" className={inputClass} aria-label="New password" required autoComplete="new-password" />
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" className={inputClass} aria-label="Confirm new password" required autoComplete="new-password" />
        <Status result={result} />
        <button type="submit" disabled={busy || !current || !next || !confirm} className={primaryButton}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </Panel>
  );
}
