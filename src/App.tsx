import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import KanbanBoard from "./components/KanbanBoard";
import DealDetailsPage from "./pages/DealDetailsPage";
import PropertyDetailsPage from "./pages/PropertyDetailsPage";
import Navbar from "./components/Navbar";

function App() {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-100">
          <Navbar />
          <Routes>
            <Route path="/" element={<Navigate to="/master-pipeline" replace />} />
            <Route path="/master-pipeline" element={<KanbanBoard />} />
            <Route path="/deal/:dealId" element={<DealDetailsPage />} />
            <Route path="/property/create" element={<PropertyDetailsPage />} />
            <Route path="/property/:propertyId" element={<PropertyDetailsPage />} />
          </Routes>
        </div>
      </ProtectedRoute>
    </AuthProvider>
  );
}

export default App;

