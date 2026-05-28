/**
 * Returns two payment datasets:
 *   failedPayments   – declined/failed transactions from the last 30 days
 *   onAccount        – clients who have an outstanding account balance
 *
 * Mindbody API endpoints used:
 *   GET /sale/payments          – transaction ledger (filter by status)
 *   GET /sale/accountbalances   – client account balances
 *
 * NOTE: /sale/accountbalances may require the "Payments" API add-on in your
 * Mindbody subscription. If unavailable this section gracefully returns empty.
 */
import { getStaffToken, mbGet, ok, err, CORS } from './utils/mb-auth.js';
import { subDays, format, parseISO } from 'date-fns';

const FAILED_STATUSES = new Set(['Declined', 'Failed', 'Error', 'Voided']);

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getStaffToken();
    const now = new Date();
    const startStr = format(subDays(now, 30), "yyyy-MM-dd'T'00:00:00");
    const endStr   = format(now,             "yyyy-MM-dd'T'23:59:59");

    // ── Failed / declined payments ──────────────────────────────────────────
    let allPayments = [];
    let offset = 0;
    while (true) {
      const data = await mbGet('/sale/payments', token, {
        StartDateTime: startStr,
        EndDateTime: endStr,
        Limit: 200,
        Offset: offset,
      });
      const payments = data.Payments || [];
      allPayments = allPayments.concat(payments);
      if (payments.length < 200 || offset >= 1800) break;
      offset += 200;
    }

    const failedPayments = allPayments
      .filter((p) => FAILED_STATUSES.has(p.Status))
      .map((p) => ({
        id: p.Id,
        clientId: p.ClientId,
        clientName: p.ClientName || `Client ${p.ClientId}`,
        amount: p.Amount || 0,
        date: p.LastModifiedDateTime
          ? format(parseISO(p.LastModifiedDateTime), 'dd MMM yyyy')
          : '–',
        description: p.Description || p.SaleId || '–',
        status: p.Status,
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // ── On-account balances ─────────────────────────────────────────────────
    let onAccount = [];
    try {
      let abOffset = 0;
      let allBalances = [];
      while (true) {
        const data = await mbGet('/sale/accountbalances', token, {
          Limit: 200,
          Offset: abOffset,
        });
        const balances = data.ClientAccountBalances || data.Balances || [];
        allBalances = allBalances.concat(balances);
        if (balances.length < 200 || abOffset >= 1800) break;
        abOffset += 200;
      }

      onAccount = allBalances
        .filter((b) => (b.AccountBalance || b.Balance || 0) > 0)
        .map((b) => ({
          clientId: b.ClientId,
          clientName:
            b.ClientName ||
            [b.Client?.FirstName, b.Client?.LastName].filter(Boolean).join(' ') ||
            `Client ${b.ClientId}`,
          balance: b.AccountBalance || b.Balance || 0,
          email: b.Client?.Email || '',
          phone: b.Client?.MobilePhone || b.Client?.HomePhone || '',
        }))
        .sort((a, b) => b.balance - a.balance);
    } catch (balanceErr) {
      // Account balances endpoint may not be available on all subscription tiers
      console.warn('Account balances unavailable:', balanceErr.message);
    }

    const totalFailed = failedPayments.reduce((s, p) => s + p.amount, 0);
    const totalOnAccount = onAccount.reduce((s, b) => s + b.balance, 0);

    return ok({
      failedPayments: failedPayments.slice(0, 100),
      onAccount: onAccount.slice(0, 100),
      summary: {
        failedCount: failedPayments.length,
        totalFailedAmount: totalFailed,
        onAccountCount: onAccount.length,
        totalOnAccountAmount: totalOnAccount,
      },
    });
  } catch (e) {
    console.error('mb-payments:', e);
    return err(e.message);
  }
};
