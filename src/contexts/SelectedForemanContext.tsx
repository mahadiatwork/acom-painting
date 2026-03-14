"use client"

import React, { createContext, useCallback, useContext, useEffect, useState } from "react"

const STORAGE_KEY = "acom_selected_foreman"

export interface Foreman {
  id: string
  email: string
  name: string
  phone?: string
}

interface SelectedForemanState {
  foreman: Foreman | null
  setForeman: (foreman: Foreman | null) => void
  clearForeman: () => void
  hydrated: boolean
}

const SelectedForemanContext = createContext<SelectedForemanState | null>(null)

export function SelectedForemanProvider({ children }: { children: React.ReactNode }) {
  const [foreman, setForemanState] = useState<Foreman | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null
      if (raw) {
        const parsed = JSON.parse(raw) as Foreman
        if (parsed?.id && parsed?.name) setForemanState(parsed)
      }
    } catch {
      // ignore
    }
    setHydrated(true)
  }, [])

  const setForeman = useCallback((value: Foreman | null) => {
    setForemanState(value)
    if (typeof window !== "undefined") {
      if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      else localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const clearForeman = useCallback(() => setForeman(null), [setForeman])

  return (
    <SelectedForemanContext.Provider
      value={{
        foreman: hydrated ? foreman : null,
        setForeman,
        clearForeman,
        hydrated,
      }}
    >
      {children}
    </SelectedForemanContext.Provider>
  )
}

export function useSelectedForeman() {
  const ctx = useContext(SelectedForemanContext)
  if (!ctx) throw new Error("useSelectedForeman must be used within SelectedForemanProvider")
  return ctx
}
