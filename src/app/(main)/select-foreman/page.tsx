"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Layout, Header } from "@/components/Layout"
import { ForemanCombobox } from "@/components/ForemanCombobox"
import { Loader2 } from "lucide-react"
import { useSelectedForeman, type Foreman } from "@/contexts/SelectedForemanContext"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import type { User as SupabaseUser } from "@supabase/supabase-js"

export default function SelectForemanPage() {
  const router = useRouter()
  const { setForeman, clearForeman } = useSelectedForeman()
  const { toast } = useToast()
  const [foremen, setForemen] = useState<Foreman[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [selectedName, setSelectedName] = useState("")
  const [selectedSubmitter, setSelectedSubmitter] = useState<Foreman | null>(null)

  useEffect(() => {
    clearForeman()
    setSelectedSubmitter(null)
  }, [clearForeman])

  useEffect(() => {
    const supabase = createClient()
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) setUser(session.user)
      setUserLoading(false)
    }
    getInitialSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: { user: import('@supabase/supabase-js').User } | null) => {
      setUser(session?.user ?? null)
      setUserLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    setLoggingOut(true)
    const supabase = createClient()
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error("[Select Foreman] signOut error:", err)
    } finally {
      clearForeman()
      setUser(null)
      window.location.replace("/login")
    }
  }

  useEffect(() => {
    let cancelled = false
    async function fetchForemen() {
      try {
        const res = await fetch("/api/foremen")
        if (!res.ok) throw new Error("Failed to load foremen")
        const data = await res.json()
        if (!cancelled) setForemen(Array.isArray(data) ? data : [])
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load foremen")
          toast({ title: "Error", description: "Could not load foreman list.", variant: "destructive" })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchForemen()
    return () => { cancelled = true }
  }, [toast])

  const handleSelect = async (chosen: Foreman) => {
    setSelectedSubmitter(chosen)
    setForeman(chosen)
    setSelectedName(chosen.name || chosen.email || "Submitter")
    setNavigating(true)

    // Parallel prefetch — dashboard is warm when we arrive
    const foremanHeaders = { 'X-Selected-Foreman-Id': chosen.id }
    Promise.allSettled([
      fetch("/api/projects"),
      fetch("/api/painters"),
      fetch(`/api/time-entries?days=7`, { headers: foremanHeaders }),
    ]).catch(() => {})

    router.replace("/")
  }

  const userName = user?.user_metadata?.name || user?.email || "User"

  // Initials helper
  const initials = (name: string) =>
    name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "??"

  return (
    <>
      {/* ── Full-screen navigation overlay ── */}
      {navigating && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
          {/* Avatar ring pulse */}
          <div className="relative mb-6">
            {/* Outer pulse ring */}
            <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            <div className="relative h-20 w-20 rounded-full bg-primary flex items-center justify-center shadow-[0_8px_24px_rgba(13,148,136,0.35)]">
              <span className="text-white text-2xl font-bold font-heading">
                {initials(selectedName)}
              </span>
            </div>
          </div>

          {/* Name + status */}
          <p className="text-slate-800 text-lg font-semibold font-heading mb-1">{selectedName}</p>
          <p className="text-slate-400 text-sm mb-8">Opening the dashboard…</p>

          {/* Progress bar track */}
          <div className="w-48 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary animate-[progress_1.8s_ease-in-out_infinite]"
              style={{
                animation: "nav-progress 1.8s ease-in-out infinite",
              }}
            />
          </div>

          <style>{`
            @keyframes nav-progress {
              0%   { width: 0%;   margin-left: 0%; }
              50%  { width: 70%;  margin-left: 15%; }
              100% { width: 0%;   margin-left: 100%; }
            }
          `}</style>
        </div>
      )}

      <Layout>
        <Header user={userLoading ? "..." : userName} onLogout={handleLogout} logoutLoading={loggingOut} />
        <div className="px-6 pt-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">Crew Setup</p>
          <h1 className="app-section-title mt-3">Who is submitting today&apos;s timesheet?</h1>
          <p className="app-subtle-text mt-3">Select yourself or the person managing the crew today.</p>
        </div>

        <main className="flex-1 px-6 py-8">
          {loading && (
            <div className="app-soft-card flex items-center justify-center py-14">
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && foremen.length === 0 && (
            <div className="p-4 rounded-lg bg-gray-50 text-gray-600 text-sm">
              No submitters in list. Sync Portal Users from Zoho to Supabase (e.g. run the cron sync).
            </div>
          )}

          {!loading && foremen.length > 0 && (
            <div className="app-soft-card mx-auto max-w-md p-6 md:p-8">
              <ForemanCombobox
                foremen={foremen}
                value={selectedSubmitter}
                onSelect={handleSelect}
                placeholder="Search and select submitter..."
                standalone
              />
              <p className="mt-5 text-center text-sm text-slate-400">Your crew dashboard will open right after selection.</p>
            </div>
          )}
        </main>
      </Layout>
    </>
  )
}
