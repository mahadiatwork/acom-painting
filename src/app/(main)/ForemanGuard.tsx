"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { useSelectedForeman } from "@/contexts/SelectedForemanContext"
import { Loader2 } from "lucide-react"

const SELECT_FOREMAN_PATH = "/select-foreman"

export function ForemanGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { foreman, hydrated } = useSelectedForeman()

  useEffect(() => {
    if (!hydrated) return
    if (pathname === SELECT_FOREMAN_PATH) return
    if (!foreman) {
      // Give storage rehydration one short grace window on route transitions
      // before redirecting away from protected pages.
      const timer = window.setTimeout(() => {
        router.replace(SELECT_FOREMAN_PATH)
      }, 150)
      return () => window.clearTimeout(timer)
    }
  }, [hydrated, foreman, pathname, router])

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    )
  }

  if (pathname !== SELECT_FOREMAN_PATH && !foreman) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    )
  }

  return <>{children}</>
}
