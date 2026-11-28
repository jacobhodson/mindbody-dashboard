import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const BUCKET = 'staff-documents';
export const MAX_DOC_BYTES = 25 * 1024 * 1024;

/**
 * Files linked to one staff member (first aid certificate, contracts…).
 * Rows in staff_documents; the files sit in the PRIVATE `staff-documents`
 * bucket at `<staff_id>/<uuid>-<safe name>`. Never a public URL — opening a
 * file asks for a signed URL that expires after a minute. Managers only
 * (RLS on both the table and the bucket).
 */
export function useStaffDocuments(staffId) {
  const [docs, setDocs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    if (!staffId) { setDocs([]); setLoading(false); return; }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('staff_documents').select('*').eq('staff_id', staffId).order('created_at', { ascending: false });
    if (err) setError(err.message);
    else { setDocs(data || []); setError(null); }
    setLoading(false);
  }, [staffId]);

  useEffect(() => { load(); }, [load]);

  const upload = useCallback(async (file, { title, expires_on }) => {
    if (!file) return null;
    if (file.size > MAX_DOC_BYTES) { setError('That file is over 25 MB.'); return null; }
    const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-80) || 'file';
    const path = `${staffId}/${crypto.randomUUID()}-${safe}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
    if (upErr) { setError(upErr.message); return null; }
    const { data, error: err } = await supabase.from('staff_documents').insert({
      staff_id:   staffId,
      title:      title?.trim() || file.name,
      file_path:  path,
      file_name:  file.name,
      mime_type:  file.type || null,
      size_bytes: file.size,
      expires_on: expires_on || null,
    }).select().single();
    if (err) {
      await supabase.storage.from(BUCKET).remove([path]); // don't leave an orphaned file
      setError(err.message);
      return null;
    }
    setError(null);
    setDocs((prev) => [data, ...prev]);
    return data;
  }, [staffId]);

  const update = useCallback(async (id, patch) => {
    const { data, error: err } = await supabase.from('staff_documents').update(patch).eq('id', id).select().single();
    if (err) { setError(err.message); return null; }
    setDocs((prev) => prev.map((d) => (d.id === id ? data : d)));
    return data;
  }, []);

  const remove = useCallback(async (doc) => {
    const { error: err } = await supabase.from('staff_documents').delete().eq('id', doc.id);
    if (err) { setError(err.message); return false; }
    await supabase.storage.from(BUCKET).remove([doc.file_path]);
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    return true;
  }, []);

  /** Short-lived link; `download` forces a save rather than opening inline. */
  const signedUrl = useCallback(async (doc, { download = false } = {}) => {
    const { data, error: err } = await supabase.storage.from(BUCKET)
      .createSignedUrl(doc.file_path, 60, download ? { download: doc.file_name } : undefined);
    if (err) { setError(err.message); return null; }
    return data.signedUrl;
  }, []);

  return { docs, loading, error, upload, update, remove, signedUrl, reload: load };
}
