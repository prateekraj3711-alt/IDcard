import { create } from 'zustand';

export type Role = 'super_admin' | 'teacher';

export interface CurrentUser {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  school?: { id: string; code: string; name: string } | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: CurrentUser | null;
  setTokens: (a: string, r: string) => void;
  setUser: (u: CurrentUser) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  accessToken: sessionStorage.getItem('at'),
  refreshToken: localStorage.getItem('rt'),
  user: null,
  setTokens: (a, r) => {
    sessionStorage.setItem('at', a);
    localStorage.setItem('rt', r);
    set({ accessToken: a, refreshToken: r });
  },
  setUser: (u) => set({ user: u }),
  clear: () => {
    sessionStorage.removeItem('at');
    localStorage.removeItem('rt');
    set({ accessToken: null, refreshToken: null, user: null });
  },
}));
