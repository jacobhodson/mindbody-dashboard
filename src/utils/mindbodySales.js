import { useState, useCallback } from 'react';
import { ghlApi } from './useAcquisition.js';
import { notifyMetricActualsChanged } from './metricActuals.js';

// Sales made directly through Mindbody — each adds to Scoreboard Sales
// alongside GHL wins (syncSales() in netlify/functions/utils/metric-sync.js).
export async function addMindbodySale(mbClientId, saleDate) {
  await ghlApi('ghl-lead', { body: { action: 'mindbody-sale', mbClientId, saleDate } });
  notifyMetricActualsChanged();
}

export async function removeMindbodySale(id) {
  await ghlApi('ghl-lead', { body: { action: 'remove-mindbody-sale', id } });
  notifyMetricActualsChanged();
}

/**
 * For the Home allocation panels: each row's "Count as sale" tick, on until
 * someone unticks it. The sale is written before the caseload, because the
 * row disappears once allocated — a failure here leaves it there to retry,
 * and retrying can't count the client twice.
 */
export function useSaleOnAllocate() {
  const [unticked, setUnticked] = useState({});
  const [error, setError] = useState(null);

  const countsAsSale = useCallback((id) => !unticked[id], [unticked]);
  const toggle = useCallback((id) => setUnticked((u) => ({ ...u, [id]: !u[id] })), []);

  const allocateWithSale = useCallback(async (client, allocate) => {
    setError(null);
    if (!unticked[client.id]) {
      try { await addMindbodySale(client.mindbody_id); }
      catch (e) { setError(`Couldn't count the sale, so nothing was saved: ${e.message}`); return; }
    }
    await allocate();
  }, [unticked]);

  return { countsAsSale, toggle, allocateWithSale, error };
}
