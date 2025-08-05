// src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import KanbanBoard from "./KanbanBoard";
import DealDetailsPage from "./pages/DealDetailsPage";

function App() {
  return (
    <Routes>
      {/* Redirect root to Master Pipeline */}
      <Route path="/" element={<Navigate to="/master-pipeline" replace />} />

      {/* Master Pipeline Kanban Board */}
      <Route path="/master-pipeline" element={<KanbanBoard />} />

      {/* Deal Details Page */}
      <Route path="/deal/:dealId" element={<DealDetailsPage />} />
    </Routes>
  );
}

export default App;
