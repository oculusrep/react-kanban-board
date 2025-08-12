import { Routes, Route, Navigate } from "react-router-dom";
import KanbanBoard from "./components/KanbanBoard";
import DealDetailsPage from "./pages/DealDetailsPage";
import Navbar from "./components/Navbar";

function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <Routes>
        <Route path="/" element={<Navigate to="/master-pipeline" replace />} />
        <Route path="/master-pipeline" element={<KanbanBoard />} />
        <Route path="/deal/:dealId" element={<DealDetailsPage />} />
      </Routes>
    </div>
  );
}

export default App;

