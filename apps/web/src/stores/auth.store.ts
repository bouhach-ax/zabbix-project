import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session, User as SupabaseUser } from '@supabase/supabase-js'
import type { Profile } from '@/lib/supabase'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  tenantId: string
}

interface AuthState {
  session: Session | null
  user: User | null
  isAuthenticated: boolean
  setSession: (session: Session | null, profile?: Profile | null) => void
  logout: () => void
}

function mapProfile(supabaseUser: SupabaseUser, profile: Profile | null): User {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? '',
    firstName: profile?.first_name ?? '',
    lastName: profile?.last_name ?? '',
    role: profile?.role ?? 'NOC_OPERATOR',
    tenantId: profile?.tenant_id ?? '',
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      user: null,
      isAuthenticated: false,

      setSession: (session: Session | null, profile?: Profile | null) => {
        if (session?.user) {
          set({
            session,
            user: mapProfile(session.user, profile ?? null),
            isAuthenticated: true,
          })
        } else {
          set({ session: null, user: null, isAuthenticated: false })
        }
      },

      logout: () =>
        set({
          session: null,
          user: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'zabbixpilot-auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)
