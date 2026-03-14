"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSelectedForeman } from "@/contexts/SelectedForemanContext"
import { User } from "lucide-react"

export function ForemanIndicatorBar() {
  const pathname = usePathname()
  const { foreman } = useSelectedForeman()

  if (pathname === "/select-foreman" || !foreman) return null

  return (
    <div className="bg-primary/10 border-b border-primary/20 px-3 py-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <User size={16} className="shrink-0 text-primary" />
        <span className="text-xs font-medium text-gray-700 truncate">
          Foreman: <span className="text-primary font-semibold">{foreman.name || foreman.email}</span>
        </span>
      </div>
      <Link
        href="/select-foreman"
        className="shrink-0 text-xs font-medium text-primary hover:underline"
      >
        Change
      </Link>
    </div>
  )
}
