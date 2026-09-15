import { useState, useEffect } from 'react';

/**
 * Manager-only, so deliberately NOT part of App.jsx's fetch-everything-on-
 * login pipeline (unlike pt/onboarding/etc, which every signed-in user
 * pulls) — only fetches when `enabled` (isManager) is true, so a coach's
 * session never hits this endpoint at all.
 */
export function useGroupPerformance(enabled) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/mb-group-performance')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((json) => { if (!cancelled) setData(json); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled]);

  return { data, loading, error };
}
