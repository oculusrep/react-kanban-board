import { Navigate } from 'react-router-dom';

export default function CashflowDashboardPage() {
  return <Navigate to="/admin/budget/forecast?tab=splits" replace />;
}
