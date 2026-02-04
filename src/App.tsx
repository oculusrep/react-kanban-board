import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import CoachRoute from "./components/CoachRoute";
import GmailRoute from "./components/GmailRoute";
import PortalRoute from "./components/PortalRoute";
import CoachNavbar from "./components/CoachNavbar";
import PortalLayout from "./components/portal/PortalLayout";
import PortalMapPage from "./pages/portal/PortalMapPage";
import PortalPipelinePage from "./pages/portal/PortalPipelinePage";
import PortalLoginPage from "./pages/portal/PortalLoginPage";
import PortalInviteAcceptPage from "./pages/portal/PortalInviteAcceptPage";
import PortalForgotPasswordPage from "./pages/portal/PortalForgotPasswordPage";
import PortalResetPasswordPage from "./pages/portal/PortalResetPasswordPage";
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
import RobReport2025Page from "./pages/RobReport2025Page";
import CoachDashboardPage from "./pages/CoachDashboardPage";
import GoalManagementPage from "./pages/GoalManagementPage";
import GoalDashboardPage from "./pages/GoalDashboardPage";
import CashflowDashboardPage from "./pages/CashflowDashboardPage";
import ProspectingDashboardPage from "./pages/ProspectingDashboardPage";
import QuickBooksAdminPage from "./pages/QuickBooksAdminPage";
import QuickBooksCustomerMappingPage from "./pages/QuickBooksCustomerMappingPage";
import GmailSettingsPage from "./pages/GmailSettingsPage";
import SuggestedContactsPage from "./pages/SuggestedContactsPage";
import AgentRulesPage from "./pages/AgentRulesPage";
import EmailClassificationReviewPage from "./pages/EmailClassificationReviewPage";
import FlaggedEmailQueuePage from "./pages/FlaggedEmailQueuePage";
import HunterDashboardPage from "./pages/HunterDashboardPage";
import HunterLeadDetailsPage from "./pages/HunterLeadDetailsPage";
import BudgetDashboardPage from "./pages/BudgetDashboardPage";
import PortalUserManagementPage from "./pages/PortalUserManagementPage";
import PortalEmailSettingsPage from "./pages/PortalEmailSettingsPage";
import LayerManagementPage from "./pages/LayerManagementPage";
import ArtyDrawReportPage from "./pages/ArtyDrawReportPage";
import MikeIsOwedReportPage from "./pages/MikeIsOwedReportPage";
import UnpaidReferralFeesReportPage from "./pages/UnpaidReferralFeesReportPage";
import TypographyTestPage from "./pages/TypographyTestPage";

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

        {/* Portal Authentication Routes (public - before login) */}
        <Route path="/portal/login" element={<PortalLoginPage />} />
        <Route path="/portal/invite" element={<PortalInviteAcceptPage />} />
        <Route path="/portal/forgot-password" element={<PortalForgotPasswordPage />} />
        <Route path="/portal/reset-password" element={<PortalResetPasswordPage />} />

        {/* Client Portal Routes - protected layout */}
        <Route path="/portal" element={<PortalRoute><PortalLayout /></PortalRoute>}>
          <Route index element={<Navigate to="/portal/map" replace />} />
          <Route path="map" element={<PortalMapPage />} />
          <Route path="pipeline" element={<PortalPipelinePage />} />
        </Route>

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
          <Route path="reports/rob-report-2025" element={<CoachRoute><RobReport2025Page /></CoachRoute>} />
          <Route path="reports/goals" element={<AdminRoute><GoalManagementPage /></AdminRoute>} />
          <Route path="reports/goal-dashboard" element={<CoachRoute><GoalDashboardPage /></CoachRoute>} />
          <Route path="reports/cashflow-dashboard" element={<CoachRoute><CashflowDashboardPage /></CoachRoute>} />
          <Route path="reports/arty-draw" element={<CoachRoute><ArtyDrawReportPage /></CoachRoute>} />
          <Route path="reports/mike-is-owed" element={<CoachRoute><MikeIsOwedReportPage /></CoachRoute>} />
          <Route path="reports/unpaid-referral-fees" element={<CoachRoute><UnpaidReferralFeesReportPage /></CoachRoute>} />
          <Route path="prospecting" element={<AdminRoute><ProspectingDashboardPage /></AdminRoute>} />
          <Route path="kpi-dashboard" element={<CoachRoute><KPIDashboardPage /></CoachRoute>} />
          <Route path="admin/users" element={<AdminRoute><UserManagementPage /></AdminRoute>} />
          <Route path="admin/quickbooks" element={<AdminRoute><QuickBooksAdminPage /></AdminRoute>} />
          <Route path="admin/quickbooks/customers" element={<AdminRoute><QuickBooksCustomerMappingPage /></AdminRoute>} />
          <Route path="admin/budget" element={<AdminRoute><BudgetDashboardPage /></AdminRoute>} />
          <Route path="admin/portal-users" element={<AdminRoute><PortalUserManagementPage /></AdminRoute>} />
          <Route path="admin/portal-email-settings" element={<AdminRoute><PortalEmailSettingsPage /></AdminRoute>} />
          <Route path="admin/layers" element={<AdminRoute><LayerManagementPage /></AdminRoute>} />
          <Route path="admin/gmail" element={<GmailRoute><GmailSettingsPage /></GmailRoute>} />
          <Route path="admin/agent-rules" element={<GmailRoute><AgentRulesPage /></GmailRoute>} />
          <Route path="admin/email-review" element={<GmailRoute><EmailClassificationReviewPage /></GmailRoute>} />
          <Route path="admin/flagged-emails" element={<GmailRoute><FlaggedEmailQueuePage /></GmailRoute>} />
          <Route path="contacts/suggested" element={<SuggestedContactsPage />} />
          <Route path="hunter" element={<AdminRoute><HunterDashboardPage /></AdminRoute>} />
          <Route path="hunter/lead/:leadId" element={<AdminRoute><HunterLeadDetailsPage /></AdminRoute>} />
          <Route path="typography-test" element={<TypographyTestPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;

