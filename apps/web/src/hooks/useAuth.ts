import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'
import type { Profile } from '@/lib/supabase'

interface LoginParams {
  email: string
  password: string
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  return data
}

async function ensureProfile(userId: string, email: string): Promise<Profile | null> {
  let profile = await fetchProfile(userId)

  if (!profile) {
    const { data } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        tenant_id: 'demo-tenant-001',
        email,
        first_name: email.split('@')[0],
        last_name: '',
        role: 'ADMIN',
      })
      .select()
      .maybeSingle()
    profile = data
  }

  return profile
}

export function useAuth() {
  const { user, isAuthenticated, setSession, logout: storeLogout } = useAuthStore()
  const navigate = useNavigate()

  const loginMutation = useMutation({
    mutationFn: async (params: LoginParams) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: params.email,
        password: params.password,
      })
      if (error) throw new Error(error.message)
      if (!data.session) throw new Error('No session returned')

      const profile = await ensureProfile(data.session.user.id, params.email)
      return { session: data.session, profile }
    },
    onSuccess: ({ session, profile }) => {
      setSession(session, profile)
      navigate('/dashboard')
    },
  })

  const signupMutation = useMutation({
    mutationFn: async (params: LoginParams) => {
      const { data, error } = await supabase.auth.signUp({
        email: params.email,
        password: params.password,
      })
      if (error) throw new Error(error.message)
      if (!data.session) throw new Error('Check your email to confirm your account.')

      const profile = await ensureProfile(data.session.user.id, params.email)
      return { session: data.session, profile }
    },
    onSuccess: ({ session, profile }) => {
      setSession(session, profile)
      navigate('/dashboard')
    },
  })

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await supabase.auth.signOut()
    },
    onSettled: () => {
      storeLogout()
      navigate('/login')
    },
  })

  return {
    user,
    isAuthenticated,
    login: loginMutation,
    signup: signupMutation,
    logout: logoutMutation,
  }
}
