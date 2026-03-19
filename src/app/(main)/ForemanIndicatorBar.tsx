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
    <div className="relative z-30 border-b border-slate-200 bg-slate-50 px-4 py-4">
      <section className="space-y-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Managing Crew</p>
        <ForemanCombobox
          fetchForemen={fetchForemen}
          value={foreman}
          onSelect={setForeman}
          placeholder="Select foreman..."
          triggerClassName="h-14 w-full rounded-none border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-none"
        />
      </section>
    </div>
  )
}
