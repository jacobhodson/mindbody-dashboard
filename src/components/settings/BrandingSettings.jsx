import { useState, useRef } from 'react';
import { Upload, RotateCcw } from 'lucide-react';
import defaultLogo from '../../assets/newstrength-logo.svg';
import { Panel, Status, inputClass, primaryButton, secondaryButton } from './settingsUi.jsx';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export default function BrandingSettings({ staff, appSettings }) {
  const { settings, save, uploadLogo } = appSettings;
  const [businessName, setBusinessName] = useState(settings.business_name);
  const [systemName, setSystemName]     = useState(settings.system_name);
  const [logoUrl, setLogoUrl]           = useState(settings.logo_url);
  const [busy, setBusy]     = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const dirty = businessName !== settings.business_name || systemName !== settings.system_name || logoUrl !== settings.logo_url;

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setResult({ error: 'Choose an image (PNG, JPG or SVG).' });
    if (file.size > MAX_LOGO_BYTES) return setResult({ error: 'Keep the logo under 2 MB.' });
    setBusy(true); setResult(null);
    const res = await uploadLogo(file);
    setBusy(false);
    if (res.error) return setResult({ error: res.error });
    setLogoUrl(res.url);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setResult(null);
    const res = await save({ business_name: businessName.trim(), system_name: systemName.trim(), logo_url: logoUrl || null }, staff?.id);
    setBusy(false);
    setResult(res.error ? { error: res.error } : { ok: 'Branding saved — everyone sees it next time they load the dashboard.' });
  };

  return (
    <Panel title="Branding" description="Shown in the header, on the sign-in page, in the browser tab and in staff emails.">
      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Logo</label>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-32 items-center justify-center rounded-lg border border-gray-200 bg-white p-2">
                <img src={logoUrl || defaultLogo} alt="Current logo" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex flex-col gap-1.5">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={`${secondaryButton} flex items-center gap-1.5`}>
                  <Upload className="h-3.5 w-3.5" /> Upload new
                </button>
                {logoUrl && (
                  <button type="button" onClick={() => setLogoUrl(null)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
                    <RotateCcw className="h-3 w-3" /> Use default logo
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={pickFile} className="hidden" />
            </div>
            <p className="mt-1 text-xs text-gray-400">A wide logo on a transparent background works best. Max 2 MB.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="business-name">Business name</label>
            <input id="business-name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputClass} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="system-name">System name</label>
            <input id="system-name" value={systemName} onChange={(e) => setSystemName(e.target.value)} className={inputClass} required />
          </div>
          <Status result={result} />
          <button type="submit" disabled={busy || !dirty || !businessName.trim() || !systemName.trim()} className={primaryButton}>
            {busy ? 'Saving…' : 'Save branding'}
          </button>
        </div>

        <div>
          <p className="block text-xs font-medium text-gray-600 mb-1">Preview</p>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex items-center gap-3">
            <img src={logoUrl || defaultLogo} alt="" className="h-8 w-auto" />
            <div className="border-l border-gray-200 pl-3 min-w-0">
              <p className="text-lg font-semibold tracking-tight text-gray-900 truncate">{systemName || ' '}</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{businessName || ' '}</p>
            </div>
          </div>
        </div>
      </form>
    </Panel>
  );
}
