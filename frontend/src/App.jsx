import React from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppShell from './components/AppShell';
import PortalShell from './components/PortalShell';
import LoginPage from './pages/auth/LoginPage';
import ChangePasswordPage from './pages/auth/ChangePasswordPage';
import LendingLayout from './pages/lending/LendingLayout';
import LendingDashboardPage from './pages/lending/LendingDashboardPage';
import BorrowersPage from './pages/lending/BorrowersPage';
import BorrowerDetailPage from './pages/lending/BorrowerDetailPage';
import ReportsPage from './pages/lending/ReportsPage';
import CalendarPage from './pages/CalendarPage';
import OverviewPage from './pages/overview/OverviewPage';
import CategorySettingsPage from './pages/category/CategorySettingsPage';
import ManagePlacesPage from './pages/category/ManagePlacesPage';
import CategoryPlaceholderPage from './pages/category/CategoryPlaceholderPage';
import { EmptyState } from './components/ui';

const Placeholder = ({ title }) => (
  <div>
    <h1 className="mb-4 text-2xl font-black">{title}</h1>
    <EmptyState title="Coming soon">This screen is built in a later step.</EmptyState>
  </div>
);

const BorrowerRedirect = () => <Navigate to={`/lending/borrowers/${useParams().id}`} replace />;

// Gate: unauthenticated -> /login; flagged -> /change-password; PAYER vs owner split.
function Gate({ portal }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center font-bold text-muted">Loading…</div>;
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  const isPayer = user.role === 'PAYER';
  if (!!portal !== isPayer) return <Navigate to={isPayer ? '/portal' : '/'} replace />;
  return portal ? <PortalShell /> : <AppShell />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route path="/portal" element={<Gate portal />}>
        <Route index element={<Placeholder title="My account" />} />
      </Route>
      <Route element={<Gate />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/lending" element={<LendingLayout />}>
          <Route index element={<LendingDashboardPage />} />
          <Route path="borrowers" element={<BorrowersPage />} />
          <Route path="borrowers/:id" element={<BorrowerDetailPage />} />
          <Route path="reports" element={<ReportsPage />} />
        </Route>
        <Route path="/borrowers" element={<Navigate to="/lending/borrowers" replace />} />
        <Route path="/borrowers/:id" element={<BorrowerRedirect />} />
        <Route path="/reports" element={<Navigate to="/lending/reports" replace />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/c/:categoryId" element={<CategoryPlaceholderPage />} />
        <Route path="/c/:categoryId/manage" element={<ManagePlacesPage />} />
        <Route path="/c/:categoryId/settings" element={<CategorySettingsPage />} />
        <Route path="/payers" element={<Placeholder title="Payers" />} />
        <Route path="/settings" element={<Placeholder title="Settings" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
