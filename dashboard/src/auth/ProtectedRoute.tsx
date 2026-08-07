import { ReactNode, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/store';
import { api } from '@/api/client';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { accessToken, user, setUser } = useAuth();
  useEffect(() => {
    if (accessToken && !user) {
      api.get('/auth/me').then((r) => setUser(r.data)).catch(() => useAuth.getState().clear());
    }
  }, [accessToken, user, setUser]);

  if (!accessToken) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
