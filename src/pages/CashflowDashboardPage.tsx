import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';
import CashflowDashboard from '../components/reports/CashflowDashboard';

export default function CashflowDashboardPage() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  useEffect(() => {
    document.title = "Cashflow Dashboard | OVIS";
  }, []);

  // Check permission - reuse goal dashboard permission since it's for coaching
  if (!permissionsLoading && !hasPermission('can_view_goal_dashboard')) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-4">You don't have permission to view this page.</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (permissionsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Cashflow Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Payment projections and cashflow planning by broker
          </p>
        </div>

        <CashflowDashboard />
      </div>
    </div>
  );
}
