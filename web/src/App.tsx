import { Navigate, Route, Routes } from "react-router-dom";
import { getToken } from "./api/client";
import AppShell from "./components/AppShell";
import ClientDetailPage from "./pages/ClientDetailPage";
import ClientsPage from "./pages/ClientsPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import ScanDetailPage from "./pages/ScanDetailPage";

function Private({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <Private>
            <DashboardPage />
          </Private>
        }
      />
      <Route
        path="/clients"
        element={
          <Private>
            <ClientsPage />
          </Private>
        }
      />
      <Route
        path="/clients/:clientId"
        element={
          <Private>
            <ClientDetailPage />
          </Private>
        }
      />
      <Route
        path="/scans/:scanId"
        element={
          <Private>
            <ScanDetailPage />
          </Private>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
