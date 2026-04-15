import axios from 'axios'
import { useAuthStore } from '@/stores/auth.store'

/**
 * Axios instance with base URL and interceptors.
 * Injects JWT access token and handles 401 refresh automatically.
 */
export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30_000,
})

// Request interceptor -- inject JWT access token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor -- handle 401 with token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error)
    }

    const original = error.config
    if (!original) {
      return Promise.reject(error)
    }

    const retryFlag = original as typeof original & { _retry?: boolean }

    if (error.response?.status === 401 && !retryFlag._retry) {
      retryFlag._retry = true
      const { refreshToken, setTokens, logout } = useAuthStore.getState()

      if (refreshToken) {
        try {
          const res = await axios.post<{
            accessToken: string
            refreshToken: string
          }>('/api/auth/refresh', { refreshToken })
          const { accessToken: newAccess, refreshToken: newRefresh } = res.data
          setTokens(newAccess, newRefresh)
          original.headers.Authorization = `Bearer ${newAccess}`
          return api(original)
        } catch {
          logout()
          window.location.href = '/login'
        }
      } else {
        logout()
        window.location.href = '/login'
      }
    }

    return Promise.reject(error)
  },
)
