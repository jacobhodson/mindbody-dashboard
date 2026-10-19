import XeroConnection     from './XeroConnection.jsx';
import RevenueCards       from './RevenueCards.jsx';
import DeclinedList       from './DeclinedList.jsx';
import PaymentIssuesTable from './PaymentIssuesTable.jsx';
import { usePaymentResolutions } from '../utils/usePaymentResolutions.js';

// Payment resolutions are owned here so marking an issue Reconciled in
// Payment Issues also drops that client off Declined Members straight away.
export default function FinancesTab({ data, loading, errors, isManager }) {
  const resolutions = usePaymentResolutions();

  return (
    <>
      <XeroConnection isManager={isManager} />
      <RevenueCards
        data={data.revenue}
        loading={loading.revenue}
        error={errors.revenue}
      />
      <DeclinedList
        data={data.clientAnalytics}
        loading={loading.clientAnalytics}
        error={errors.clientAnalytics}
        resolved={resolutions.resolved}
      />
      <PaymentIssuesTable
        data={data.payments}
        loading={loading.payments}
        error={errors.payments}
        resolutions={resolutions}
      />
    </>
  );
}
