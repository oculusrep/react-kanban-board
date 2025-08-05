import { Routes, Route, Navigate } from "react-router-dom";
import KanbanBoard from "./KanbanBoard";
import DealDetailsPage from "./pages/DealDetailsPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/master-pipeline" replace />} />
      <Route path="/master-pipeline" element={<KanbanBoard />} />
      <Route path="/deal/:dealId" element={<DealDetailsPage />} />
    </Routes>
  );
}

export default App;
