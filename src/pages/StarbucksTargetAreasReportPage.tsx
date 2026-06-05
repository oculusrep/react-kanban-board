import { useEffect } from 'react';
import StarbucksTargetAreasReport from '../components/reports/StarbucksTargetAreasReport';

export default function StarbucksTargetAreasReportPage() {
  useEffect(() => {
    document.title = 'Starbucks GA Target Areas | OVIS';
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" style={{ color: '#002147' }}>Starbucks GA Target Areas</h1>
          <p className="mt-2 text-gray-600">
            Market, Priority, Model Yr1 Sales, and notes — sortable and filterable
          </p>
        </div>

        <StarbucksTargetAreasReport />
      </div>
    </div>
  );
}
