"use client"

import * as React from "react"
import { Check, ChevronsUpDown, User } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { Foreman } from "@/contexts/SelectedForemanContext"

interface ForemanComboboxProps {
  /** Foremen list (use when parent already has the list). */
  foremen?: Foreman[]
  /** When provided, foremen are fetched on open and foremen prop is ignored. */
  fetchForemen?: () => Promise<Foreman[]>
  loading?: boolean
  value: Foreman | null
  onSelect: (foreman: Foreman) => void
  placeholder?: string
  triggerClassName?: string
  /** When true, trigger shows "Select foreman..." and is full-width (e.g. for select-foreman page). */
  standalone?: boolean
}

export function ForemanCombobox({
  foremen: foremenProp = [],
  fetchForemen,
  loading: loadingProp = false,
  value,
  onSelect,
  placeholder = "Select foreman...",
  triggerClassName,
  standalone = false,
}: ForemanComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [foremenList, setForemenList] = React.useState<Foreman[]>([])
  const [fetching, setFetching] = React.useState(false)

  React.useEffect(() => {
    if (!open || !fetchForemen) return
    setFetching(true)
    fetchForemen()
      .then((list) => setForemenList(Array.isArray(list) ? list : []))
      .catch(() => setForemenList([]))
      .finally(() => setFetching(false))
  }, [open, fetchForemen])

  const foremen = fetchForemen ? foremenList : foremenProp
  const loading = loadingProp || (!!fetchForemen && fetching)

  const handleSelect = (foreman: Foreman) => {
    onSelect(foreman)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "justify-between font-normal",
            standalone ? "w-full h-auto min-h-12 py-3 px-4" : "min-w-[200px]",
            triggerClassName
          )}
          disabled={loading}
        >
          {loading ? (
            <span className="text-muted-foreground">Loading foremen...</span>
          ) : value ? (
            <span className="flex items-center gap-2 truncate">
              <User className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{value.name || value.email}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-full p-0", standalone ? "min-w-[var(--radix-popover-trigger-width)]" : "w-[var(--radix-popover-trigger-width)]")}
        align="start"
      >
        <Command shouldFilter={true}>
          <CommandInput placeholder="Search by name or email..." />
          <CommandList>
            <CommandEmpty>No foreman found.</CommandEmpty>
            <CommandGroup>
              {foremen.map((f) => (
                <CommandItem
                  key={f.id}
                  value={`${f.name ?? ""} ${f.email ?? ""}`}
                  onSelect={() => handleSelect(f)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value?.id === f.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{f.name || f.email}</span>
                    {f.email && f.name && (
                      <span className="text-xs text-muted-foreground truncate">{f.email}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
