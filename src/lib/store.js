import { create } from 'zustand'

export const useStore = create((set) => ({
  // Auth state
  user: null,
  setUser: (user) => set({ user }),

  // App state
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),

  // Error state
  error: null,
  setError: (error) => set({ error }),
  clearError: () => set({ error: null })
}))
