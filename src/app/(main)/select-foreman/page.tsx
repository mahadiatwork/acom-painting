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

  useEffect(() => {
    const supabase = createClient()
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) setUser(session.user)
      setUserLoading(false)
    }
    getInitialSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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

  const handleSelect = async (foreman: Foreman) => {
    setForeman(foreman)
    // Fire project prefetch in background — do NOT await it.
    // Navigation happens immediately; the prefetch just warms the cache.
    fetch("/api/projects", { cache: "no-store" }).catch(() => {})
    router.replace("/")
  }

  const userName = user?.user_metadata?.name || user?.email || "User"

  return (
    <Layout>
      <Header user={userLoading ? "..." : userName} onLogout={handleLogout} logoutLoading={loggingOut} />
      <div className="px-6 pt-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">Crew Setup</p>
        <h1 className="app-section-title mt-3">Who is submitting today&apos;s timesheet?</h1>
        <p className="app-subtle-text mt-3">Select yourself or the person managing the crew today. Your selection stays saved until you change it or log out.</p>
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
              value={null}
              onSelect={handleSelect}
              placeholder="Search and select submitter..."
              standalone
            />
            <p className="mt-5 text-center text-sm text-slate-400">Your crew dashboard will open right after selection.</p>
          </div>
        )}
      </main>
    </Layout>
  )
}
