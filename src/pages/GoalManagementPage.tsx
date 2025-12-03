import { useEffect } from 'react';
import GoalDashboard from '../components/reports/GoalDashboard';

export default function GoalManagementPage() {
  useEffect(() => {
    document.title = "Goal Management | OVIS";
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Goal Management</h1>
          <p className="mt-2 text-gray-600">
            Set and track annual GCI and deal count goals
          </p>
        </div>

        <GoalDashboard isAdmin={true} />
      </div>
    </div>
  );
}
