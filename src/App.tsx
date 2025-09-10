import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import KanbanBoard from "./components/KanbanBoard";
import DealDetailsPage from "./pages/DealDetailsPage";
import PropertyDetailsPage from "./pages/PropertyDetailsPage";
import ContactDetailsPage from "./pages/ContactDetailsPage";
import SiteSubmitDetailsPage from "./pages/SiteSubmitDetailsPage";
import NewPropertyPage from "./components/property/NewPropertyPage";
import Navbar from "./components/Navbar";
import SearchTestPage from "./components/SearchTestPage";
import SearchDebugPage from "./components/SearchDebugPage";

function App() {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-100">
          <Navbar />
          <Routes>
            <Route path="/" element={<Navigate to="/master-pipeline" replace />} />
            <Route path="/master-pipeline" element={<KanbanBoard />} />
            <Route path="/deal/new" element={<DealDetailsPage />} />
            <Route path="/deal/:dealId" element={<DealDetailsPage />} />
            <Route path="/property/new" element={<NewPropertyPage />} />
            <Route path="/property/:propertyId" element={<PropertyDetailsPage />} />
            <Route path="/contact/:contactId" element={<ContactDetailsPage />} />
            <Route path="/site-submit/:siteSubmitId" element={<SiteSubmitDetailsPage />} />
            <Route path="/search-test" element={<SearchTestPage />} />
            <Route path="/search-debug" element={<SearchDebugPage />} />
          </Routes>
        </div>
      </ProtectedRoute>
    </AuthProvider>
  );
}

export default App;

