import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import defaultLogo from '../assets/newstrength-logo.svg';

const DEFAULTS = { business_name: 'Newstrength', system_name: 'Operations Dashboard', logo_url: null };

/**
 * The single app_settings row (branding today; configurable business rules
 * later). Readable signed-out too, so the login page can use it. `logo` is
 * the uploaded logo or the bundled Newstrength one.
 */
export function useAppSettings() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loaded, setLoaded]     = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('*').maybeSingle();
    if (data) setSettings(data);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (loaded) document.title = settings.system_name || DEFAULTS.system_name;
  }, [loaded, settings.system_name]);

  const save = useCallback(async (patch, staffId) => {
    const { data, error } = await supabase.from('app_settings')
      .update({ ...patch, updated_at: new Date().toISOString(), updated_by: staffId || null })
      .eq('id', true).select().single();
    if (error) return { error: error.message };
    setSettings(data);
    return { data };
  }, []);

  // Uploads to the public `branding` bucket under a fresh name each time so
  // browsers don't keep showing a cached old logo.
  const uploadLogo = useCallback(async (file) => {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('branding').upload(path, file, { contentType: file.type, upsert: false });
    if (error) return { error: error.message };
    const { data } = supabase.storage.from('branding').getPublicUrl(path);
    return { url: data.publicUrl };
  }, []);

  return { settings, logo: settings.logo_url || defaultLogo, loaded, save, uploadLogo, reload: load };
}
