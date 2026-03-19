"use client"

import React, { createContext, useCallback, useContext, useEffect, useState } from "react"

const STORAGE_KEY = "acom_selected_foreman"
const STORAGE_EVENT_KEY = "acom_selected_foreman_event"

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

function isValidForeman(value: unknown): value is Foreman {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<Foreman>
  return Boolean(candidate.id && candidate.name)
}

function readStoredForeman(): Foreman | null {
  if (typeof window === "undefined") return null

  const parseCandidate = (raw: string | null): Foreman | null => {
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      return isValidForeman(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  // Prefer localStorage for cross-tab persistence, fallback to sessionStorage for recovery.
  return (
    parseCandidate(window.localStorage.getItem(STORAGE_KEY)) ||
    parseCandidate(window.sessionStorage.getItem(STORAGE_KEY))
  )
}

function writeStoredForeman(value: Foreman | null) {
  if (typeof window === "undefined") return

  if (value) {
    const serialized = JSON.stringify(value)
    window.localStorage.setItem(STORAGE_KEY, serialized)
    window.sessionStorage.setItem(STORAGE_KEY, serialized)
  } else {
    window.localStorage.removeItem(STORAGE_KEY)
    window.sessionStorage.removeItem(STORAGE_KEY)
  }

  // Notify same-tab listeners (storage event does not fire in same document).
  window.localStorage.setItem(STORAGE_EVENT_KEY, String(Date.now()))
}

export function SelectedForemanProvider({ children }: { children: React.ReactNode }) {
  const [foreman, setForemanState] = useState<Foreman | null>(() => readStoredForeman())
  const [hydrated, setHydrated] = useState<boolean>(() => typeof window !== "undefined")

  useEffect(() => {
    console.log("[SelectedForemanProvider] render state", {
      hydrated,
      foremanId: foreman?.id ?? null,
      foremanName: foreman?.name ?? null,
    })
  }, [hydrated, foreman])

  useEffect(() => {
    const restored = readStoredForeman()
    console.log("[SelectedForemanProvider] initial restore", {
      restoredId: restored?.id ?? null,
      restoredName: restored?.name ?? null,
      localStorageValue: typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null,
      sessionStorageValue: typeof window !== "undefined" ? window.sessionStorage.getItem(STORAGE_KEY) : null,
    })
    setForemanState(restored)
    setHydrated(true)

    const syncFromStorage = () => {
      const restored = readStoredForeman()
      console.log("[SelectedForemanProvider] syncFromStorage", {
        restoredId: restored?.id ?? null,
        restoredName: restored?.name ?? null,
      })
      setForemanState(restored)
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== STORAGE_KEY && event.key !== STORAGE_EVENT_KEY) return
      syncFromStorage()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") syncFromStorage()
    }

    window.addEventListener("storage", onStorage)
    window.addEventListener("focus", syncFromStorage)
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("focus", syncFromStorage)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])

  const setForeman = useCallback((value: Foreman | null) => {
    console.log("[SelectedForemanProvider] setForeman", {
      nextId: value?.id ?? null,
      nextName: value?.name ?? null,
    })
    setForemanState(value)
    writeStoredForeman(value)
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
