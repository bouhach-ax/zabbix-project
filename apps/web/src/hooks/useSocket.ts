import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useAuthStore } from '@/stores/auth.store'
import { useNocStore } from '@/stores/noc.store'

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)
  const accessToken = useAuthStore((s) => s.accessToken)
  const tenantId = useAuthStore((s) => s.user?.tenantId)
  const setConnected = useNocStore((s) => s.setConnected)

  useEffect(() => {
    if (!accessToken || !tenantId) return

    const socket = io('/', {
      path: '/socket.io',
      auth: { token: accessToken },
      query: { tenantId },
    })

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socketRef.current = socket

    return () => {
      socket.disconnect()
      socketRef.current = null
      setConnected(false)
    }
  }, [accessToken, tenantId, setConnected])

  return socketRef
}
