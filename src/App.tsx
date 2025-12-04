import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import CoachRoute from "./components/CoachRoute";
import CoachNavbar from "./components/CoachNavbar";
import KanbanBoard from "./components/KanbanBoard";
import DealDetailsPage from "./pages/DealDetailsPage";
import PropertyDetailsPage from "./pages/PropertyDetailsPage";
import ContactDetailsPage from "./pages/ContactDetailsPage";
import ClientDetailsPage from "./pages/ClientDetailsPage";
import SiteSubmitDetailsPage from "./pages/SiteSubmitDetailsPage";
import AssignmentDetailsPage from "./pages/AssignmentDetailsPage";
import NewPropertyPage from "./components/property/NewPropertyPage";
import Navbar from "./components/Navbar";
import SearchTestPage from "./components/SearchTestPage";
import SearchDebugPage from "./components/SearchDebugPage";
import NotesDebugPage from "./pages/NotesDebugPage";
import MappingPage from "./pages/MappingPage";
import MappingPageNew from "./pages/MappingPageNew";
import ReportsPage from "./pages/ReportsPage";
import DealReconciliationPage from "./pages/DealReconciliationPage";
import PaymentReconciliationPage from "./pages/PaymentReconciliationPage";
import DealCompareReportPage from "./pages/DealCompareReportPage";
import DealCompareToSalesforceReportPage from "./pages/DealCompareToSalesforceReportPage";
import PropertyDataQualityReportPage from "./pages/PropertyDataQualityReportPage";
import AssignmentsReportPage from "./pages/AssignmentsReportPage";
import SiteSubmitDashboardPage from "./pages/SiteSubmitDashboardPage";
import DropboxSyncAdminPage from "./pages/DropboxSyncAdminPage";
import TaskDashboardPage from "./pages/TaskDashboardPage";
import PaymentDashboardPage from "./pages/PaymentDashboardPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import UserManagementPage from "./pages/UserManagementPage";
import KPIDashboardPage from "./pages/KPIDashboardPage";
import RobReportPage from "./pages/RobReportPage";
import CoachDashboardPage from "./pages/CoachDashboardPage";
import GoalManagementPage from "./pages/GoalManagementPage";
import ProspectingDashboardPage from "./pages/ProspectingDashboardPage";

function ProtectedLayout() {
  const location = useLocation();
  const { userRole } = useAuth();
  const searchParams = new URLSearchParams(location.search);
  const isEmbedded = searchParams.get('embedded') === 'true';

  // Coach users get a simplified navbar
  const NavbarComponent = userRole === 'coach' ? CoachNavbar : Navbar;

  return (
    <ProtectedRoute>
      {!isEmbedded && <NavbarComponent />}
    </ProtectedRoute>
  );
}

// Smart redirect based on user role
function RoleBasedRedirect() {
  const { userRole } = useAuth();

  // Coach users go to coach dashboard
  if (userRole === 'coach') {
    return <Navigate to="/coach-dashboard" replace />;
  }

  // All other users go to master pipeline
  return <Navigate to="/master-pipeline" replace />;
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public route for password reset */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* All other routes are protected */}
        <Route path="/" element={<ProtectedLayout />}>
          <Route index element={<RoleBasedRedirect />} />
          {/* Coach-only route */}
          <Route path="coach-dashboard" element={<CoachDashboardPage />} />
          {/* All routes below are blocked for coach users */}
          <Route path="master-pipeline" element={<CoachRoute><KanbanBoard /></CoachRoute>} />
          <Route path="tasks" element={<CoachRoute><TaskDashboardPage /></CoachRoute>} />
          <Route path="payments" element={<AdminRoute><PaymentDashboardPage /></AdminRoute>} />
          <Route path="deal/new" element={<CoachRoute><DealDetailsPage /></CoachRoute>} />
          <Route path="deal/:dealId" element={<CoachRoute><DealDetailsPage /></CoachRoute>} />
          <Route path="assignment/new" element={<CoachRoute><AssignmentDetailsPage /></CoachRoute>} />
          <Route path="assignment/:assignmentId" element={<CoachRoute><AssignmentDetailsPage /></CoachRoute>} />
          <Route path="property/new" element={<CoachRoute><NewPropertyPage /></CoachRoute>} />
          <Route path="property/:propertyId" element={<CoachRoute><PropertyDetailsPage /></CoachRoute>} />
          <Route path="contact/:contactId" element={<CoachRoute><ContactDetailsPage /></CoachRoute>} />
          <Route path="client/:clientId" element={<CoachRoute><ClientDetailsPage /></CoachRoute>} />
          <Route path="site-submit/:siteSubmitId" element={<CoachRoute><SiteSubmitDetailsPage /></CoachRoute>} />
          <Route path="search-test" element={<CoachRoute><SearchTestPage /></CoachRoute>} />
          <Route path="search-debug" element={<CoachRoute><SearchDebugPage /></CoachRoute>} />
          <Route path="notes-debug" element={<CoachRoute><NotesDebugPage /></CoachRoute>} />
          <Route path="mapping" element={<CoachRoute><MappingPageNew /></CoachRoute>} />
          <Route path="mapping-old" element={<CoachRoute><MappingPage /></CoachRoute>} />
          <Route path="reports" element={<CoachRoute><ReportsPage /></CoachRoute>} />
          <Route path="reports/deal-reconciliation" element={<CoachRoute><DealReconciliationPage /></CoachRoute>} />
          <Route path="reports/payment-reconciliation" element={<CoachRoute><PaymentReconciliationPage /></CoachRoute>} />
          <Route path="reports/deal-compare" element={<CoachRoute><DealCompareReportPage /></CoachRoute>} />
          <Route path="reports/deal-compare-salesforce" element={<CoachRoute><DealCompareToSalesforceReportPage /></CoachRoute>} />
          <Route path="reports/property-data-quality" element={<CoachRoute><PropertyDataQualityReportPage /></CoachRoute>} />
          <Route path="reports/assignments" element={<CoachRoute><AssignmentsReportPage /></CoachRoute>} />
          <Route path="reports/site-submit-dashboard" element={<CoachRoute><SiteSubmitDashboardPage /></CoachRoute>} />
          <Route path="reports/dropbox-sync-admin" element={<AdminRoute><DropboxSyncAdminPage /></AdminRoute>} />
          <Route path="reports/rob-report" element={<CoachRoute><RobReportPage /></CoachRoute>} />
          <Route path="reports/goals" element={<AdminRoute><GoalManagementPage /></AdminRoute>} />
          <Route path="prospecting" element={<AdminRoute><ProspectingDashboardPage /></AdminRoute>} />
          <Route path="kpi-dashboard" element={<CoachRoute><KPIDashboardPage /></CoachRoute>} />
          <Route path="admin/users" element={<AdminRoute><UserManagementPage /></AdminRoute>} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;

