import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Mail, Copy, Check, KeyRound, Pencil, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient.js';
import { staffAdmin, ROLE_LABELS } from '../../utils/staffAdmin.js';
import { Panel, Status, inputClass, primaryButton, secondaryButton } from './settingsUi.jsx';

/**
 * Managers: add staff, change role / coach flag / name / email, send a
 * set-password link, deactivate. Role and coach changes write straight to
 * `staff` (RLS + staff_guard_update police them); anything touching the
 * login itself goes through /api/staff-admin.
 */
export default function TeamAccessSettings({ staff: me, isAdmin, reloadStaff }) {
  const [people, setPeople]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [linkResult, setLinkResult] = useState(null); // { name, link, emailed, kind }
  const [rowError, setRowError] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('staff').select('*').order('active', { ascending: false }).order('full_name');
    setPeople(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const canEdit = (p) => isAdmin || p.role !== 'admin';

  const update = async (p, patch) => {
    setRowError(null);
    const { error } = await supabase.from('staff').update(patch).eq('id', p.id);
    if (error) setRowError(`${p.full_name}: ${error.message}`);
    await load();
    if (p.id === me.id) reloadStaff?.();
  };

  const sendLink = async (p) => {
    setRowError(null);
    const res = await staffAdmin('login-link', { staff_id: p.id });
    if (res.error) return setRowError(`${p.full_name}: ${res.error}`);
    setLinkResult({ name: p.full_name, email: p.email, link: res.link, emailed: res.emailed, kind: 'link' });
  };

  const setActive = async (p, active) => {
    if (!active && !window.confirm(`Deactivate ${p.full_name}? They won't be able to sign in. Their history stays.`)) return;
    setRowError(null);
    const res = await staffAdmin('set-active', { staff_id: p.id, active });
    if (res.error) setRowError(`${p.full_name}: ${res.error}`);
    load();
  };

  return (
    <div className="space-y-6">
      <Panel
        title="Team & access"
        description="Everyone with a login. Deactivating blocks sign-in but keeps their tasks, notes and payroll history."
        action={!showAdd && (
          <button onClick={() => setShowAdd(true)} className={`${primaryButton} flex items-center gap-1.5 whitespace-nowrap shrink-0`}>
            <UserPlus className="h-4 w-4" /> Add staff member
          </button>
        )}
      >
        {showAdd && (
          <AddStaffForm
            isAdmin={isAdmin}
            onCancel={() => setShowAdd(false)}
            onAdded={(res, name, email) => {
              setShowAdd(false);
              setLinkResult({ name, email, link: res.link, emailed: res.emailed, kind: 'invite' });
              load();
            }}
          />
        )}

        {linkResult && <LinkNotice result={linkResult} onClose={() => setLinkResult(null)} />}
        {rowError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{rowError}</p>}

        {loading ? (
          <p className="text-sm text-gray-400">Loading team…</p>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                  <th className="px-6 py-2">Name</th>
                  <th className="px-3 py-2">Access level</th>
                  <th className="px-3 py-2">Coach</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-6 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <StaffRow
                    key={p.id}
                    person={p}
                    isSelf={p.id === me.id}
                    editable={canEdit(p)}
                    isAdmin={isAdmin}
                    onUpdate={(patch) => update(p, patch)}
                    onChangeEmail={async (email) => {
                      const res = await staffAdmin('change-email', { staff_id: p.id, email });
                      if (res.error) return res.error;
                      load();
                      return null;
                    }}
                    onSendLink={() => sendLink(p)}
                    onSetActive={(active) => setActive(p, active)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="What each level can do">
        <ul className="space-y-1.5 text-sm text-gray-600">
          <li><strong className="text-gray-800">Coach</strong> — the tabs ticked for coaches in Permissions, plus their own profile.</li>
          <li><strong className="text-gray-800">Manager</strong> — everything coaches get, plus Finances/Team data, adding staff, making other managers, permissions and branding.</li>
          <li><strong className="text-gray-800">Admin (owner)</strong> — everything, plus API connections (Integrations) and granting or removing admin. There must always be at least one admin.</li>
        </ul>
      </Panel>
    </div>
  );
}

function StaffRow({ person: p, isSelf, editable, isAdmin, onUpdate, onChangeEmail, onSendLink, onSetActive }) {
  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState(p.full_name);
  const [email, setEmail]     = useState(p.email);
  const [error, setError]     = useState(null);
  const [busy, setBusy]       = useState(false);

  const save = async () => {
    setBusy(true); setError(null);
    if (name.trim() && name.trim() !== p.full_name) await onUpdate({ full_name: name.trim() });
    if (email.trim().toLowerCase() !== p.email.toLowerCase()) {
      const e = await onChangeEmail(email.trim());
      if (e) { setError(e); setBusy(false); return; }
    }
    setBusy(false);
    setEditing(false);
  };

  const roleOptions = ['coach', 'manager', ...(isAdmin || p.role === 'admin' ? ['admin'] : [])];
  const roleLocked = !editable || isSelf || !p.active;

  return (
    <tr className={`border-b border-gray-100 align-top ${p.active ? '' : 'opacity-60'}`}>
      <td className="px-6 py-3">
        {editing ? (
          <div className="space-y-1.5 min-w-[220px]">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} aria-label="Name" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} aria-label="Email" />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-1.5">
              <button onClick={save} disabled={busy} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => { setEditing(false); setName(p.full_name); setEmail(p.email); setError(null); }} className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="font-medium text-gray-900">{p.full_name}{isSelf && <span className="ml-1.5 text-xs font-normal text-gray-400">(you)</span>}</p>
            <p className="text-xs text-gray-500">{p.email}</p>
          </>
        )}
      </td>
      <td className="px-3 py-3">
        <select
          value={p.role}
          disabled={roleLocked}
          onChange={(e) => {
            const role = e.target.value;
            if (role === 'admin' && !window.confirm(`Make ${p.full_name} an admin? Admins can manage API connections and other admins.`)) return;
            onUpdate({ role });
          }}
          title={isSelf ? "You can't change your own access level" : !editable ? 'Only an admin can change an admin' : undefined}
          className="rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-800 disabled:opacity-60"
        >
          {roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </td>
      <td className="px-3 py-3">
        <input
          type="checkbox"
          checked={!!p.is_coach}
          disabled={!editable}
          onChange={(e) => onUpdate({ is_coach: e.target.checked })}
          title="Counts as a coach in Team tab, LER and coach pickers"
          className="h-4 w-4 accent-emerald-600"
        />
      </td>
      <td className="px-3 py-3">
        {p.active ? (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
        ) : (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Deactivated</span>
        )}
      </td>
      <td className="px-6 py-3">
        {editable && !editing && (
          <div className="flex justify-end gap-1">
            {/* Your own name/email/password live in My profile (email needs your password). */}
            {p.active && !isSelf && (
              <>
                <IconButton title="Edit name / email" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /></IconButton>
                <IconButton title="Send a set-password link" onClick={onSendLink}><KeyRound className="h-3.5 w-3.5" /></IconButton>
              </>
            )}
            {!isSelf && (
              <button
                onClick={() => onSetActive(!p.active)}
                className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              >
                {p.active ? 'Deactivate' : 'Reactivate'}
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function IconButton({ title, onClick, children }) {
  return (
    <button title={title} aria-label={title} onClick={onClick} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-800">
      {children}
    </button>
  );
}

function AddStaffForm({ isAdmin, onCancel, onAdded }) {
  const [f, setF]           = useState({ full_name: '', email: '', role: 'coach', is_coach: true });
  const [busy, setBusy]     = useState(false);
  const [result, setResult] = useState(null);
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setResult(null);
    const res = await staffAdmin('invite', f);
    setBusy(false);
    if (res.error) return setResult({ error: res.error });
    onAdded(res, f.full_name, f.email);
  };

  return (
    <form onSubmit={submit} className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">New staff member</p>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-700" aria-label="Cancel"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input value={f.full_name} onChange={set('full_name')} placeholder="Name" className={inputClass} aria-label="Name" required />
        <input type="email" value={f.email} onChange={set('email')} placeholder="Email" className={inputClass} aria-label="Email" required />
        <select value={f.role} onChange={set('role')} className={inputClass} aria-label="Access level">
          <option value="coach">{ROLE_LABELS.coach}</option>
          <option value="manager">{ROLE_LABELS.manager}</option>
          {isAdmin && <option value="admin">{ROLE_LABELS.admin}</option>}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={f.is_coach} onChange={set('is_coach')} className="h-4 w-4 accent-emerald-600" />
          Coaches clients (shows in Team tab &amp; LER)
        </label>
      </div>
      <p className="text-xs text-gray-500">They'll get an email with a link to choose their password. You'll also get the link to send yourself, in case it lands in junk.</p>
      <Status result={result} />
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={primaryButton}>{busy ? 'Adding…' : 'Add & send invite'}</button>
        <button type="button" onClick={onCancel} className={secondaryButton}>Cancel</button>
      </div>
    </form>
  );
}

function LinkNotice({ result, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(result.link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };
  return (
    <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-gray-800">
          <Mail className="inline h-4 w-4 mr-1 text-emerald-600" />
          {result.kind === 'invite' ? `${result.name} has been added. ` : ''}
          {result.emailed
            ? <>A set-password link was emailed to <strong>{result.email}</strong>.</>
            : <>The email couldn't be sent — copy the link below and send it to {result.name} yourself.</>}
        </p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Dismiss"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input readOnly value={result.link} className={`${inputClass} text-xs`} aria-label="Set-password link" onFocus={(e) => e.target.select()} />
        <button onClick={copy} className={`${secondaryButton} flex items-center gap-1 shrink-0`}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-gray-500">Works once, expires in 24 hours. Anyone with the link can set this person's password, so only send it to them.</p>
    </div>
  );
}
