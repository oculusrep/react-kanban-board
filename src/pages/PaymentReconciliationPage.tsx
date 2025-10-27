import React, { useEffect } from 'react';
import PaymentReconciliationReport from '../components/payments/PaymentReconciliationReport';

export default function PaymentReconciliationPage() {
  // Set page title
  useEffect(() => {
    document.title = "Payment Reconciliation | OVIS";
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <PaymentReconciliationReport />
    </div>
  );
}
