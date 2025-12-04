import { useEffect } from 'react';
import ProspectingDashboard from '../components/reports/ProspectingDashboard';

export default function ProspectingDashboardPage() {
  useEffect(() => {
    document.title = "Prospecting Dashboard | OVIS";
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Prospecting Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Track business development activities and prospecting efforts
          </p>
        </div>

        <ProspectingDashboard />
      </div>
    </div>
  );
}
