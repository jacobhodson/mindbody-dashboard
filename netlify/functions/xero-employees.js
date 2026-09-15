/**
 * GET /api/xero-employees
 *
 * Active Xero Payroll employees, for XeroEmployeeMapping.jsx's manager-only
 * picker — Xero employee emails don't reliably match our own staff.email
 * (confirmed live: only 2 of 8 matched), so mapping has to be a manual,
 * one-time pick per staff member rather than an automatic join.
 */
import { getXeroAuth, xeroPayrollGet } from './utils/xero-auth.js';
import { ok, err, CORS } from './utils/mb-auth.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const { accessToken, tenantId } = await getXeroAuth();
    const data = await xeroPayrollGet('/Employees?page=1', accessToken, tenantId);
    const employees = (data.Employees || [])
      .filter((e) => e.Status === 'ACTIVE')
      .map((e) => ({
        id:    e.EmployeeID,
        name:  `${e.FirstName || ''} ${e.LastName || ''}`.replace(/\s+/g, ' ').trim(),
        email: e.Email || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return ok({ employees });
  } catch (e) {
    console.error('xero-employees:', e);
    return err(e.message);
  }
};
