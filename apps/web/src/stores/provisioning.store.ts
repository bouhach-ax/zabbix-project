import { create } from 'zustand'

interface JobProgress {
  step: string
  status: string
  progress: number
}

interface ProvisioningState {
  activeJobId: string | null
  jobProgress: Record<string, JobProgress>
  setActiveJob: (id: string | null) => void
  updateJobProgress: (hostId: string, data: JobProgress) => void
  clearJob: (hostId: string) => void
}

export const useProvisioningStore = create<ProvisioningState>()((set) => ({
  activeJobId: null,
  jobProgress: {},

  setActiveJob: (id: string | null) => set({ activeJobId: id }),

  updateJobProgress: (hostId: string, data: JobProgress) =>
    set((state) => ({
      jobProgress: { ...state.jobProgress, [hostId]: data },
    })),

  clearJob: (hostId: string) =>
    set((state) => {
      const { [hostId]: _, ...rest } = state.jobProgress
      void _
      return { jobProgress: rest }
    }),
}))
