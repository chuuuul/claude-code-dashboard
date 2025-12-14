import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../services/api';

interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  // Note: refreshToken is now stored in HttpOnly cookie, not in JS
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<boolean>;
  clearError: () => void;
  setAccessToken: (token: string) => void;
}

interface LoginResponse {
  accessToken: string;
  user: User;
}

interface RefreshResponse {
  accessToken: string;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await api.post<LoginResponse>('/api/auth/login', {
            username,
            password
          }, {
            withCredentials: true, // Required for HttpOnly cookies
            disableRetry: true
          });

          // Server now only returns accessToken and user (refreshToken is in HttpOnly cookie)
          const { accessToken, user } = response.data as LoginResponse;
          await api.fetchCsrfToken();

          set({
            user,
            accessToken,
            isAuthenticated: true,
            isLoading: false,
            error: null
          });
        } catch (error: unknown) {
          const message = error instanceof Error
            ? error.message
            : 'Login failed';

          set({
            isLoading: false,
            error: message,
            isAuthenticated: false
          });

          throw error;
        }
      },

      logout: async () => {
        try {
          await api.fetchCsrfToken();
          // Server will read refreshToken from HttpOnly cookie
          await api.post('/api/auth/logout', {}, {
            withCredentials: true
          });
        } catch {
          // Ignore logout errors
        } finally {
          set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            error: null
          });
        }
      },

      refreshTokens: async () => {
        try {
          await api.fetchCsrfToken();
          // Server reads refreshToken from HttpOnly cookie
          const response = await api.post<RefreshResponse>('/api/auth/refresh', {}, {
            withCredentials: true,
            disableRetry: true
          });

          const { accessToken: newAccessToken } = response.data as RefreshResponse;

          set({
            accessToken: newAccessToken,
            isAuthenticated: true
          });

          return true;
        } catch {
          // Refresh failed - logout
          set({
            user: null,
            accessToken: null,
            isAuthenticated: false
          });

          return false;
        }
      },

      clearError: () => {
        set({ error: null });
      },

      setAccessToken: (token: string) => {
        set({ accessToken: token });
      }
    }),
    {
      name: 'auth-storage',
      // Only persist non-sensitive data
      // accessToken is kept in memory only; refreshToken stays in HttpOnly cookie
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);
