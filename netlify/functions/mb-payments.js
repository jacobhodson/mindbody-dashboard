/**
 * Returns failed/declined transactions and on-account sales.
 *
 * Mindbody endpoints on this account:
 *   GET /sale/transactions  → transaction ledger with Status field  ✓
 *   GET /sale/sales         → sales with payment method/type        ✓
 *   GET /sale/accountbalances → 404 (not on this plan)              ✗
 *
 * Failed payments  = /sale/transactions where status contains Declined/Failed/etc.
 * On account       = /sale/sales where any payment Type contains "Account"
 */
import { getStaffToken, mbGet, ok, err, CORS } from './utils/mb-auth.js';
import { subDays, format, parseISO } from 'date-fns';

const FAILED_KEYWORDS = ['declined', 'failed', 'error', 'chargeback', 'disputed', 'returned', 'void'];

function isFailed(status) {
  return FAILED_KEYWORDS.some((k) => (status || '').toLowerCase().includes(k));
}

function isOnAccount(payments = []) {
  return payments.some((p) => (p.Type || '').toLowerCase().includes('account'));
}

async function getClientsByIds(token, ids) {
  if (!ids.length) return {};
  try {
    const clientMap = {};
    const chunks = [];
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
    for (const chunk of chunks) {
      const data = await mbGet('/site/clients', token, { clientIds: chunk.join(','), Limit: 200 });
      for (const c of (data.Clients || [])) {
        clientMap[String(c.Id)] = {
          name: `${c.FirstName || ''} ${c.LastName || ''}`.trim(),
          email: c.Email || '',
          phone: c.MobilePhone || c.HomePhone || '',
        };
      }
    }
    return clientMap;
  } catch {
    return {};
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const token = await getStaffToken();
    const now = new Date();
    const start = format(subDays(now, 30), "yyyy-MM-dd'T'00:00:00");
    const end   = format(now,             "yyyy-MM-dd'T'23:59:59");

    // ── Failed / declined transactions ──────────────────────────────────────
    let allTransactions = [];
    let offset = 0;
    while (true) {
      const data = await mbGet('/sale/transactions', token, {
        TransactionStartDateTime: start,
        TransactionEndDateTime: end,
        Limit: 200,
        Offset: offset,
      });
      const txns = data.Transactions || [];
      allTransactions = allTransactions.concat(txns);
      if (txns.length < 200 || offset >= 1800) break;
      offset += 200;
    }

    const failedTxns = allTransactions.filter((t) => isFailed(t.Status));

    // ── On-account sales ────────────────────────────────────────────────────
    let allSales = [];
    offset = 0;
    while (true) {
      const data = await mbGet('/sale/sales', token, {
        StartSaleDateTime: start,
        EndSaleDateTime: end,
        Limit: 200,
        Offset: offset,
      });
      const sales = data.Sales || [];
      allSales = allSales.concat(sales);
      if (sales.length < 200 || offset >= 1800) break;
      offset += 200;
    }

    const onAccountSales = allSales.filter((s) => isOnAccount(s.Payments || []));

    // ── Fetch client names ──────────────────────────────────────────────────
    const clientIds = [
      ...new Set([
        ...failedTxns.map((t) => String(t.ClientId)),
        ...onAccountSales.map((s) => String(s.ClientId)),
      ]),
    ].filter(Boolean);

    const clientMap = await getClientsByIds(token, clientIds);
    function clientName(id) {
      return clientMap[String(id)]?.name || `Client ${id}`;
    }

    // ── Format responses ────────────────────────────────────────────────────
    const failedPayments = failedTxns
      .map((t) => ({
        id: t.TransactionId,
        clientId: String(t.ClientId),
        clientName: clientName(t.ClientId),
        amount: t.Amount || 0,
        date: t.TransactionTime
          ? format(parseISO(t.TransactionTime), 'dd MMM yyyy')
          : '–',
        status: t.Status,
        lastFour: t.CCLastFour || t.ACHLastFour || '',
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const onAccount = onAccountSales
      .map((s) => {
        const acctPayments = (s.Payments || []).filter((p) =>
          (p.Type || '').toLowerCase().includes('account')
        );
        const total = acctPayments.reduce((sum, p) => sum + (p.Amount || 0), 0);
        const items = (s.PurchasedItems || []).map((i) => i.Description).filter(Boolean).join(', ');
        return {
          saleId: s.Id,
          clientId: String(s.ClientId),
          clientName: clientName(s.ClientId),
          balance: total,
          description: items || '–',
          date: s.SaleDate ? format(parseISO(s.SaleDate), 'dd MMM yyyy') : '–',
          email: clientMap[String(s.ClientId)]?.email || '',
          phone: clientMap[String(s.ClientId)]?.phone || '',
        };
      })
      .filter((s) => s.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    const totalFailed    = failedPayments.reduce((s, p) => s + p.amount, 0);
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
