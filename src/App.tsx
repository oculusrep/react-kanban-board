// src/App.tsx
import { Routes, Route } from "react-router-dom";
import DealTestPage from "./deal-test";
import KanbanBoard from "./KanbanBoard";

function App() {
  return (
    <Routes>
      <Route path="/" element={<div className="p-4 text-xl">Root is working</div>} />
      <Route path="/master-pipeline" element={<KanbanBoard />} />
      <Route path="/deal-test" element={<DealTestPage />} />
    </Routes>

  );
}

export default App;
