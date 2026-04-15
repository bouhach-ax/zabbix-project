import { create } from 'zustand'

interface AlertCounts {
  disaster: number
  high: number
  medium: number
  low: number
}

interface NocState {
  selectedAlertId: string | null
  connected: boolean
  alertCounts: AlertCounts
  setSelectedAlert: (id: string | null) => void
  setConnected: (connected: boolean) => void
  updateAlertCounts: (counts: AlertCounts) => void
}

export const useNocStore = create<NocState>()((set) => ({
  selectedAlertId: null,
  connected: false,
  alertCounts: { disaster: 0, high: 0, medium: 0, low: 0 },

  setSelectedAlert: (id: string | null) => set({ selectedAlertId: id }),

  setConnected: (connected: boolean) => set({ connected }),

  updateAlertCounts: (counts: AlertCounts) => set({ alertCounts: counts }),
}))
