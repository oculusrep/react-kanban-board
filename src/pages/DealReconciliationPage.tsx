import React, { useEffect } from 'react';
import DealReconciliationReport from '../components/reports/DealReconciliationReport';

export default function DealReconciliationPage() {
  // Set page title
  useEffect(() => {
    document.title = "Deal Reconciliation | OVIS";
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <DealReconciliationReport />
    </div>
  );
}
