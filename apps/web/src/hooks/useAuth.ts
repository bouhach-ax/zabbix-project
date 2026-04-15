import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

interface LoginParams {
  email: string
  password: string
}

interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
    role: string
    tenantId: string
  }
}

export function useAuth() {
  const { user, isAuthenticated, login: storeLogin, logout: storeLogout } = useAuthStore()
  const navigate = useNavigate()

  const loginMutation = useMutation({
    mutationFn: async (params: LoginParams) => {
      const res = await api.post<LoginResponse>('/auth/login', params)
      return res.data
    },
    onSuccess: (data) => {
      storeLogin(data.accessToken, data.refreshToken, data.user)
      navigate('/dashboard')
    },
  })

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const refreshToken = useAuthStore.getState().refreshToken
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken }).catch(() => {
          // Swallow logout errors -- we clear local state regardless
        })
      }
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
    logout: logoutMutation,
  }
}
