import { Route, Routes } from "react-router-dom";

import { MainLayout } from "./layouts/MainLayout";
import { AdminDashboard } from "./pages/AdminDashboard";
import { MapDashboard } from "./pages/MapDashboard";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MapDashboard />} />
      <Route
        path="/admin"
        element={
          <MainLayout>
            <AdminDashboard />
          </MainLayout>
        }
      />
    </Routes>
  );
}
