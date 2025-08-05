// src/App.tsx
import { Routes, Route } from "react-router-dom";
import DealTestPage from "./deal-test";
import KanbanBoard from "./KanbanBoard";
import Navbar from "./components/Navbar";

function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/master-pipeline" element={<KanbanBoard />} />
        <Route path="/deal-test" element={<DealTestPage />} />
      </Routes>
    </>
  );
}

export default App;
