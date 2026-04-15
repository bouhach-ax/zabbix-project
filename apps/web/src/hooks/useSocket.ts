import { useRef } from 'react'

export function useSocket() {
  const socketRef = useRef(null)
  return socketRef
}
