import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { FoundationPage } from "../features/foundation/FoundationPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="/transactions" element={<FoundationPage titleKey="nav.transactions" />} />
        <Route path="/accounts" element={<FoundationPage titleKey="nav.accounts" />} />
        <Route path="/budgets" element={<FoundationPage titleKey="nav.budgets" />} />
        <Route path="/goals" element={<FoundationPage titleKey="nav.goals" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
