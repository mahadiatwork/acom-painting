"use client"

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

interface NavigationLoadingState {
  /** Call this before any router.push/replace to show the overlay */
  startLoading: (label?: string) => void
  isLoading: boolean
}

const NavigationLoadingContext = createContext<NavigationLoadingState>({
  startLoading: () => {},
  isLoading: false,
})

export function NavigationLoadingProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(false)
  const [label, setLabel] = useState("Loading…")
  const pathname = usePathname()
  const prevPathname = useRef(pathname)

  // Auto-hide when the pathname actually changes (new page has mounted)
  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname
      setIsLoading(false)
    }
  }, [pathname])

  const startLoading = useCallback((text?: string) => {
    setLabel(text || "Loading…")
    setIsLoading(true)
  }, [])

  return (
    <NavigationLoadingContext.Provider value={{ startLoading, isLoading }}>
      {children}

      {/* ── Global navigation overlay ── */}
      {isLoading && (
        <div
          aria-live="polite"
          aria-label="Navigating"
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/85 backdrop-blur-sm"
        >
          {/* Spinning ring */}
          <div className="relative mb-6 flex items-center justify-center">
            {/* Outer slow pulse */}
            <span className="absolute h-20 w-20 rounded-full bg-primary/15 animate-ping" style={{ animationDuration: "1.4s" }} />
            {/* Spinning arc */}
            <svg
              className="h-16 w-16 animate-spin"
              viewBox="0 0 64 64"
              fill="none"
              style={{ animationDuration: "0.9s" }}
            >
              <circle cx="32" cy="32" r="26" stroke="hsl(175 84% 32% / 0.12)" strokeWidth="5" />
              <path
                d="M32 6 a26 26 0 0 1 26 26"
                stroke="hsl(175 84% 32%)"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
            {/* ACOM dot in center */}
            <div className="absolute h-8 w-8 rounded-full bg-primary shadow-[0_4px_16px_rgba(13,148,136,0.4)]" />
          </div>

          <p className="text-slate-700 text-base font-semibold font-heading mb-1">{label}</p>
          <p className="text-slate-400 text-sm mb-7">Please wait a moment…</p>

          {/* Shuttle progress bar */}
          <div className="w-40 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary"
              style={{ animation: "nav-shuttle 1.6s ease-in-out infinite" }}
            />
          </div>

          <style>{`
            @keyframes nav-shuttle {
              0%   { width: 0%;   margin-left: 0%; }
              50%  { width: 65%;  margin-left: 17%; }
              100% { width: 0%;   margin-left: 100%; }
            }
          `}</style>
        </div>
      )}
    </NavigationLoadingContext.Provider>
  )
}

export function useNavigationLoading() {
  return useContext(NavigationLoadingContext)
}
