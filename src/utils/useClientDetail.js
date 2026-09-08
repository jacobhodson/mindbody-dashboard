import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Loads one client (by Mindbody id) plus their merged visit-ledger timeline
 * and notes, and exposes the writes a manager/staff member can make from the
 * client profile: caseload assignment, next-programme-due date, and adding a
 * note. RLS already restricts who can actually do each of these (managers
 * only for the clients-row update; any signed-in staff for their own note) —
 * this hook just performs the write, same division of labour as
 * useTeamTasks.js.
 */
export function useClientDetail(mindbodyId) {
  const [client, setClient]           = useState(null);
  const [visits, setVisits]           = useState([]); // merged class + appointment visits, desc by date
  const [notes, setNotes]             = useState([]);
  const [contactLogs, setContactLogs] = useState([]);
  const [linkedTasks, setLinkedTasks] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  const load = useCallback(async () => {
    if (!mindbodyId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: clientRow, error: clientErr } = await supabase
        .from('clients').select('*').eq('mindbody_id', mindbodyId).maybeSingle();
      if (clientErr) throw clientErr;
      setClient(clientRow || null);

      if (!clientRow) { setVisits([]); setNotes([]); setContactLogs([]); setLinkedTasks([]); return; }

      const [classRes, apptRes, notesRes, contactRes, tasksRes] = await Promise.all([
        supabase.from('client_class_visits').select('*').eq('client_id', clientRow.id).order('class_date', { ascending: false }),
        supabase.from('client_appointment_visits').select('*').eq('client_id', clientRow.id).order('appointment_date', { ascending: false }),
        supabase.from('client_notes').select('*').eq('client_id', clientRow.id).order('created_at', { ascending: false }),
        supabase.from('contact_log').select('*').eq('client_id', clientRow.id).order('contacted_at', { ascending: false }),
        supabase.from('task_templates').select('*').eq('client_id', clientRow.id).order('created_at', { ascending: false }),
      ]);
      if (classRes.error) throw classRes.error;
      if (apptRes.error) throw apptRes.error;
      if (notesRes.error) throw notesRes.error;
      if (contactRes.error) throw contactRes.error;
      if (tasksRes.error) throw tasksRes.error;

      const merged = [
        ...(classRes.data || []).map((v) => ({
          kind: 'class', id: v.id, date: v.class_date, label: v.class_name || v.service_name || 'Class',
          staffName: v.staff_name, status: v.signed_in ? 'Attended' : (v.late_cancelled ? 'Late cancelled' : 'No-show'),
        })),
        ...(apptRes.data || []).map((v) => ({
          kind: 'appointment', id: v.id, date: v.appointment_date, label: v.session_type_name || 'Appointment',
          staffName: v.staff_name, status: v.status,
        })),
      ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      setVisits(merged);
      setNotes(notesRes.data || []);
      setContactLogs(contactRes.data || []);
      setLinkedTasks(tasksRes.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [mindbodyId]);

  useEffect(() => { load(); }, [load]);

  const updateCaseload = useCallback(async (assignedStaffId) => {
    if (!client) return null;
    const { data, error: updErr } = await supabase
      .from('clients').update({ assigned_staff_id: assignedStaffId || null, updated_at: new Date().toISOString() })
      .eq('id', client.id).select().single();
    if (updErr) { setError(updErr.message); return null; }
    setClient(data);
    return data;
  }, [client]);

  const updateNextProgramDue = useCallback(async (dateStr) => {
    if (!client) return null;
    const { data, error: updErr } = await supabase
      .from('clients').update({ next_program_due: dateStr || null, updated_at: new Date().toISOString() })
      .eq('id', client.id).select().single();
    if (updErr) { setError(updErr.message); return null; }
    setClient(data);
    return data;
  }, [client]);

  const addNote = useCallback(async (staffId, note) => {
    if (!client || !note.trim()) return null;
    const { data, error: insErr } = await supabase
      .from('client_notes').insert({ client_id: client.id, staff_id: staffId, note: note.trim() })
      .select().single();
    if (insErr) { setError(insErr.message); return null; }
    setNotes((prev) => [data, ...prev]);
    return data;
  }, [client]);

  const deleteNote = useCallback(async (noteId) => {
    const { error: delErr } = await supabase.from('client_notes').delete().eq('id', noteId);
    if (delErr) { setError(delErr.message); return false; }
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    return true;
  }, []);

  return { client, visits, notes, contactLogs, linkedTasks, loading, error, updateCaseload, updateNextProgramDue, addNote, deleteNote, reload: load };
}
