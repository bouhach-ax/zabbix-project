import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  tenantId: string
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  isAuthenticated: boolean
  setTokens: (accessToken: string, refreshToken: string) => void
  setUser: (user: User) => void
  login: (accessToken: string, refreshToken: string, user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      setTokens: (accessToken: string, refreshToken: string) =>
        set({ accessToken, refreshToken, isAuthenticated: true }),

      setUser: (user: User) => set({ user }),

      login: (accessToken: string, refreshToken: string, user: User) =>
        set({ accessToken, refreshToken, user, isAuthenticated: true }),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'zabbixpilot-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.accessToken !== null,
      }),
    },
  ),
)
