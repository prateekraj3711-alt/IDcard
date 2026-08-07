import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { SchoolsPage } from '@/pages/SchoolsPage';
import { TeachersPage } from '@/pages/TeachersPage';
import { StudentsPage } from '@/pages/StudentsPage';
import { StudentProfilePage } from '@/pages/StudentProfilePage';
import { IdCardsPage } from '@/pages/IdCardsPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/schools" element={<SchoolsPage />} />
        <Route path="/teachers" element={<TeachersPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/students/:id" element={<StudentProfilePage />} />
        <Route path="/id-cards" element={<IdCardsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
