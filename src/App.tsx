import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
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
import TaskDashboardPage from "./pages/TaskDashboardPage";
import PaymentDashboardPage from "./pages/PaymentDashboardPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

function ProtectedLayout() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isEmbedded = searchParams.get('embedded') === 'true';

  return (
    <ProtectedRoute>
      {!isEmbedded && <Navbar />}
    </ProtectedRoute>
  );
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public route for password reset */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* All other routes are protected */}
        <Route path="/" element={<ProtectedLayout />}>
          <Route index element={<Navigate to="/master-pipeline" replace />} />
          <Route path="master-pipeline" element={<KanbanBoard />} />
          <Route path="tasks" element={<TaskDashboardPage />} />
          <Route path="payments" element={<AdminRoute><PaymentDashboardPage /></AdminRoute>} />
          <Route path="deal/new" element={<DealDetailsPage />} />
          <Route path="deal/:dealId" element={<DealDetailsPage />} />
          <Route path="assignment/new" element={<AssignmentDetailsPage />} />
          <Route path="assignment/:assignmentId" element={<AssignmentDetailsPage />} />
          <Route path="property/new" element={<NewPropertyPage />} />
          <Route path="property/:propertyId" element={<PropertyDetailsPage />} />
          <Route path="contact/:contactId" element={<ContactDetailsPage />} />
          <Route path="client/:clientId" element={<ClientDetailsPage />} />
          <Route path="site-submit/:siteSubmitId" element={<SiteSubmitDetailsPage />} />
          <Route path="search-test" element={<SearchTestPage />} />
          <Route path="search-debug" element={<SearchDebugPage />} />
          <Route path="notes-debug" element={<NotesDebugPage />} />
          <Route path="mapping" element={<MappingPageNew />} />
          <Route path="mapping-old" element={<MappingPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/deal-reconciliation" element={<DealReconciliationPage />} />
          <Route path="reports/payment-reconciliation" element={<PaymentReconciliationPage />} />
          <Route path="reports/deal-compare" element={<DealCompareReportPage />} />
          <Route path="reports/deal-compare-salesforce" element={<DealCompareToSalesforceReportPage />} />
          <Route path="reports/property-data-quality" element={<PropertyDataQualityReportPage />} />
          <Route path="reports/assignments" element={<AssignmentsReportPage />} />
          <Route path="reports/site-submit-dashboard" element={<SiteSubmitDashboardPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;

