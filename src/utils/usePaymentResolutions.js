/**
 * usePaymentResolutions — tracks which Failed Payments / On Account issues
 * have been marked "reprocessed" or "reconciled".
 *
 * Persists via Supabase (`payment_resolutions`), replacing the old
 * Notion-backed version (mb-payment-resolutions.js / NOTION_PAYMENT_
 * RESOLUTIONS_DB) — same migration pattern as useContactLog.js.
 *
 * Return shape is unchanged from the Notion version so PaymentIssuesTable.jsx
 * needs no changes: resolved is a { [key]: { status, at } } map.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';

export function usePaymentResolutions() {
  const [resolved, setResolved] = useState({});

  useEffect(() => {
    supabase
      .from('payment_resolutions')
      .select('key, status, resolved_at')
      .then(({ data, error }) => {
        if (error || !data) return;
        const map = {};
        for (const row of data) {
          map[row.key] = { status: row.status, at: row.resolved_at };
        }
        setResolved(map);
      });
  }, []);

  const mark = useCallback((key, status, meta = {}) => {
    const at = new Date().toISOString();

    // Optimistic update
    setResolved(prev => ({ ...prev, [key]: { status, at } }));

    supabase
      .from('payment_resolutions')
      .upsert(
        {
          key,
          status,
          resolved_at: at,
          client_name:  meta.clientName || null,
          amount:       meta.amount ?? null,
          card:         meta.card || null,
          payment_date: meta.date || null,
        },
        { onConflict: 'key' },
      )
      .then(({ error }) => {
        if (error) {
          // Roll back on failure
          setResolved(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
      });
  }, []);

  const unmark = useCallback((key) => {
    // Optimistic update
    setResolved(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    supabase
      .from('payment_resolutions')
      .delete()
      .eq('key', key)
      .then(({ error }) => {
        if (error) {
          // Can't easily roll back without knowing the old value — just refetch
          supabase
            .from('payment_resolutions')
            .select('key, status, resolved_at')
            .then(({ data }) => {
              if (!data) return;
              const map = {};
              for (const row of data) {
                map[row.key] = { status: row.status, at: row.resolved_at };
              }
              setResolved(map);
            });
        }
      });
  }, []);

  return { resolved, mark, unmark };
}
