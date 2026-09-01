import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const BUSINESS_NAME = import.meta.env.VITE_BUSINESS_NAME || 'Your Gym';

function substitute(text) {
  return text ? text.replaceAll('{{BUSINESS_NAME}}', BUSINESS_NAME) : text;
}

/**
 * Replaces the static TASKS_BY_WEEK import from onboardingTasks.js — same
 * task shape (id/week/label/description/script), now sourced from
 * onboarding_task_templates. `id` is mapped from the row's `key` so
 * OnboardingCard/useOnboardingTasks (which key off `task.id`) don't need to
 * change how they reference a task.
 */
export function useOnboardingTaskTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('onboarding_task_templates').select('*').eq('active', true).order('sort_order');
    if (err) {
      setError(err.message);
    } else {
      setTemplates((data || []).map((t) => ({
        ...t,
        id:          t.key, // keep the same `id` shape older code expects (e.g. 'w1-pre-session')
        dbId:        t.id,  // the real uuid PK — needed for onboarding_task_completions.template_id
        label:       substitute(t.label),
        description: substitute(t.description),
        script:      substitute(t.script),
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const tasksByWeek = templates.reduce((acc, t) => {
    if (!acc[t.week]) acc[t.week] = [];
    acc[t.week].push(t);
    return acc;
  }, {});

  return { templates, tasksByWeek, loading, error, reload: load };
}
