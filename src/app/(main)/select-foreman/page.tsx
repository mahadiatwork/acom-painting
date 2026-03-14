"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Layout, Header } from "@/components/Layout"
import { Loader2, User } from "lucide-react"
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

  const handleSelect = (foreman: Foreman) => {
    setForeman(foreman)
    router.replace("/")
  }

  const userName = user?.user_metadata?.name || user?.email || "User"

  return (
    <Layout>
      <Header user={userLoading ? "..." : userName} onLogout={handleLogout} logoutLoading={loggingOut} />
      <div className="bg-secondary text-white p-4">
        <h1 className="text-lg font-bold">Select Foreman</h1>
        <p className="text-sm text-gray-300 mt-1">
          Choose the foreman under whom you are logging time.
        </p>
      </div>

      <main className="flex-1 p-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
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
            No foremen in list. Sync Portal Users from Zoho to Supabase (e.g. run the cron sync).
          </div>
        )}

        {!loading && foremen.length > 0 && (
          <ul className="space-y-2">
            {foremen.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(f)}
                  className="w-full flex items-center gap-3 p-4 rounded-lg border border-gray-200 bg-white text-left hover:bg-primary/5 hover:border-primary/30 transition-colors"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{f.name}</p>
                    <p className="text-sm text-gray-500 truncate">{f.email}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </Layout>
  )
}
