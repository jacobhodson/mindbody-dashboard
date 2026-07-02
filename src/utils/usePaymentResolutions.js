import { useState, useCallback } from 'react';

const STORAGE_KEY = 'ns_payment_resolutions';

export function usePaymentResolutions() {
  const [resolved, setResolved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  });

  const mark = useCallback((key, status) => {
    setResolved(prev => {
      const next = { ...prev, [key]: { status, at: new Date().toISOString() } };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const unmark = useCallback((key) => {
    setResolved(prev => {
      const next = { ...prev };
      delete next[key];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { resolved, mark, unmark };
}
