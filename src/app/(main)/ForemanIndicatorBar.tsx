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
    <div className="bg-primary/10 border-b border-primary/20 px-3 py-2 flex items-center gap-2">
      <span className="text-xs font-medium text-gray-700 shrink-0">Foreman:</span>
      <ForemanCombobox
        fetchForemen={fetchForemen}
        value={foreman}
        onSelect={setForeman}
        placeholder="Select foreman..."
        triggerClassName="border-primary/30 bg-white/80 hover:bg-white h-8 text-xs shrink min-w-0"
      />
    </div>
  )
}
