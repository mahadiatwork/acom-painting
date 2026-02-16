"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Layout, Header } from "@/components/Layout"
import { ArrowLeft } from "lucide-react"

interface Painter {
  id: string
  name: string
  email: string | null
  phone: string | null
}

export default function TestPaintersPage() {
  const router = useRouter()
  const [painters, setPainters] = useState<Painter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rawResponse, setRawResponse] = useState<string>("")

  useEffect(() => {
    let cancelled = false
    async function fetchPainters() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/painters", { credentials: "include" })
        const data = await res.json().catch(() => ({}))
        const text = await res.text().catch(() => "")
        if (!cancelled) setRawResponse(text)
        if (!res.ok) {
          setError(data?.error || `HTTP ${res.status}`)
          setPainters([])
          return
        }
        const list = Array.isArray(data) ? data : []
        if (!cancelled) setPainters(list)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to fetch")
          setPainters([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchPainters()
    return () => { cancelled = true }
  }, [])

  return (
    <Layout>
      <Header title="Test: Painters" />
      <div className="p-4 space-y-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-2 text-primary font-medium"
        >
          <ArrowLeft size={20} /> Back
        </button>

        <p className="text-sm text-gray-600">
          This page fetches <code className="bg-gray-100 px-1 rounded">GET /api/painters</code> and shows all active painters from the database.
        </p>

        {loading && (
          <div className="p-4 rounded-lg bg-gray-50 text-gray-600">Loading…</div>
        )}

        {error && (
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
            <strong>Error:</strong> {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="font-semibold text-gray-800">
              Count: {painters.length} painter{painters.length !== 1 ? "s" : ""}
            </div>
            {painters.length === 0 ? (
              <div className="p-4 rounded-lg bg-gray-50 text-gray-600">
                No painters returned. Check that the app uses the same Supabase project as your painters table (e.g. roofworx-timesheet-app) and that the table has rows.
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="p-2 font-semibold">id</th>
                      <th className="p-2 font-semibold">name</th>
                      <th className="p-2 font-semibold">email</th>
                      <th className="p-2 font-semibold">phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {painters.map((p) => (
                      <tr key={p.id} className="border-b border-gray-100 last:border-0">
                        <td className="p-2 font-mono text-xs">{p.id}</td>
                        <td className="p-2">{p.name}</td>
                        <td className="p-2 text-gray-600">{p.email ?? "—"}</td>
                        <td className="p-2 text-gray-600">{p.phone ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">Raw response</summary>
              <pre className="mt-2 p-3 rounded bg-gray-100 text-xs overflow-auto max-h-48 whitespace-pre-wrap break-all">
                {rawResponse || "(empty)"}
              </pre>
            </details>
          </>
        )}
      </div>
    </Layout>
  )
}
