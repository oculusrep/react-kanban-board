import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
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
import DealCompareReportPage from "./pages/DealCompareReportPage";
import DealCompareToSalesforceReportPage from "./pages/DealCompareToSalesforceReportPage";
import PropertyDataQualityReportPage from "./pages/PropertyDataQualityReportPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public route for password reset */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* All other routes are protected */}
        <Route path="/" element={
          <ProtectedRoute>
            <Navbar />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/master-pipeline" replace />} />
          <Route path="master-pipeline" element={<KanbanBoard />} />
          <Route path="deal/new" element={<DealDetailsPage />} />
          <Route path="deal/:dealId" element={<DealDetailsPage />} />
          <Route path="assignment/new" element={<AssignmentDetailsPage />} />
          <Route path="assignment/:assignmentId" element={<AssignmentDetailsPage />} />
          <Route path="property/new" element={<NewPropertyPage />} />
          <Route path="property/:propertyId" element={<PropertyDetailsPage />} />
          <Route path="contact/new" element={<ContactDetailsPage />} />
          <Route path="contact/:contactId" element={<ContactDetailsPage />} />
          <Route path="client/new" element={<ClientDetailsPage />} />
          <Route path="client/:clientId" element={<ClientDetailsPage />} />
          <Route path="site-submit/:siteSubmitId" element={<SiteSubmitDetailsPage />} />
          <Route path="search-test" element={<SearchTestPage />} />
          <Route path="search-debug" element={<SearchDebugPage />} />
          <Route path="notes-debug" element={<NotesDebugPage />} />
          <Route path="mapping" element={<MappingPageNew />} />
          <Route path="mapping-old" element={<MappingPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/deal-compare" element={<DealCompareReportPage />} />
          <Route path="reports/deal-compare-salesforce" element={<DealCompareToSalesforceReportPage />} />
          <Route path="reports/property-data-quality" element={<PropertyDataQualityReportPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;

