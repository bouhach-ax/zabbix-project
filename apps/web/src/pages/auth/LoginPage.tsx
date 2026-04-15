import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const navigate = useNavigate()
  const { isAuthenticated, login, signup } = useAuth()

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, navigate])

  const isPending = login.isPending || signup.isPending

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.')
      return
    }

    try {
      if (mode === 'login') {
        await login.mutateAsync({ email: email.trim(), password })
      } else {
        await signup.mutateAsync({ email: email.trim(), password })
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Authentication failed. Please try again.'
      setError(message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-dark via-brand-surface to-brand-dark px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-primary">Zabbix</span>
            <span className="text-white">Pilot</span>
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Industrial Zabbix Management Platform
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-xl p-8">
          <div className="flex rounded-lg bg-gray-800 p-1 mb-6">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null) }}
              className={cn(
                'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors duration-150',
                mode === 'login'
                  ? 'bg-gray-700 text-white shadow'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null) }}
              className={cn(
                'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors duration-150',
                mode === 'signup'
                  ? 'bg-gray-700 text-white shadow'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-primary focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">
                Password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                placeholder={mode === 'signup' ? 'Min. 6 characters' : 'Enter your password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isPending}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-primary focus:ring-primary"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={isPending}
              className={cn(
                'w-full bg-primary hover:bg-primary-hover text-white font-medium py-2.5',
                'transition-colors duration-fast ease-out-standard',
                'disabled:opacity-60 disabled:cursor-not-allowed'
              )}
            >
              {isPending
                ? mode === 'login' ? 'Signing in...' : 'Creating account...'
                : mode === 'login' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          ZabbixPilot &mdash; Industrial Zabbix Management
        </p>
      </div>
    </div>
  )
}
