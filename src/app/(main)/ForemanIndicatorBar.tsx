"use client"

import { usePathname } from "next/navigation"
import { ForemanCombobox } from "@/components/ForemanCombobox"
import { useSelectedForeman } from "@/contexts/SelectedForemanContext"

async function fetchForemen() {
  const res = await fetch("/api/foremen")
  if (!res.ok) throw new Error("Failed to load foremen")
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export function ForemanIndicatorBar() {
  const pathname = usePathname()
  const { foreman, setForeman } = useSelectedForeman()

  if (pathname === "/select-foreman" || !foreman) return null

  return (
    <div className="relative z-30 px-4 pt-3">
      <div className="app-flat-card flex items-center gap-3 px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
          {(foreman.name || foreman.email || "F").slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 shrink">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Managing Crew</p>
          <p className="truncate text-base font-semibold text-slate-800">{foreman.name || foreman.email}</p>
        </div>
        <ForemanCombobox
          fetchForemen={fetchForemen}
          value={foreman}
          onSelect={setForeman}
          placeholder="Select foreman..."
          triggerClassName="ml-auto h-12 min-w-[170px] rounded-2xl border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-none"
        />
      </div>
    </div>
  )
}
