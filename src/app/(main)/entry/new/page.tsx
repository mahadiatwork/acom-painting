"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { Layout } from "@/components/Layout"
import { PrimaryButton } from "@/components/PrimaryButton"
import { TextAreaField } from "@/components/FormFields"
import { ArrowLeft, Save, Loader2, Calendar, Clock, Package, Plus, Minus, Trash2, ClipboardList, Pencil } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useToast } from "@/hooks/use-toast"
import { useSelectedForeman } from "@/contexts/SelectedForemanContext"
import { useProjects } from "@/hooks/useProjects"
import { usePainters } from "@/hooks/usePainters"
import { useQueryClient } from "@tanstack/react-query"
import {
  WORK_PERFORMED_STRUCTURE,
  type JobProductionReference,
  type WorkPerformedAreaKey,
  type WorkPerformedEntry,
  type WorkPerformedGroup,
  type WorkPerformedTask,
} from "@/config/workPerformed"

type TabType = "crew" | "sundry" | "work"

const DEFAULT_START = "07:30"
const DEFAULT_END = "16:00"

const formatHoursValue = (hours: number): string => hours.toFixed(2)

const formatHoursLabel = (hours: number): string => `${formatHoursValue(hours)} hrs`

const formatHoursText = (hours: number): string => `${formatHoursValue(hours)} Hours`

const LUNCH_DURATION_OPTIONS = Array.from({ length: 8 }, (_, i) => {
  const hours = (i + 1) * 0.25
  return { value: String(Math.round(hours * 60)), label: formatHoursLabel(hours) }
})

const LABOR_MAN_HOUR_OPTIONS = Array.from({ length: 17 }, (_, i) => {
  const hours = i * 0.25
  return { value: formatHoursValue(hours), label: formatHoursLabel(hours) }
})

const MINUTE_OPTIONS = ["00", "15", "30", "45"] as const
const HOUR_OPTIONS = Array.from({ length: 18 }, (_, i) => i + 4) // 4 AM–9 PM

interface PainterRow {
  painterId: string
  painterName: string
  /** Total scheduled work hours for the day (before unpaid lunch), stored as decimal hours string, e.g. "8", "7.5". */
  workHours: string
  startTime: string
  endTime: string
  lunchDuration: string // "0" | "15" | "30" | ... | "120" (minutes)
}

interface TimeEntrySectionState {
  painters: PainterRow[]
  notes: string
}

interface SundryItem {
  sundryItem: string
  quantity: number
}

/** Work Performed list item: normalized entry from config (groupCode, taskCode, measurements). */
type SavedWorkPerformedEntry = WorkPerformedEntry

const SUNDRY_ITEMS = [
  "Masking Paper Roll",
  "Plastic Roll",
  "Putty/Spackle Tub",
  "Caulk Tube",
  "White Tape Roll",
  "Orange Tape Roll",
  "Floor Paper Roll",
  "Tip",
  "Sanding Sponge",
  '18" Roller Cover',
  '9" Roller Cover',
  "Mini Cover",
  "Masks",
  "Brick Tape Roll",
]

const emptyPainterRow = (): PainterRow => ({
  painterId: "",
  painterName: "",
  workHours: "",
  startTime: "",
  endTime: "",
  lunchDuration: "30",
})

function parseTimeToMinutes(time: string): number {
  if (!time) return 0
  const [h, m] = time.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** Snap HH:MM to nearest 15 minutes (00, 15, 30, 45). */
function snapTimeTo15Minutes(time: string): string {
  if (!time || !time.includes(":")) return time
  const [h, m] = time.split(":").map(Number)
  const totalM = (h ?? 0) * 60 + (m ?? 0)
  const snappedM = Math.round(totalM / 15) * 15
  const hours = Math.floor(snappedM / 60) % 24
  const mins = snappedM % 60
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
}

/** Derive lunch start/end from shift and duration (lunch centered in shift). */
function durationToLunchStartEnd(start: string, end: string, durationMinutes: number): { lunchStart: string; lunchEnd: string } {
  if (!durationMinutes || !start || !end) return { lunchStart: "", lunchEnd: "" }
  const startM = parseTimeToMinutes(start)
  const endM = parseTimeToMinutes(end)
  const shiftM = endM - startM
  if (shiftM <= durationMinutes) return { lunchStart: "", lunchEnd: "" }
  const lunchStartM = startM + (shiftM - durationMinutes) / 2
  return {
    lunchStart: minutesToTime(lunchStartM),
    lunchEnd: minutesToTime(lunchStartM + durationMinutes),
  }
}

function computeHours(start: string, end: string, lunchDuration: string): number {
  let workM = parseTimeToMinutes(end) - parseTimeToMinutes(start)
  const lunchM = lunchDuration ? parseInt(lunchDuration, 10) || 0 : 0
  if (lunchM > 0) workM -= lunchM
  return workM > 0 ? Number((workM / 60).toFixed(2)) : 0
}

/** Parse "HH:MM" into hour (number) and minute ("00"|"15"|"30"|"45"); use default if invalid. */
function getTimeParts(time: string, defaultTime: string): { hour: number; minute: string } {
  const fallback = defaultTime.split(":").map(Number)
  const defH = fallback[0] ?? 7
  const defM = MINUTE_OPTIONS.includes(String(fallback[1] ?? 0).padStart(2, "0") as typeof MINUTE_OPTIONS[number])
    ? String(fallback[1]).padStart(2, "0")
    : "30"
  if (!time || !time.includes(":")) return { hour: defH, minute: defM }
  const [h, m] = time.split(":").map(Number)
  const minute = (m ?? 0) % 60
  const snap = MINUTE_OPTIONS[Math.round(minute / 15) % 4] ?? "00"
  return { hour: Math.min(23, Math.max(0, h ?? 0)), minute: snap }
}

export default function NewEntry() {
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { foreman: selectedForeman } = useSelectedForeman()
  const [activeTab, setActiveTab] = useState<TabType>("crew")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [customerWorkOpen, setCustomerWorkOpen] = useState(true)
  const [tmWorkOpen, setTmWorkOpen] = useState(true)
  const [crewSearch, setCrewSearch] = useState("")
  const [tmDetailsOpen, setTmDetailsOpen] = useState(false)
  const [tmActiveTab, setTmActiveTab] = useState<TabType>("crew")

  // Timesheet draft state (single form; tab switching does not unmount — all state persists)
  const [jobId, setJobId] = useState("")
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState("")
  const [customerTimeEntry, setCustomerTimeEntry] = useState<TimeEntrySectionState>(() => ({ painters: [], notes: "" }))
  const [sundryItems, setSundryItems] = useState<SundryItem[]>([])
  const [tmExtraWorkEnabled, setTmExtraWorkEnabled] = useState(false)
  const [tmTimeEntry, setTmTimeEntry] = useState<TimeEntrySectionState | null>(null)
  const [tmSundryItems, setTmSundryItems] = useState<SundryItem[]>([])
  const [painterAddress, setPainterAddress] = useState("")
  // Work Performed (same draft; included in submit payload).
  // Extension: when job-level production reference is available from CRM, set jobProductionReference
  // (e.g. from job fetch) and use it to show reference values or optional defaults—without changing daily flow.
  const jobProductionReference: JobProductionReference | undefined = undefined
  const [workPerformedArea, setWorkPerformedArea] = useState<WorkPerformedAreaKey | "">("")
  const [workPerformedGroupKey, setWorkPerformedGroupKey] = useState("")
  const [workPerformedTaskValue, setWorkPerformedTaskValue] = useState("")
  const [workPerformedQuantity, setWorkPerformedQuantity] = useState("")
  const [workPerformedPaintGallons, setWorkPerformedPaintGallons] = useState("")
  const [workPerformedPrimerGallons, setWorkPerformedPrimerGallons] = useState("")
  const [workPerformedPrimerSource, setWorkPerformedPrimerSource] = useState<"stock" | "retail">("stock")
  const [workPerformedLaborMinutes, setWorkPerformedLaborMinutes] = useState("")
  const [workPerformedCount, setWorkPerformedCount] = useState("")
  const [workPerformedLinearFeet, setWorkPerformedLinearFeet] = useState("")
  const [workPerformedStairFloors, setWorkPerformedStairFloors] = useState("")
  const [workPerformedDoorCount, setWorkPerformedDoorCount] = useState("")
  const [workPerformedWindowCount, setWorkPerformedWindowCount] = useState("")
  const [workPerformedHandrailCount, setWorkPerformedHandrailCount] = useState("")
  const [workPerformedList, setWorkPerformedList] = useState<SavedWorkPerformedEntry[]>([])
  const [workPerformedEditIndex, setWorkPerformedEditIndex] = useState<number | null>(null)
  const [workPerformedValidationError, setWorkPerformedValidationError] = useState<string | null>(null)
  const [jobSelectOpen, setJobSelectOpen] = useState(false)

  // T&M Work Performed state (mirrors main work performed state).
  const [tmWorkPerformedArea, setTmWorkPerformedArea] = useState<WorkPerformedAreaKey | "">("")
  const [tmWorkPerformedGroupKey, setTmWorkPerformedGroupKey] = useState("")
  const [tmWorkPerformedTaskValue, setTmWorkPerformedTaskValue] = useState("")
  const [tmWorkPerformedQuantity, setTmWorkPerformedQuantity] = useState("")
  const [tmWorkPerformedPaintGallons, setTmWorkPerformedPaintGallons] = useState("")
  const [tmWorkPerformedPrimerGallons, setTmWorkPerformedPrimerGallons] = useState("")
  const [tmWorkPerformedPrimerSource, setTmWorkPerformedPrimerSource] = useState<"stock" | "retail">("stock")
  const [tmWorkPerformedLaborMinutes, setTmWorkPerformedLaborMinutes] = useState("")
  const [tmWorkPerformedCount, setTmWorkPerformedCount] = useState("")
  const [tmWorkPerformedLinearFeet, setTmWorkPerformedLinearFeet] = useState("")
  const [tmWorkPerformedStairFloors, setTmWorkPerformedStairFloors] = useState("")
  const [tmWorkPerformedDoorCount, setTmWorkPerformedDoorCount] = useState("")
  const [tmWorkPerformedWindowCount, setTmWorkPerformedWindowCount] = useState("")
  const [tmWorkPerformedHandrailCount, setTmWorkPerformedHandrailCount] = useState("")
  const [tmWorkPerformedList, setTmWorkPerformedList] = useState<SavedWorkPerformedEntry[]>([])
  const [tmWorkPerformedEditIndex, setTmWorkPerformedEditIndex] = useState<number | null>(null)
  const [tmWorkPerformedValidationError, setTmWorkPerformedValidationError] = useState<string | null>(null)

  const { data: projects = [], isLoading: isLoadingProjects, isError: isProjectsError } = useProjects()
  const { data: paintersList = [], isLoading: isLoadingPainters, isError: isPaintersError } = usePainters()

  // Crew selection + time entry UI is reused across Customer work and T&M (see renderCrewTimeEntrySection).

  const renderCrewTimeEntrySection = (opts: {
    title: string
    crewLabel: string
    crewHelpText: string
    paintersState: PainterRow[]
    setPaintersState: React.Dispatch<React.SetStateAction<PainterRow[]>>
    hoursPrefix?: string
    cardRowClassName?: string
  }) => {
    const selectedIds = opts.paintersState.map((p) => p.painterId).filter(Boolean)

    const togglePainter = (painterId: string) => {
      const p = paintersList.find((x) => x.id === painterId)
      if (!p) return
      const isSelected = selectedIds.includes(painterId)
      if (isSelected) {
        opts.setPaintersState((prev) => prev.filter((row) => row.painterId !== painterId))
      } else {
        opts.setPaintersState((prev) => [
          ...prev,
          { painterId: p.id, painterName: p.name, workHours: "8", startTime: DEFAULT_START, endTime: DEFAULT_END, lunchDuration: "30" },
        ])
      }
    }

    const removeRow = (index: number) => {
      opts.setPaintersState((prev) => prev.filter((_, i) => i !== index))
    }

    const updateRow = (index: number, field: keyof PainterRow, value: string) => {
      opts.setPaintersState((prev) => {
        const next = [...prev]
        next[index] = { ...next[index], [field]: value }
        if (field === "painterId") {
          const p = paintersList.find((x) => x.id === value)
          if (p) next[index].painterName = p.name
        }
        return next
      })
    }

    const filteredPainters = crewSearch
      ? paintersList.filter((p) => p.name.toLowerCase().includes(crewSearch.toLowerCase()))
      : paintersList

    return (
      <section>
        <h2 className="text-lg font-bold text-gray-800 mb-2">{opts.title}</h2>
        {isLoadingPainters ? (
          <div className="p-4 border rounded-lg bg-gray-50 text-gray-500">Loading painters...</div>
        ) : (
          <>
            {isPaintersError && (
              <div className="p-4 mb-4 border rounded-lg bg-amber-50 border-amber-200 text-amber-800 text-sm">
                Could not load painters. Make sure you’re logged in and try refreshing the page.
              </div>
            )}
            {!isPaintersError && paintersList.length === 0 && (
              <div className="p-4 mb-4 border rounded-lg bg-gray-50 text-gray-600 text-sm">
                No painters in list. Add painters in Zoho (they sync here) or run the seed script in Supabase. Ensure this app uses the same Supabase project (roofworx-timesheet-app).
              </div>
            )}
            {!isPaintersError && paintersList.length > 0 && (
              <div className="mb-4">
                <Label className="text-sm text-gray-600 block mb-2">{opts.crewLabel}</Label>
                <p className="text-xs text-gray-500 mb-2">{opts.crewHelpText}</p>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full min-h-11 px-3 py-2 rounded-md border border-gray-300 bg-white text-left text-sm font-medium text-gray-800 focus:ring-2 focus:ring-primary focus:ring-offset-0 outline-none flex items-center justify-between gap-2"
                    >
                      <span className="truncate">
                        {selectedIds.length === 0
                          ? "Select painters..."
                          : selectedIds.length === 1
                            ? opts.paintersState.find((r) => r.painterId === selectedIds[0])?.painterName ?? "1 selected"
                            : `${selectedIds.length} selected`}
                      </span>
                      <ChevronDown className="shrink-0 text-gray-500" size={18} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2 max-h-64 overflow-y-auto" align="start">
                    <div className="mb-2">
                      <input
                        type="text"
                        placeholder="Search crew..."
                        value={crewSearch}
                        onChange={(e) => setCrewSearch(e.target.value)}
                        className="w-full h-9 px-2 rounded-md border border-gray-300 bg-white text-xs focus:ring-1 focus:ring-primary outline-none"
                      />
                    </div>
                    <div className="space-y-0.5">
                      {filteredPainters.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-2 hover:bg-gray-100"
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(p.id)}
                            onChange={() => togglePainter(p.id)}
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <span className="text-sm font-medium text-gray-800">{p.name}</span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {opts.paintersState.length > 0 && (
              <div className="space-y-4">
                {opts.paintersState.map((row, index) => (
                  <div
                    key={`${row.painterId}-${index}`}
                    className={opts.cardRowClassName ?? "p-4 rounded-lg border border-gray-200 bg-gray-50/50 space-y-3"}
                  >
                    <div className="flex justify-between items-center">
                      <Label className="text-gray-600 text-sm font-medium">{row.painterName || `Painter ${index + 1}`}</Label>
                      {opts.paintersState.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(index)}
                          className="text-red-600 hover:text-red-700 p-1"
                          aria-label={`Remove ${row.painterName}`}
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-gray-500">From</Label>
                        <input
                          type="time"
                          step={900}
                          className="w-full h-10 px-2 rounded border border-gray-300 bg-white text-sm"
                          value={row.startTime || DEFAULT_START}
                          onChange={(e) => updateRow(index, "startTime", snapTimeTo15Minutes(e.target.value))}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">To</Label>
                        <input
                          type="time"
                          step={900}
                          className="w-full h-10 px-2 rounded border border-gray-300 bg-white text-sm"
                          value={row.endTime || DEFAULT_END}
                          onChange={(e) => updateRow(index, "endTime", snapTimeTo15Minutes(e.target.value))}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Lunch hours</Label>
                      <select
                        className="w-full h-10 px-2 rounded border border-gray-300 bg-white text-sm mt-0.5"
                        value={row.lunchDuration || "0"}
                        onChange={(e) => updateRow(index, "lunchDuration", e.target.value)}
                      >
                        {LUNCH_DURATION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {(row.startTime || row.endTime) && (
                      <p className="text-xs text-gray-500">
                        {opts.hoursPrefix ?? "Hours"}:{" "}
                        {computeHours(row.startTime || DEFAULT_START, row.endTime || DEFAULT_END, row.lunchDuration).toFixed(2)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    )
  }

  const getItemQuantity = (items: SundryItem[], itemName: string) => {
    const item = items.find((i) => i.sundryItem === itemName)
    return item ? item.quantity : 0
  }
  const incrementSundry = (setItems: React.Dispatch<React.SetStateAction<SundryItem[]>>, itemName: string) => {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.sundryItem === itemName)
      if (i >= 0) return prev.map((x, j) => (j === i ? { ...x, quantity: x.quantity + 1 } : x))
      return [...prev, { sundryItem: itemName, quantity: 1 }]
    })
  }
  const decrementSundry = (setItems: React.Dispatch<React.SetStateAction<SundryItem[]>>, itemName: string) => {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.sundryItem === itemName)
      if (i < 0) return prev
      const q = prev[i].quantity
      if (q <= 1) return prev.filter((_, j) => j !== i)
      return prev.map((x, j) => (j === i ? { ...x, quantity: x.quantity - 1 } : x))
    })
  }

  /** V1 validation: Area/Group/Task required and valid; numerics ≥ 0; labor required when multiple tasks and task shows labor. Paint/primer optional. */
  const validateWorkPerformedDraft = (): string | null => {
    if (!workPerformedArea) return "Select an area."
    if (!workPerformedGroupKey) return "Select a group."
    if (!workPerformedTaskValue) return "Select a task."

    const groups = WORK_PERFORMED_STRUCTURE[workPerformedArea]
    const group = groups?.find((g) => g.key === workPerformedGroupKey)
    const task = group?.tasks.find((t) => t.value === workPerformedTaskValue)
    if (!group) return "Select a valid group."
    if (!task) return "Select a valid task."

    const parseOptionalNum = (s: string): { valid: boolean; value: number } => {
      if (s === "") return { valid: true, value: 0 }
      const n = parseFloat(s)
      if (Number.isNaN(n)) return { valid: false, value: 0 }
      if (n < 0) return { valid: false, value: 0 }
      return { valid: true, value: n }
    }

    const meta = task.meta ?? {}

    const qMeta = meta.showQuantity ?? true
    const pMeta = meta.showPaintGallons ?? true
    const prMeta = meta.showPrimerGallons ?? true
    const lmMeta = meta.showLaborMinutes ?? true

    if (qMeta) {
      const q = parseOptionalNum(workPerformedQuantity)
      if (!q.valid) return "Quantity must be a number ≥ 0."
    }
    if (pMeta) {
      const p = parseOptionalNum(workPerformedPaintGallons)
      if (!p.valid) return "Paint gallons must be a number ≥ 0."
    }
    if (prMeta) {
      const pr = parseOptionalNum(workPerformedPrimerGallons)
      if (!pr.valid) return "Primer gallons must be a number ≥ 0."
    }
    if (lmMeta) {
      const lm = parseOptionalNum(workPerformedLaborMinutes)
      if (!lm.valid) return "Labor man-hours must be a number ≥ 0."
      // Multiple tasks: labor required for each task that supports it (V1 rule).
      const countAfterSave = workPerformedEditIndex !== null ? workPerformedList.length : workPerformedList.length + 1
      if (countAfterSave >= 2 && lm.value <= 0) {
        return "With multiple work performed tasks, labor time is required for each. Enter labor hours."
      }
    }
    if (meta.showCount) {
      const c = parseOptionalNum(workPerformedCount)
      if (!c.valid) return "Count must be a number ≥ 0."
    }
    if (meta.showLinearFeet) {
      const lf = parseOptionalNum(workPerformedLinearFeet)
      if (!lf.valid) return "Linear feet must be a number ≥ 0."
    }
    if (meta.showStairFloors) {
      const sf = parseOptionalNum(workPerformedStairFloors)
      if (!sf.valid) return "Stair floors must be a number ≥ 0."
    }
    if (meta.showDoorCount) {
      const dc = parseOptionalNum(workPerformedDoorCount)
      if (!dc.valid) return "Door count must be a number ≥ 0."
    }
    if (meta.showWindowCount) {
      const wc = parseOptionalNum(workPerformedWindowCount)
      if (!wc.valid) return "Window count must be a number ≥ 0."
    }
    if (meta.showHandrailCount) {
      const hc = parseOptionalNum(workPerformedHandrailCount)
      if (!hc.valid) return "Handrail count must be a number ≥ 0."
    }
    return null
  }

  const buildDraftWorkPerformedEntry = (): SavedWorkPerformedEntry | null => {
    if (!workPerformedArea || !workPerformedGroupKey || !workPerformedTaskValue) return null
    const groups = WORK_PERFORMED_STRUCTURE[workPerformedArea]
    const group: WorkPerformedGroup | undefined = groups.find((g) => g.key === workPerformedGroupKey)
    const task: WorkPerformedTask | undefined = group?.tasks.find((t) => t.value === workPerformedTaskValue)
    const groupLabel = group?.label ?? workPerformedGroupKey
    const taskLabel = task?.label ?? workPerformedTaskValue
    const parseNum = (s: string) => (s === "" ? 0 : Math.max(0, parseFloat(s) || 0))
    const count = parseNum(workPerformedCount)
    const linearFeet = parseNum(workPerformedLinearFeet)
    const stairFloors = parseNum(workPerformedStairFloors)
    const doorCount = parseNum(workPerformedDoorCount)
    const windowCount = parseNum(workPerformedWindowCount)
    const handrailCount = parseNum(workPerformedHandrailCount)
    const measurements: WorkPerformedEntry["measurements"] = (() => {
      const m: NonNullable<WorkPerformedEntry["measurements"]> = {}
      if (count > 0) m.count = count
      if (linearFeet > 0) m.linearFeet = linearFeet
      if (stairFloors > 0) m.stairFloors = stairFloors
      if (doorCount > 0) m.doorCount = doorCount
      if (windowCount > 0) m.windowCount = windowCount
      if (handrailCount > 0) m.handrailCount = handrailCount
      return Object.keys(m).length > 0 ? m : undefined
    })()
    return {
      area: workPerformedArea,
      groupCode: workPerformedGroupKey,
      groupLabel,
      taskCode: workPerformedTaskValue,
      taskLabel,
      quantity: parseNum(workPerformedQuantity),
      paintGallonsUsed: parseNum(workPerformedPaintGallons),
      primerGallonsUsed: parseNum(workPerformedPrimerGallons),
      primerSource: workPerformedPrimerSource,
      // Store labor as man-hours (decimal), e.g., 1.5, 7, 40.
      laborMinutes: workPerformedLaborMinutes === "" ? 0 : Math.max(0, parseFloat(workPerformedLaborMinutes) || 0),
      measurements,
    }
  }

  const addWorkPerformedActivity = () => {
    const error = validateWorkPerformedDraft()
    if (error) {
      setWorkPerformedValidationError(error)
      toast({ title: "Invalid activity", description: error, variant: "destructive" })
      return
    }
    setWorkPerformedValidationError(null)
    const entry = buildDraftWorkPerformedEntry()
    if (!entry) return
    if (workPerformedEditIndex !== null) {
      setWorkPerformedList((prev) => prev.map((item, i) => (i === workPerformedEditIndex ? entry : item)))
      setWorkPerformedEditIndex(null)
    } else {
      setWorkPerformedList((prev) => [...prev, entry])
    }
    setWorkPerformedTaskValue("")
    setWorkPerformedQuantity("")
    setWorkPerformedPaintGallons("")
    setWorkPerformedPrimerGallons("")
    setWorkPerformedPrimerSource("stock")
    setWorkPerformedLaborMinutes("")
    setWorkPerformedCount("")
    setWorkPerformedLinearFeet("")
    setWorkPerformedStairFloors("")
    setWorkPerformedDoorCount("")
    setWorkPerformedWindowCount("")
    setWorkPerformedHandrailCount("")
  }

  const startEditingWorkPerformed = (index: number) => {
    const item = workPerformedList[index]
    if (!item) return
    const m = item.measurements ?? {}
    setWorkPerformedArea(item.area)
    setWorkPerformedGroupKey(item.groupCode)
    setWorkPerformedTaskValue(item.taskCode)
    setWorkPerformedQuantity(item.quantity > 0 ? String(item.quantity) : "")
    setWorkPerformedPaintGallons(item.paintGallonsUsed > 0 ? String(item.paintGallonsUsed) : "")
    setWorkPerformedPrimerGallons(item.primerGallonsUsed > 0 ? String(item.primerGallonsUsed) : "")
    setWorkPerformedPrimerSource(item.primerSource)
    setWorkPerformedLaborMinutes(item.laborMinutes > 0 ? String(item.laborMinutes) : "")
    setWorkPerformedCount(m.count != null && m.count > 0 ? String(m.count) : "")
    setWorkPerformedLinearFeet(m.linearFeet != null && m.linearFeet > 0 ? String(m.linearFeet) : "")
    setWorkPerformedStairFloors(m.stairFloors != null && m.stairFloors > 0 ? String(m.stairFloors) : "")
    setWorkPerformedDoorCount(m.doorCount != null && m.doorCount > 0 ? String(m.doorCount) : "")
    setWorkPerformedWindowCount(m.windowCount != null && m.windowCount > 0 ? String(m.windowCount) : "")
    setWorkPerformedHandrailCount(m.handrailCount != null && m.handrailCount > 0 ? String(m.handrailCount) : "")
    setWorkPerformedEditIndex(index)
  }

  const removeWorkPerformedActivity = (index: number) => {
    setWorkPerformedList((prev) => prev.filter((_, i) => i !== index))
    setWorkPerformedEditIndex((prev) => {
      if (prev === null) return null
      if (prev === index) return null
      if (prev > index) return prev - 1
      return prev
    })
  }

  const validateTmWorkPerformedDraft = (): string | null => {
    if (!tmWorkPerformedArea) return "Select an area."
    if (!tmWorkPerformedGroupKey) return "Select a group."
    if (!tmWorkPerformedTaskValue) return "Select a task."
    const groups = WORK_PERFORMED_STRUCTURE[tmWorkPerformedArea]
    const group = groups?.find((g) => g.key === tmWorkPerformedGroupKey)
    const task = group?.tasks.find((t) => t.value === tmWorkPerformedTaskValue)
    if (!group || !task) return "Select a valid group and task."
    const parseOptionalNum = (s: string): { valid: boolean; value: number } => {
      if (s === "") return { valid: true, value: 0 }
      const n = parseFloat(s)
      if (Number.isNaN(n) || n < 0) return { valid: false, value: 0 }
      return { valid: true, value: n }
    }
    const meta = task.meta ?? {}
    if (meta.showQuantity ?? true) {
      const q = parseOptionalNum(tmWorkPerformedQuantity)
      if (!q.valid) return "Quantity must be a number ≥ 0."
    }
    if (meta.showPaintGallons ?? true) {
      const p = parseOptionalNum(tmWorkPerformedPaintGallons)
      if (!p.valid) return "Paint gallons must be a number ≥ 0."
    }
    if (meta.showPrimerGallons ?? true) {
      const pr = parseOptionalNum(tmWorkPerformedPrimerGallons)
      if (!pr.valid) return "Primer gallons must be a number ≥ 0."
    }
    if (meta.showLaborMinutes) {
      const lm = parseOptionalNum(tmWorkPerformedLaborMinutes)
      if (!lm.valid) return "Labor must be a number ≥ 0."
      const countAfter = tmWorkPerformedEditIndex !== null ? tmWorkPerformedList.length : tmWorkPerformedList.length + 1
      if (countAfter >= 2 && lm.value <= 0) return "With multiple tasks, labor is required for each."
    }
    if (meta.showCount) { const c = parseOptionalNum(tmWorkPerformedCount); if (!c.valid) return "Count must be ≥ 0." }
    if (meta.showLinearFeet) { const lf = parseOptionalNum(tmWorkPerformedLinearFeet); if (!lf.valid) return "Linear feet must be ≥ 0." }
    if (meta.showStairFloors) { const sf = parseOptionalNum(tmWorkPerformedStairFloors); if (!sf.valid) return "Stair floors must be ≥ 0." }
    if (meta.showDoorCount) { const dc = parseOptionalNum(tmWorkPerformedDoorCount); if (!dc.valid) return "Door count must be ≥ 0." }
    if (meta.showWindowCount) { const wc = parseOptionalNum(tmWorkPerformedWindowCount); if (!wc.valid) return "Window count must be ≥ 0." }
    if (meta.showHandrailCount) { const hc = parseOptionalNum(tmWorkPerformedHandrailCount); if (!hc.valid) return "Handrail count must be ≥ 0." }
    return null
  }

  const buildDraftTmWorkPerformedEntry = (): SavedWorkPerformedEntry | null => {
    if (!tmWorkPerformedArea || !tmWorkPerformedGroupKey || !tmWorkPerformedTaskValue) return null
    const groups = WORK_PERFORMED_STRUCTURE[tmWorkPerformedArea]
    const group = groups.find((g) => g.key === tmWorkPerformedGroupKey)
    const task = group?.tasks.find((t) => t.value === tmWorkPerformedTaskValue)
    const groupLabel = group?.label ?? tmWorkPerformedGroupKey
    const taskLabel = task?.label ?? tmWorkPerformedTaskValue
    const parseNum = (s: string) => (s === "" ? 0 : Math.max(0, parseFloat(s) || 0))
    const count = parseNum(tmWorkPerformedCount)
    const linearFeet = parseNum(tmWorkPerformedLinearFeet)
    const stairFloors = parseNum(tmWorkPerformedStairFloors)
    const doorCount = parseNum(tmWorkPerformedDoorCount)
    const windowCount = parseNum(tmWorkPerformedWindowCount)
    const handrailCount = parseNum(tmWorkPerformedHandrailCount)
    const measurements: WorkPerformedEntry["measurements"] = (() => {
      const m: NonNullable<WorkPerformedEntry["measurements"]> = {}
      if (count > 0) m.count = count
      if (linearFeet > 0) m.linearFeet = linearFeet
      if (stairFloors > 0) m.stairFloors = stairFloors
      if (doorCount > 0) m.doorCount = doorCount
      if (windowCount > 0) m.windowCount = windowCount
      if (handrailCount > 0) m.handrailCount = handrailCount
      return Object.keys(m).length > 0 ? m : undefined
    })()
    return {
      area: tmWorkPerformedArea,
      groupCode: tmWorkPerformedGroupKey,
      groupLabel,
      taskCode: tmWorkPerformedTaskValue,
      taskLabel,
      quantity: parseNum(tmWorkPerformedQuantity),
      paintGallonsUsed: parseNum(tmWorkPerformedPaintGallons),
      primerGallonsUsed: parseNum(tmWorkPerformedPrimerGallons),
      primerSource: tmWorkPerformedPrimerSource,
      laborMinutes: tmWorkPerformedLaborMinutes === "" ? 0 : Math.max(0, parseFloat(tmWorkPerformedLaborMinutes) || 0),
      measurements,
    }
  }

  const addTmWorkPerformedActivity = () => {
    const error = validateTmWorkPerformedDraft()
    if (error) {
      setTmWorkPerformedValidationError(error)
      toast({ title: "Invalid activity", description: error, variant: "destructive" })
      return
    }
    setTmWorkPerformedValidationError(null)
    const entry = buildDraftTmWorkPerformedEntry()
    if (!entry) return
    if (tmWorkPerformedEditIndex !== null) {
      setTmWorkPerformedList((prev) => prev.map((item, i) => (i === tmWorkPerformedEditIndex ? entry : item)))
      setTmWorkPerformedEditIndex(null)
    } else {
      setTmWorkPerformedList((prev) => [...prev, entry])
    }
    setTmWorkPerformedTaskValue("")
    setTmWorkPerformedQuantity("")
    setTmWorkPerformedPaintGallons("")
    setTmWorkPerformedPrimerGallons("")
    setTmWorkPerformedPrimerSource("stock")
    setTmWorkPerformedLaborMinutes("")
    setTmWorkPerformedCount("")
    setTmWorkPerformedLinearFeet("")
    setTmWorkPerformedStairFloors("")
    setTmWorkPerformedDoorCount("")
    setTmWorkPerformedWindowCount("")
    setTmWorkPerformedHandrailCount("")
  }

  const startEditingTmWorkPerformed = (index: number) => {
    const item = tmWorkPerformedList[index]
    if (!item) return
    const m = item.measurements ?? {}
    setTmWorkPerformedArea(item.area)
    setTmWorkPerformedGroupKey(item.groupCode)
    setTmWorkPerformedTaskValue(item.taskCode)
    setTmWorkPerformedQuantity(item.quantity > 0 ? String(item.quantity) : "")
    setTmWorkPerformedPaintGallons(item.paintGallonsUsed > 0 ? String(item.paintGallonsUsed) : "")
    setTmWorkPerformedPrimerGallons(item.primerGallonsUsed > 0 ? String(item.primerGallonsUsed) : "")
    setTmWorkPerformedPrimerSource(item.primerSource)
    setTmWorkPerformedLaborMinutes(item.laborMinutes > 0 ? String(item.laborMinutes) : "")
    setTmWorkPerformedCount(m.count != null && m.count > 0 ? String(m.count) : "")
    setTmWorkPerformedLinearFeet(m.linearFeet != null && m.linearFeet > 0 ? String(m.linearFeet) : "")
    setTmWorkPerformedStairFloors(m.stairFloors != null && m.stairFloors > 0 ? String(m.stairFloors) : "")
    setTmWorkPerformedDoorCount(m.doorCount != null && m.doorCount > 0 ? String(m.doorCount) : "")
    setTmWorkPerformedWindowCount(m.windowCount != null && m.windowCount > 0 ? String(m.windowCount) : "")
    setTmWorkPerformedHandrailCount(m.handrailCount != null && m.handrailCount > 0 ? String(m.handrailCount) : "")
    setTmWorkPerformedEditIndex(index)
  }

  const removeTmWorkPerformedActivity = (index: number) => {
    setTmWorkPerformedList((prev) => prev.filter((_, i) => i !== index))
    setTmWorkPerformedEditIndex((prev) => (prev === null ? null : prev === index ? null : prev > index ? prev - 1 : prev))
  }

  const handleSubmit = async () => {
    if (!jobId) {
      toast({ title: "Validation Error", description: "Please select a job", variant: "destructive" })
      return
    }
    const trimmedPainterAddress = painterAddress.trim()
    if (isTmJob && trimmedPainterAddress.length < 5) {
      toast({ title: "Project address required", description: "Enter the project address for T&M jobs before submitting.", variant: "destructive" })
      return
    }
    const validPainters = customerTimeEntry.painters.filter((p) => {
      if (!p.painterId || !p.startTime || !p.endTime) return false
      const startM = parseTimeToMinutes(p.startTime)
      const endM = parseTimeToMinutes(p.endTime)
      return endM > startM
    })
    if (validPainters.length === 0) {
      toast({ title: "Validation Error", description: "Add at least one painter with From and To times (To must be after From).", variant: "destructive" })
      return
    }
    const painterIds = new Set(validPainters.map((p) => p.painterId))
    if (painterIds.size !== validPainters.length) {
      toast({ title: "Validation Error", description: "Each painter can only appear once", variant: "destructive" })
      return
    }

    // Work Performed: when multiple tasks exist, labor is required for each task that supports it (V1 rule).
    if (workPerformedList.length > 1) {
      for (let i = 0; i < workPerformedList.length; i++) {
        const item = workPerformedList[i]
        const groups = WORK_PERFORMED_STRUCTURE[item.area]
        const group = groups?.find((g) => g.key === item.groupCode)
        const task = group?.tasks.find((t) => t.value === item.taskCode)
        const showLabor = task?.meta?.showLaborMinutes ?? true
        if (showLabor && (item.laborMinutes == null || item.laborMinutes <= 0)) {
          toast({
            title: "Labor time required",
            description: "With multiple work performed tasks, each task needs labor time. Add labor hours to all tasks that support it.",
            variant: "destructive",
          })
          return
        }
      }
    }

    setIsSubmitting(true)
    try {
      const tmValidPainters = tmExtraWorkEnabled && tmTimeEntry
        ? tmTimeEntry.painters.filter((p) => {
          if (!p.painterId || !p.startTime || !p.endTime) return false
          return parseTimeToMinutes(p.endTime) > parseTimeToMinutes(p.startTime)
        })
        : []
      const tmHoursTotal = tmExtraWorkEnabled
        ? tmValidPainters.reduce((sum, p) => sum + computeHours(p.startTime, p.endTime, p.lunchDuration), 0)
        : 0

      // Primary structured work record: Work Performed (activities, quantities, materials). Notes are optional supplementary.
      const workPerformedPayload = workPerformedList.map((wp, index) => ({
        area: wp.area,
        groupCode: wp.groupCode,
        groupLabel: wp.groupLabel,
        taskCode: wp.taskCode,
        taskLabel: wp.taskLabel,
        quantity: wp.quantity,
        paintGallonsUsed: wp.paintGallonsUsed,
        primerGallonsUsed: wp.primerGallonsUsed,
        primerSource: wp.primerSource,
        laborMinutes: wp.laborMinutes,
        measurements: wp.measurements ?? {},
        sortOrder: index,
      }))
      const mainEntry = {
        jobId,
        jobName: projects?.find((j) => j.id === jobId)?.name ?? "",
        date,
        notes: notes || "",
        changeOrder: "",
        sundryItems: sundryItems.filter((i) => i.quantity > 0),
        workPerformed: workPerformedPayload,
        painters: validPainters.map((p) => {
          const { lunchStart, lunchEnd } = durationToLunchStartEnd(
            p.startTime,
            p.endTime,
            parseInt(p.lunchDuration, 10) || 0
          )
          return {
            painterId: p.painterId,
            painterName: p.painterName,
            startTime: p.startTime,
            endTime: p.endTime,
            lunchStart,
            lunchEnd,
          }
        }),
      }

      const tmEntries = tmExtraWorkEnabled && tmTimeEntry
        ? [{
          jobId: mainEntry.jobId,
          jobName: mainEntry.jobName,
          date: mainEntry.date,
          notes: (tmTimeEntry.notes ?? "").trim(),
          changeOrder: "",
          displayLabel: (tmTimeEntry.notes ?? "").trim()
            ? `T&M Extra Work - ${(tmTimeEntry.notes ?? "").trim()}`
            : "T&M Extra Work #1",
          sundryItems: tmSundryItems.filter((i) => i.quantity > 0),
          workPerformed: tmWorkPerformedList.map((wp, index) => ({
            area: wp.area,
            groupCode: wp.groupCode,
            groupLabel: wp.groupLabel,
            taskCode: wp.taskCode,
            taskLabel: wp.taskLabel,
            quantity: wp.quantity,
            paintGallonsUsed: wp.paintGallonsUsed,
            primerGallonsUsed: wp.primerGallonsUsed,
            primerSource: wp.primerSource,
            laborMinutes: wp.laborMinutes,
            measurements: wp.measurements ?? {},
            sortOrder: index,
          })),
          painters: tmValidPainters.map((p) => {
            const { lunchStart, lunchEnd } = durationToLunchStartEnd(
              p.startTime,
              p.endTime,
              parseInt(p.lunchDuration, 10) || 0
            )
            return {
              painterId: p.painterId,
              painterName: p.painterName,
              startTime: p.startTime,
              endTime: p.endTime,
              lunchStart,
              lunchEnd,
            }
          }),
        }]
        : []

      const payload = {
        mainEntry,
        tmEntries,
        painterAddress: isTmJob ? trimmedPainterAddress : undefined,
      }
      const res = await fetch("/api/time-entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(selectedForeman?.id && { "X-Selected-Foreman-Id": selectedForeman.id }),
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to save timesheet")
      }
      queryClient.invalidateQueries({ queryKey: ["time-entries"], refetchType: "active" })
      queryClient.invalidateQueries({ queryKey: ["weeklyHours"], refetchType: "active" })
      toast({ title: "Timesheet Submitted", description: "Your timesheet has been saved.", duration: 3000 })
      router.push("/")
      router.refresh()
    } catch (e) {
      toast({
        title: "Submission Failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      })
      setIsSubmitting(false)
    }
  }

  const selectedJobName = jobId ? (projects.find((j) => j.id === jobId)?.name ?? "Selected job") : "No job selected"
  const isTmJob = /T\s*&\s*M/i.test(selectedJobName)
  const trimmedPainterAddressForValidation = painterAddress.trim()
  const isFormValid =
    jobId &&
    customerTimeEntry.painters.some((p) => {
      if (!p.painterId || !p.startTime || !p.endTime) return false
      return parseTimeToMinutes(p.endTime) > parseTimeToMinutes(p.startTime)
    }) &&
    customerTimeEntry.painters.filter((p) => p.painterId).length === new Set(customerTimeEntry.painters.filter((p) => p.painterId).map((p) => p.painterId)).size &&
    (!isTmJob || trimmedPainterAddressForValidation.length >= 5)

  const customerHoursTotal = customerTimeEntry.painters.reduce((sum, p) => {
    if (!p.painterId || !p.startTime || !p.endTime) return sum
    return sum + computeHours(p.startTime, p.endTime, p.lunchDuration)
  }, 0)
  const tmHoursTotalPreview = (tmTimeEntry?.painters ?? []).reduce((sum, p) => {
    if (!p.painterId || !p.startTime || !p.endTime) return sum
    return sum + computeHours(p.startTime, p.endTime, p.lunchDuration)
  }, 0)

  const hasTmData =
    tmExtraWorkEnabled &&
    (() => {
      const validPainters = (tmTimeEntry?.painters ?? []).filter(
        (p) => p.painterId && p.startTime && p.endTime && parseTimeToMinutes(p.endTime) > parseTimeToMinutes(p.startTime)
      )
      const hasSundries = (tmSundryItems ?? []).some((i) => i.quantity > 0)
      const hasWork = (tmWorkPerformedList ?? []).length > 0
      return validPainters.length > 0 || hasSundries || hasWork
    })()

  const clearTmData = () => {
    setTmTimeEntry({ painters: [], notes: "" })
    setTmSundryItems([])
    setTmWorkPerformedList([])
    setTmWorkPerformedArea("")
    setTmWorkPerformedGroupKey("")
    setTmWorkPerformedTaskValue("")
    setTmWorkPerformedQuantity("")
    setTmWorkPerformedPaintGallons("")
    setTmWorkPerformedPrimerGallons("")
    setTmWorkPerformedPrimerSource("stock")
    setTmWorkPerformedLaborMinutes("")
    setTmWorkPerformedCount("")
    setTmWorkPerformedLinearFeet("")
    setTmWorkPerformedStairFloors("")
    setTmWorkPerformedDoorCount("")
    setTmWorkPerformedWindowCount("")
    setTmWorkPerformedHandrailCount("")
    setTmWorkPerformedEditIndex(null)
    setTmWorkPerformedValidationError(null)
    setTmDetailsOpen(false)
  }

  return (
    <Layout>
      <div className="bg-secondary text-white p-4 flex items-center sticky top-0 z-20 shadow-md">
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="Go back"
          title="Go back"
          className="mr-4 text-gray-300 hover:text-white px-2 py-1 cursor-pointer flex items-center gap-1 text-sm font-medium"
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
        <h1 className="text-lg font-bold">New Timesheet</h1>
      </div>

      {/* Tabs 1–3: Crew & Time | Sundries | Work Performed. Single component state — switching tabs does not lose data. */}
      <div className="bg-white sticky top-[60px] z-10 border-b border-gray-200">
        <div className="max-w-2xl md:max-w-none xl:max-w-2xl mx-auto flex px-2">
          <button
            onClick={() => setActiveTab("crew")}
            className={`flex-1 py-3 text-center text-sm font-semibold whitespace-nowrap transition-colors border-b-[2.5px] -mb-px ${activeTab === "crew"
              ? "text-primary border-primary"
              : "text-gray-500 border-transparent hover:text-gray-700"
              }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <Clock size={18} className="shrink-0" /> Crew &amp; Time
            </span>
          </button>
          <button
            onClick={() => setActiveTab("sundry")}
            className={`flex-1 py-3 text-center text-sm font-semibold whitespace-nowrap transition-colors border-b-[2.5px] -mb-px ${activeTab === "sundry"
              ? "text-primary border-primary"
              : "text-gray-500 border-transparent hover:text-gray-700"
              }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <Package size={18} className="shrink-0" /> Sundries
            </span>
          </button>
          <button
            onClick={() => setActiveTab("work")}
            className={`flex-1 py-3 text-center text-sm font-semibold whitespace-nowrap transition-colors border-b-[2.5px] -mb-px ${activeTab === "work"
              ? "text-primary border-primary"
              : "text-gray-500 border-transparent hover:text-gray-700"
              }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <ClipboardList size={18} className="shrink-0" /> Work Performed
            </span>
          </button>
        </div>
      </div>

      {/* max-h keeps content above the fixed bottom nav; overflow-y-auto makes this the scroll container */}
      <main className="flex-1 min-h-0 overflow-y-auto max-h-[calc(100vh-11rem)]">
        <div className="p-4 md:p-6 xl:p-4 space-y-6 pb-24 max-w-2xl md:max-w-none xl:max-w-2xl mx-auto" style={{ paddingBottom: "max(6rem, calc(5rem + env(safe-area-inset-bottom, 0px)))" }}>
          {activeTab === "crew" && (
            <>
              {(() => {
                const customerWorkContent = (
                  <>
                    <section>
                      <h2 className="text-lg font-bold text-gray-800 mb-4">Job &amp; Date</h2>
                      <div className="space-y-4">
                        <div>
                          <Label className="text-gray-700 font-semibold mb-2 block">Job *</Label>
                          {isLoadingProjects ? (
                            <div className="flex items-center gap-2 p-3 border rounded-md bg-gray-50 text-gray-500">
                              <Loader2 className="h-4 w-4 animate-spin" /> Loading jobs...
                            </div>
                          ) : isProjectsError ? (
                            <div className="p-3 border rounded-md bg-amber-50 border-amber-200 text-amber-800 text-sm">
                              Could not load jobs. Check your connection and that the app can reach the API. Refresh to try again.
                            </div>
                          ) : !projects?.length ? (
                            <div className="p-3 border rounded-md bg-gray-50 text-gray-600 text-sm">
                              No jobs in list. Sync projects from Zoho to Supabase and ensure they have status &quot;Project Accepted&quot;.
                            </div>
                          ) : (
                            <Popover open={jobSelectOpen} onOpenChange={setJobSelectOpen}>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white text-left text-sm font-medium text-gray-800 focus:ring-2 focus:ring-primary outline-none flex items-center justify-between gap-2"
                                >
                                  <span className="truncate">
                                    {jobId ? (projects.find((j) => j.id === jobId)?.name ?? "Select a job") : "Select a job"}
                                  </span>
                                  <ChevronDown className="shrink-0 text-gray-500" size={18} />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                                <Command>
                                  <CommandInput placeholder="Search jobs..." className="h-11" />
                                  <CommandList>
                                    <CommandEmpty>No job found.</CommandEmpty>
                                    <CommandGroup>
                                      {projects.map((j) => (
                                        <CommandItem
                                          key={j.id}
                                          value={j.name}
                                          onSelect={() => {
                                            setJobId(j.id)
                                            setJobSelectOpen(false)
                                          }}
                                        >
                                          {j.name}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                        <div>
                          <Label className="text-gray-700 font-semibold mb-2 block">Date *</Label>
                          <div className="relative">
                            <input
                              type="date"
                              className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none"
                              value={date}
                              onChange={(e) => setDate(e.target.value)}
                            />
                            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                          </div>
                        </div>
                        {isTmJob && (
                          <div>
                            <TextAreaField
                              id="project-address"
                              label="Project Address *"
                              placeholder="Enter the project’s mailing address (street, city, state, zip)."
                              value={painterAddress}
                              onChange={(e) => setPainterAddress(e.target.value)}
                              rows={3}
                              required
                              className="w-full"
                            />
                          </div>
                        )}
                      </div>
                    </section>

                    {renderCrewTimeEntrySection({
                      title: "Crew",
                      crewLabel: "Crew 1",
                      crewHelpText: "Tap to select painters. Each person can have individual start/end times below.",
                      paintersState: customerTimeEntry.painters,
                      setPaintersState: (updater) =>
                        setCustomerTimeEntry((prev) => ({
                          ...prev,
                          painters: typeof updater === "function" ? updater(prev.painters) : updater,
                        })),
                      hoursPrefix: "Hours",
                    })}

                    <section>
                      <h2 className="text-lg font-bold text-gray-800 mb-4">Additional notes (if applicable)</h2>
                      <TextAreaField
                        id="notes"
                        label="Notes"
                        placeholder="Any additional notes for this timesheet..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        className="w-full"
                      />
                    </section>
                  </>
                )

                if (!tmExtraWorkEnabled) {
                  return customerWorkContent
                }

                return customerWorkContent
              })()}

              <div className={tmExtraWorkEnabled ? "" : "-mt-2"}>
                <label className={`flex items-center justify-between gap-3 cursor-pointer ${tmExtraWorkEnabled ? "mb-3" : ""}`}>
                  <span className="text-lg font-bold text-gray-800">T&amp;M Extra Work</span>
                  <input
                    type="checkbox"
                    checked={tmExtraWorkEnabled}
                    disabled={!jobId}
                    onChange={(e) => {
                      const next = e.target.checked
                      if (next && !jobId) {
                        toast({
                          title: "Select a job first",
                          description: "Choose a job before enabling T&M Extra Work.",
                          variant: "destructive",
                        })
                        return
                      }
                      setTmExtraWorkEnabled(next)
                      if (next) {
                        setTmDetailsOpen(true)
                        setTmActiveTab("crew")
                        setTmTimeEntry((prev) => prev ?? { painters: [], notes: "" })
                      } else {
                        setCustomerWorkOpen(true)
                        setTmTimeEntry(null)
                        setTmSundryItems([])
                        setTmWorkPerformedList([])
                        setTmDetailsOpen(false)
                      }
                    }}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </label>

                {tmExtraWorkEnabled && !hasTmData && (
                  <button
                    type="button"
                    onClick={() => setTmDetailsOpen(true)}
                    className="mt-2 inline-flex items-center justify-center px-4 py-2 rounded-md border border-primary text-primary text-sm font-semibold bg-primary/5 hover:bg-primary/10"
                  >
                    <ClipboardList size={16} className="mr-2" />
                    Add T&amp;M Details
                  </button>
                )}
                {hasTmData && (
                  <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-gray-800">T&amp;M Extra Work</h3>
                        <p className="text-xs text-gray-600 mt-1">
                          {(tmTimeEntry?.painters ?? []).filter((p) => p.painterId && p.startTime && p.endTime).length} painter(s) • {tmHoursTotalPreview.toFixed(1)} hrs
                          {(tmSundryItems ?? []).some((i) => i.quantity > 0) && " • Sundries"}
                          {(tmWorkPerformedList ?? []).length > 0 && ` • ${tmWorkPerformedList.length} task(s)`}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => setTmDetailsOpen(true)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={clearTmData}
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          aria-label="Remove T&M"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </>
          )}

          {activeTab === "work" && (
            <section>
              <h2 className="text-lg font-bold text-gray-800 mb-1">Work Performed</h2>
              {/* When jobProductionReference is set (e.g. from CRM), reference metrics can be shown or used as defaults here. */}
              <p className="text-sm text-gray-500 mb-4">Primary work record for this timesheet. Add tasks and quantities below.</p>
              <Label className="text-gray-700 font-semibold mb-2 block">Area</Label>
              <div className="flex rounded-lg border border-gray-300 bg-gray-100 p-1 gap-0">
                <button
                  type="button"
                  onClick={() => {
                    setWorkPerformedArea("interior")
                    setWorkPerformedGroupKey("")
                    setWorkPerformedTaskValue("")
                    setWorkPerformedQuantity("")
                    setWorkPerformedPaintGallons("")
                    setWorkPerformedPrimerGallons("")
                    setWorkPerformedPrimerSource("stock")
                    setWorkPerformedEditIndex(null)
                    setWorkPerformedValidationError(null)
                  }}
                  className={`flex-1 py-3 px-4 rounded-md text-sm font-semibold transition-colors ${workPerformedArea === "interior" ? "bg-primary text-white shadow-sm" : "text-gray-600 hover:text-gray-800"}`}
                >
                  Interior
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWorkPerformedArea("exterior")
                    setWorkPerformedGroupKey("")
                    setWorkPerformedTaskValue("")
                    setWorkPerformedQuantity("")
                    setWorkPerformedPaintGallons("")
                    setWorkPerformedPrimerGallons("")
                    setWorkPerformedPrimerSource("stock")
                    setWorkPerformedEditIndex(null)
                    setWorkPerformedValidationError(null)
                  }}
                  className={`flex-1 py-3 px-4 rounded-md text-sm font-semibold transition-colors ${workPerformedArea === "exterior" ? "bg-primary text-white shadow-sm" : "text-gray-600 hover:text-gray-800"}`}
                >
                  Exterior
                </button>
              </div>
              {workPerformedArea ? (
                <div className="mt-4 space-y-4">
                  {workPerformedEditIndex !== null && (
                    <p className="text-sm text-primary font-medium">Editing saved task. Update fields below and tap Update Task.</p>
                  )}
                  <div>
                    <Label className="text-gray-700 font-semibold mb-2 block">Group</Label>
                    <select
                      value={workPerformedGroupKey}
                      onChange={(e) => {
                        setWorkPerformedGroupKey(e.target.value)
                        setWorkPerformedTaskValue("")
                        setWorkPerformedQuantity("")
                        setWorkPerformedPaintGallons("")
                        setWorkPerformedPrimerGallons("")
                        setWorkPerformedPrimerSource("stock")
                        setWorkPerformedCount("")
                        setWorkPerformedLinearFeet("")
                        setWorkPerformedStairFloors("")
                        setWorkPerformedDoorCount("")
                        setWorkPerformedWindowCount("")
                        setWorkPerformedHandrailCount("")
                        setWorkPerformedValidationError(null)
                      }}
                      className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800"
                    >
                      <option value="">Select group</option>
                      {WORK_PERFORMED_STRUCTURE[workPerformedArea].map((group) => (
                        <option key={group.key} value={group.key}>
                          {group.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {workPerformedGroupKey && (
                    <div>
                      <Label className="text-gray-700 font-semibold mb-2 block">Task</Label>
                      <select
                        value={workPerformedTaskValue}
                        onChange={(e) => {
                          setWorkPerformedTaskValue(e.target.value)
                          setWorkPerformedQuantity("")
                          setWorkPerformedPaintGallons("")
                          setWorkPerformedPrimerGallons("")
                          setWorkPerformedPrimerSource("stock")
                          setWorkPerformedLaborMinutes("")
                          setWorkPerformedCount("")
                          setWorkPerformedLinearFeet("")
                          setWorkPerformedStairFloors("")
                          setWorkPerformedDoorCount("")
                          setWorkPerformedWindowCount("")
                          setWorkPerformedHandrailCount("")
                          setWorkPerformedValidationError(null)
                        }}
                        className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800"
                      >
                        <option value="">Select task</option>
                        {WORK_PERFORMED_STRUCTURE[workPerformedArea]
                          .find((g) => g.key === workPerformedGroupKey)
                          ?.tasks.map((task) => (
                            <option key={task.value} value={task.value}>
                              {task.label}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                  {workPerformedTaskValue && (
                    <>
                      {(() => {
                        const selectedGroup = WORK_PERFORMED_STRUCTURE[workPerformedArea].find(
                          (g) => g.key === workPerformedGroupKey
                        )
                        const selectedTask = selectedGroup?.tasks.find((t) => t.value === workPerformedTaskValue)
                        const meta = selectedTask?.meta ?? {}
                        const showQuantity = meta.showQuantity ?? true
                        const quantityLabel =
                          meta.quantityLabel ?? "Quantity of work (if applicable)"
                        const showPaintGallons = meta.showPaintGallons ?? true
                        const showPrimerGallons = meta.showPrimerGallons ?? true
                        const showLaborMinutes = meta.showLaborMinutes ?? true
                        const showLinearFeet = meta.showLinearFeet ?? false
                        const linearFeetLabel = meta.linearFeetLabel ?? "Linear feet (if applicable)"
                        const showStairFloors = meta.showStairFloors ?? false
                        const stairFloorsLabel = meta.stairFloorsLabel ?? "Stair floors (if applicable)"
                        // Future: showCount, showDoorCount, showWindowCount — same pattern; add inputs when tasks use them.

                        return (
                          <div className="space-y-3">
                            {showQuantity && (
                              <div>
                                <Label className="text-gray-700 font-semibold mb-1 block">
                                  {quantityLabel}
                                </Label>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step={0.01}
                                  placeholder="0"
                                  value={workPerformedQuantity}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    if (v === "") {
                                      setWorkPerformedQuantity("")
                                      setWorkPerformedValidationError(null)
                                      return
                                    }
                                    const n = parseFloat(v)
                                    if (!Number.isNaN(n) && n < 0) return
                                    setWorkPerformedQuantity(v)
                                    setWorkPerformedValidationError(null)
                                  }}
                                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800"
                                />
                              </div>
                            )}

                            {showPaintGallons && (
                              <div>
                                <Label className="text-gray-700 font-semibold mb-1 block">
                                  Paint gallons used (if applicable)
                                </Label>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step={0.01}
                                  placeholder="0"
                                  value={workPerformedPaintGallons}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    if (v === "") {
                                      setWorkPerformedPaintGallons("")
                                      setWorkPerformedValidationError(null)
                                      return
                                    }
                                    const n = parseFloat(v)
                                    if (!Number.isNaN(n) && n < 0) return
                                    setWorkPerformedPaintGallons(v)
                                    setWorkPerformedValidationError(null)
                                  }}
                                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800"
                                />
                              </div>
                            )}

                            {showPrimerGallons && (
                              <div>
                                <Label className="text-gray-700 font-semibold mb-1 block">
                                  Primer gallons used (if applicable)
                                </Label>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step={0.01}
                                  placeholder="0"
                                  value={workPerformedPrimerGallons}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    if (v === "") {
                                      setWorkPerformedPrimerGallons("")
                                      setWorkPerformedValidationError(null)
                                      return
                                    }
                                    const n = parseFloat(v)
                                    if (!Number.isNaN(n) && n < 0) return
                                    setWorkPerformedPrimerGallons(v)
                                    setWorkPerformedValidationError(null)
                                  }}
                                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800"
                                />
                                <div className="flex rounded-md border border-gray-300 bg-gray-100 p-0.5 mt-2 w-full max-w-[200px]">
                                  <button
                                    type="button"
                                    onClick={() => setWorkPerformedPrimerSource("stock")}
                                    className={`flex-1 py-2 px-3 rounded text-xs font-semibold transition-colors ${workPerformedPrimerSource === "stock"
                                      ? "bg-primary text-white"
                                      : "text-gray-600"
                                      }`}
                                  >
                                    Stock
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setWorkPerformedPrimerSource("retail")}
                                    className={`flex-1 py-2 px-3 rounded text-xs font-semibold transition-colors ${workPerformedPrimerSource === "retail"
                                      ? "bg-primary text-white"
                                      : "text-gray-600"
                                      }`}
                                  >
                                    Purchased
                                  </button>
                                </div>
                              </div>
                            )}

                            {showLaborMinutes && (
                              <div>
                                <Label className="text-gray-700 font-semibold mb-1 block">
                                  {(
                                    workPerformedEditIndex !== null
                                      ? workPerformedList.length >= 2
                                      : workPerformedList.length >= 1
                                  )
                                    ? "Labor man-hours (required with multiple tasks)"
                                    : "Labor man-hours (if applicable)"}
                                </Label>
                                <select
                                  value={workPerformedLaborMinutes}
                                  onChange={(e) => {
                                    setWorkPerformedLaborMinutes(e.target.value)
                                    setWorkPerformedValidationError(null)
                                  }}
                                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800"
                                >
                                  <option value="">Select hours</option>
                                  {LABOR_MAN_HOUR_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {showLinearFeet && (
                              <div>
                                <Label className="text-gray-700 font-semibold mb-1 block">
                                  {linearFeetLabel}
                                </Label>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step={0.01}
                                  placeholder="0"
                                  value={workPerformedLinearFeet}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    if (v === "") {
                                      setWorkPerformedLinearFeet("")
                                      setWorkPerformedValidationError(null)
                                      return
                                    }
                                    const n = parseFloat(v)
                                    if (!Number.isNaN(n) && n < 0) return
                                    setWorkPerformedLinearFeet(v)
                                    setWorkPerformedValidationError(null)
                                  }}
                                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800"
                                />
                              </div>
                            )}

                            {showStairFloors && (
                              <div>
                                <Label className="text-gray-700 font-semibold mb-1 block">
                                  {stairFloorsLabel}
                                </Label>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  step={1}
                                  placeholder="0"
                                  value={workPerformedStairFloors}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    if (v === "") {
                                      setWorkPerformedStairFloors("")
                                      setWorkPerformedValidationError(null)
                                      return
                                    }
                                    const n = parseFloat(v)
                                    if (!Number.isNaN(n) && n < 0) return
                                    setWorkPerformedStairFloors(v)
                                    setWorkPerformedValidationError(null)
                                  }}
                                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800"
                                />
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </>
                  )}
                  {workPerformedValidationError && (
                    <p className="text-sm text-red-600 font-medium" role="alert">
                      {workPerformedValidationError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={addWorkPerformedActivity}
                    className="w-full py-3 px-4 rounded-lg border-2 border-primary bg-primary/10 text-primary font-semibold text-sm hover:bg-primary/20 transition-colors"
                  >
                    {workPerformedEditIndex !== null ? "Update Task" : "Add Task"}
                  </button>
                  {workPerformedList.length > 0 && (
                    <div className="pt-2">
                      <h3 className="text-base font-bold text-gray-800 mb-3">Saved activities ({workPerformedList.length})</h3>
                      <div className="space-y-3">
                        {workPerformedList.map((item, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm relative"
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex flex-wrap items-baseline gap-2 min-w-0">
                                <span className="text-xs font-semibold uppercase text-gray-500">
                                  {item.area === "interior" ? "Interior" : "Exterior"}
                                </span>
                                <span className="text-gray-500 text-xs">•</span>
                                <span className="text-gray-700 font-medium">{item.groupLabel}</span>
                                <span className="text-gray-500 text-xs">•</span>
                                <span className="text-gray-800 font-semibold">{item.taskLabel}</span>
                              </div>
                              <div className="flex shrink-0 gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => startEditingWorkPerformed(idx)}
                                  className="p-1.5 rounded-md text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors"
                                  aria-label="Edit activity"
                                >
                                  <Pencil size={18} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeWorkPerformedActivity(idx)}
                                  className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  aria-label="Remove activity"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>
                            <dl className="text-sm text-gray-600 space-y-0.5">
                              {item.quantity > 0 && (
                                <div><dt className="inline font-medium text-gray-500">Quantity: </dt><dd className="inline">{item.quantity}</dd></div>
                              )}
                              {item.paintGallonsUsed > 0 && (
                                <div><dt className="inline font-medium text-gray-500">Paint: </dt><dd className="inline">{item.paintGallonsUsed} gal</dd></div>
                              )}
                              {item.primerGallonsUsed > 0 && (
                                <div><dt className="inline font-medium text-gray-500">Primer: </dt><dd className="inline">{item.primerGallonsUsed} gal</dd></div>
                              )}
                              <div><dt className="inline font-medium text-gray-500">Primer source: </dt><dd className="inline capitalize">{item.primerSource}</dd></div>
                              {item.laborMinutes > 0 && (
                                <div><dt className="inline font-medium text-gray-500">Labor: </dt><dd className="inline">{formatHoursText(item.laborMinutes)}</dd></div>
                              )}
                              {item.measurements?.count != null && item.measurements.count > 0 && (
                                <div><dt className="inline font-medium text-gray-500">Count: </dt><dd className="inline">{item.measurements.count}</dd></div>
                              )}
                              {item.measurements?.linearFeet != null && item.measurements.linearFeet > 0 && (
                                <div><dt className="inline font-medium text-gray-500">Linear feet: </dt><dd className="inline">{item.measurements.linearFeet}</dd></div>
                              )}
                              {item.measurements?.stairFloors != null && item.measurements.stairFloors > 0 && (
                                <div><dt className="inline font-medium text-gray-500">Stair floors: </dt><dd className="inline">{item.measurements.stairFloors}</dd></div>
                              )}
                              {item.measurements?.doorCount != null && item.measurements.doorCount > 0 && (
                                <div><dt className="inline font-medium text-gray-500">Doors: </dt><dd className="inline">{item.measurements.doorCount}</dd></div>
                              )}
                              {item.measurements?.windowCount != null && item.measurements.windowCount > 0 && (
                                <div><dt className="inline font-medium text-gray-500">Windows: </dt><dd className="inline">{item.measurements.windowCount}</dd></div>
                              )}
                              {item.measurements?.handrailCount != null && item.measurements.handrailCount > 0 && (
                                <div><dt className="inline font-medium text-gray-500">Handrails: </dt><dd className="inline">{item.measurements.handrailCount}</dd></div>
                              )}
                            </dl>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-500">Select a category to continue.</p>
              )}
            </section>
          )}

          {activeTab === "sundry" && (
            <>
              <section>
                <h2 className="text-lg font-bold text-gray-800 mb-4">Sundries Used (for this timesheet)</h2>
                <p className="text-sm text-gray-500 mb-4">Add quantities used. Submit from the Work Performed tab.</p>
                <div className="space-y-3">
                  {SUNDRY_ITEMS.map((itemName) => {
                    const q = getItemQuantity(sundryItems, itemName)
                    return (
                      <div
                        key={itemName}
                        className={`flex items-center justify-between p-4 rounded-lg border ${q > 0 ? "bg-primary/5 border-primary/30" : "bg-white border-gray-200"}`}
                      >
                        <span className={`font-medium ${q > 0 ? "text-primary" : "text-gray-700"}`}>{itemName}</span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => decrementSundry(setSundryItems, itemName)}
                            disabled={q === 0}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Minus size={18} />
                          </button>
                          <span className={`w-8 text-center font-bold ${q > 0 ? "text-primary" : "text-gray-400"}`}>{q}</span>
                          <button
                            type="button"
                            onClick={() => incrementSundry(setSundryItems, itemName)}
                            className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90"
                          >
                            <Plus size={18} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            </>
          )}

          {activeTab === "work" && (
            <section className="pt-2 border-t border-gray-200">
              <div className="flex">
                <PrimaryButton
                  onClick={handleSubmit}
                  disabled={!isFormValid || isSubmitting}
                  className="flex-1 h-12 text-base shadow-md"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin inline" /> Submitting...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 inline" size={20} /> Submit Timesheet
                    </>
                  )}
                </PrimaryButton>
              </div>
            </section>
          )}
        </div>
      </main>
      {tmDetailsOpen && tmExtraWorkEnabled && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-stretch justify-center">
          <div className="relative bg-white w-full max-w-2xl md:max-w-xl lg:max-w-2xl h-full md:h-[90vh] md:mt-4 md:rounded-xl shadow-lg flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">T&amp;M Extra Work</p>
                <p className="text-xs text-gray-500">
                  {selectedJobName} • {date || "No date"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTmDetailsOpen(false)}
                className="text-gray-500 hover:text-gray-700 text-sm font-medium"
              >
                Close
              </button>
            </div>

            <div className="bg-white border-b border-gray-200">
              <div className="flex px-2">
                <button
                  type="button"
                  onClick={() => setTmActiveTab("crew")}
                  className={`flex-1 py-2 text-center text-xs font-semibold border-b-2 ${tmActiveTab === "crew" ? "text-primary border-primary" : "text-gray-500 border-transparent"
                    }`}
                >
                  Crew &amp; Time
                </button>
                <button
                  type="button"
                  onClick={() => setTmActiveTab("sundry")}
                  className={`flex-1 py-2 text-center text-xs font-semibold border-b-2 ${tmActiveTab === "sundry" ? "text-primary border-primary" : "text-gray-500 border-transparent"
                    }`}
                >
                  Sundries
                </button>
                <button
                  type="button"
                  onClick={() => setTmActiveTab("work")}
                  className={`flex-1 py-2 text-center text-xs font-semibold border-b-2 ${tmActiveTab === "work" ? "text-primary border-primary" : "text-gray-500 border-transparent"
                    }`}
                >
                  Work Performed
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
              {tmActiveTab === "crew" && tmTimeEntry && (
                <>
                  {renderCrewTimeEntrySection({
                    title: "T&M Crew",
                    crewLabel: "T&M Crew",
                    crewHelpText: "Select painters for T&M work. These hours are tracked separately from the main timesheet.",
                    paintersState: tmTimeEntry.painters,
                    setPaintersState: (updater) =>
                      setTmTimeEntry((prev) => {
                        if (!prev) return prev
                        return {
                          ...prev,
                          painters: typeof updater === "function" ? updater(prev.painters) : updater,
                        }
                      }),
                    hoursPrefix: "T&M hours",
                    cardRowClassName: "p-4 rounded-lg border border-gray-200 bg-gray-50/50 space-y-3",
                  })}

                  <TextAreaField
                    id="tm-notes"
                    label="Notes"
                    placeholder="Describe T&amp;M extra work..."
                    value={tmTimeEntry.notes}
                    onChange={(e) =>
                      setTmTimeEntry((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                    }
                    rows={2}
                    className="w-full"
                  />
                </>
              )}

              {tmActiveTab === "sundry" && (
                <section>
                  <h2 className="text-lg font-bold text-gray-800 mb-4">T&amp;M Sundries</h2>
                  <p className="text-sm text-gray-500 mb-4">
                    Add sundry items used only for T&amp;M extra work.
                  </p>
                  <div className="space-y-3">
                    {SUNDRY_ITEMS.map((itemName) => {
                      const q = getItemQuantity(tmSundryItems, itemName)
                      return (
                        <div
                          key={itemName}
                          className={`flex items-center justify-between p-4 rounded-lg border ${q > 0 ? "bg-primary/5 border-primary/30" : "bg-white border-gray-200"
                            }`}
                        >
                          <span className={`font-medium ${q > 0 ? "text-primary" : "text-gray-700"}`}>
                            {itemName}
                          </span>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => decrementSundry(setTmSundryItems, itemName)}
                              disabled={q === 0}
                              className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Minus size={18} />
                            </button>
                            <span
                              className={`w-8 text-center font-bold ${q > 0 ? "text-primary" : "text-gray-400"
                                }`}
                            >
                              {q}
                            </span>
                            <button
                              type="button"
                              onClick={() => incrementSundry(setTmSundryItems, itemName)}
                              className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90"
                            >
                              <Plus size={18} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {tmActiveTab === "work" && (
                <section>
                  <h2 className="text-lg font-bold text-gray-800 mb-1">T&amp;M Work Performed</h2>
                  <p className="text-sm text-gray-500 mb-4">
                    Log work performed that is specifically billed as T&amp;M extra work.
                  </p>
                  <Label className="text-gray-700 font-semibold mb-2 block">Area</Label>
                  <div className="flex rounded-lg border border-gray-300 bg-gray-100 p-1 gap-0">
                    <button
                      type="button"
                      onClick={() => {
                        setTmWorkPerformedArea("interior")
                        setTmWorkPerformedGroupKey("")
                        setTmWorkPerformedTaskValue("")
                        setTmWorkPerformedQuantity("")
                        setTmWorkPerformedPaintGallons("")
                        setTmWorkPerformedPrimerGallons("")
                        setTmWorkPerformedPrimerSource("stock")
                        setTmWorkPerformedEditIndex(null)
                        setTmWorkPerformedValidationError(null)
                      }}
                      className={`flex-1 py-3 px-4 rounded-md text-sm font-semibold transition-colors ${tmWorkPerformedArea === "interior"
                        ? "bg-primary text-white shadow-sm"
                        : "text-gray-600 hover:text-gray-800"
                        }`}
                    >
                      Interior
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTmWorkPerformedArea("exterior")
                        setTmWorkPerformedGroupKey("")
                        setTmWorkPerformedTaskValue("")
                        setTmWorkPerformedQuantity("")
                        setTmWorkPerformedPaintGallons("")
                        setTmWorkPerformedPrimerGallons("")
                        setTmWorkPerformedPrimerSource("stock")
                        setTmWorkPerformedEditIndex(null)
                        setTmWorkPerformedValidationError(null)
                      }}
                      className={`flex-1 py-3 px-4 rounded-md text-sm font-semibold transition-colors ${tmWorkPerformedArea === "exterior"
                        ? "bg-primary text-white shadow-sm"
                        : "text-gray-600 hover:text-gray-800"
                        }`}
                    >
                      Exterior
                    </button>
                  </div>
                  {tmWorkPerformedArea ? (
                    <div className="mt-4 space-y-4">
                      {tmWorkPerformedEditIndex !== null && (
                        <p className="text-sm text-primary font-medium">
                          Editing saved task. Update fields below and tap Update Task.
                        </p>
                      )}
                      <div>
                        <Label className="text-gray-700 font-semibold mb-2 block">Group</Label>
                        <select
                          value={tmWorkPerformedGroupKey}
                          onChange={(e) => {
                            setTmWorkPerformedGroupKey(e.target.value)
                            setTmWorkPerformedTaskValue("")
                            setTmWorkPerformedQuantity("")
                            setTmWorkPerformedPaintGallons("")
                            setTmWorkPerformedPrimerGallons("")
                            setTmWorkPerformedPrimerSource("stock")
                            setTmWorkPerformedCount("")
                            setTmWorkPerformedLinearFeet("")
                            setTmWorkPerformedStairFloors("")
                            setTmWorkPerformedDoorCount("")
                            setTmWorkPerformedWindowCount("")
                            setTmWorkPerformedHandrailCount("")
                            setTmWorkPerformedValidationError(null)
                          }}
                          className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800"
                        >
                          <option value="">Select group</option>
                          {WORK_PERFORMED_STRUCTURE[tmWorkPerformedArea].map((group) => (
                            <option key={group.key} value={group.key}>
                              {group.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {tmWorkPerformedGroupKey && (
                        <div>
                          <Label className="text-gray-700 font-semibold mb-2 block">Task</Label>
                          <select
                            value={tmWorkPerformedTaskValue}
                            onChange={(e) => {
                              setTmWorkPerformedTaskValue(e.target.value)
                              setTmWorkPerformedQuantity("")
                              setTmWorkPerformedPaintGallons("")
                              setTmWorkPerformedPrimerGallons("")
                              setTmWorkPerformedPrimerSource("stock")
                              setTmWorkPerformedLaborMinutes("")
                              setTmWorkPerformedCount("")
                              setTmWorkPerformedLinearFeet("")
                              setTmWorkPerformedStairFloors("")
                              setTmWorkPerformedDoorCount("")
                              setTmWorkPerformedWindowCount("")
                              setTmWorkPerformedHandrailCount("")
                              setTmWorkPerformedValidationError(null)
                            }}
                            className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800"
                          >
                            <option value="">Select task</option>
                            {WORK_PERFORMED_STRUCTURE[tmWorkPerformedArea]
                              .find((g) => g.key === tmWorkPerformedGroupKey)
                              ?.tasks.map((task) => (
                                <option key={task.value} value={task.value}>
                                  {task.label}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      {tmWorkPerformedTaskValue && (() => {
                        const selectedGroup = WORK_PERFORMED_STRUCTURE[tmWorkPerformedArea].find((g) => g.key === tmWorkPerformedGroupKey)
                        const selectedTask = selectedGroup?.tasks.find((t) => t.value === tmWorkPerformedTaskValue)
                        const meta = selectedTask?.meta ?? {}
                        const showQuantity = meta.showQuantity ?? true
                        const quantityLabel = meta.quantityLabel ?? "Quantity of work (if applicable)"
                        const showPaintGallons = meta.showPaintGallons ?? true
                        const showPrimerGallons = meta.showPrimerGallons ?? true
                        const showLaborMinutes = meta.showLaborMinutes ?? true
                        const showLinearFeet = meta.showLinearFeet ?? false
                        const linearFeetLabel = meta.linearFeetLabel ?? "Linear feet (if applicable)"
                        const showStairFloors = meta.showStairFloors ?? false
                        const stairFloorsLabel = meta.stairFloorsLabel ?? "Stair floors (if applicable)"
                        return (
                          <div className="space-y-3 mt-4">
                            {showQuantity && (
                              <div>
                                <Label className="text-gray-700 font-semibold mb-1 block">{quantityLabel}</Label>
                                <input type="number" inputMode="decimal" min={0} step={0.01} placeholder="0" value={tmWorkPerformedQuantity}
                                  onChange={(e) => { const v = e.target.value; if (v === "") setTmWorkPerformedQuantity(""); else { const n = parseFloat(v); if (!Number.isNaN(n) && n >= 0) setTmWorkPerformedQuantity(v) } setTmWorkPerformedValidationError(null) }}
                                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800" />
                              </div>
                            )}
                            {showPaintGallons && (
                              <div>
                                <Label className="text-gray-700 font-semibold mb-1 block">Paint gallons used (if applicable)</Label>
                                <input type="number" inputMode="decimal" min={0} step={0.01} placeholder="0" value={tmWorkPerformedPaintGallons}
                                  onChange={(e) => { const v = e.target.value; if (v === "") setTmWorkPerformedPaintGallons(""); else { const n = parseFloat(v); if (!Number.isNaN(n) && n >= 0) setTmWorkPerformedPaintGallons(v) } setTmWorkPerformedValidationError(null) }}
                                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800" />
                              </div>
                            )}
                            {showPrimerGallons && (
                              <div>
                                <Label className="text-gray-700 font-semibold mb-1 block">Primer gallons used (if applicable)</Label>
                                <input type="number" inputMode="decimal" min={0} step={0.01} placeholder="0" value={tmWorkPerformedPrimerGallons}
                                  onChange={(e) => { const v = e.target.value; if (v === "") setTmWorkPerformedPrimerGallons(""); else { const n = parseFloat(v); if (!Number.isNaN(n) && n >= 0) setTmWorkPerformedPrimerGallons(v) } setTmWorkPerformedValidationError(null) }}
                                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800" />
                                <div className="flex rounded-md border border-gray-300 bg-gray-100 p-0.5 mt-2 w-full max-w-[200px]">
                                  <button type="button" onClick={() => setTmWorkPerformedPrimerSource("stock")}
                                    className={`flex-1 py-2 px-3 rounded text-xs font-semibold transition-colors ${tmWorkPerformedPrimerSource === "stock" ? "bg-primary text-white" : "text-gray-600"}`}>Stock</button>
                                  <button type="button" onClick={() => setTmWorkPerformedPrimerSource("retail")}
                                    className={`flex-1 py-2 px-3 rounded text-xs font-semibold transition-colors ${tmWorkPerformedPrimerSource === "retail" ? "bg-primary text-white" : "text-gray-600"}`}>Purchased</button>
                                </div>
                              </div>
                            )}
                            {showLaborMinutes && (
                              <div>
                                <Label className="text-gray-700 font-semibold mb-1 block">
                                  {(tmWorkPerformedEditIndex !== null ? tmWorkPerformedList.length >= 2 : tmWorkPerformedList.length >= 1) ? "Labor man-hours (required with multiple tasks)" : "Labor man-hours (if applicable)"}
                                </Label>
                                <select value={tmWorkPerformedLaborMinutes} onChange={(e) => { setTmWorkPerformedLaborMinutes(e.target.value); setTmWorkPerformedValidationError(null) }}
                                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800">
                                  <option value="">Select hours</option>
                                  {LABOR_MAN_HOUR_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                              </div>
                            )}
                            {showLinearFeet && (
                              <div>
                                <Label className="text-gray-700 font-semibold mb-1 block">{linearFeetLabel}</Label>
                                <input type="number" inputMode="decimal" min={0} step={0.01} placeholder="0" value={tmWorkPerformedLinearFeet}
                                  onChange={(e) => { const v = e.target.value; if (v === "") setTmWorkPerformedLinearFeet(""); else { const n = parseFloat(v); if (!Number.isNaN(n) && n >= 0) setTmWorkPerformedLinearFeet(v) } setTmWorkPerformedValidationError(null) }}
                                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800" />
                              </div>
                            )}
                            {showStairFloors && (
                              <div>
                                <Label className="text-gray-700 font-semibold mb-1 block">{stairFloorsLabel}</Label>
                                <input type="number" inputMode="numeric" min={0} step={1} placeholder="0" value={tmWorkPerformedStairFloors}
                                  onChange={(e) => { const v = e.target.value; if (v === "") setTmWorkPerformedStairFloors(""); else { const n = parseFloat(v); if (!Number.isNaN(n) && n >= 0) setTmWorkPerformedStairFloors(v) } setTmWorkPerformedValidationError(null) }}
                                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800" />
                              </div>
                            )}
                            {meta.showCount && (
                              <div>
                                <Label className="text-gray-700 font-semibold mb-1 block">Count (if applicable)</Label>
                                <input type="number" inputMode="numeric" min={0} step={1} placeholder="0" value={tmWorkPerformedCount}
                                  onChange={(e) => { const v = e.target.value; if (v === "") setTmWorkPerformedCount(""); else { const n = parseFloat(v); if (!Number.isNaN(n) && n >= 0) setTmWorkPerformedCount(v) } setTmWorkPerformedValidationError(null) }}
                                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800" />
                              </div>
                            )}
                            {meta.showDoorCount && (
                              <div>
                                <Label className="text-gray-700 font-semibold mb-1 block">Door count (if applicable)</Label>
                                <input type="number" inputMode="numeric" min={0} step={1} placeholder="0" value={tmWorkPerformedDoorCount}
                                  onChange={(e) => { const v = e.target.value; if (v === "") setTmWorkPerformedDoorCount(""); else { const n = parseFloat(v); if (!Number.isNaN(n) && n >= 0) setTmWorkPerformedDoorCount(v) } setTmWorkPerformedValidationError(null) }}
                                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800" />
                              </div>
                            )}
                            {meta.showWindowCount && (
                              <div>
                                <Label className="text-gray-700 font-semibold mb-1 block">Window count (if applicable)</Label>
                                <input type="number" inputMode="numeric" min={0} step={1} placeholder="0" value={tmWorkPerformedWindowCount}
                                  onChange={(e) => { const v = e.target.value; if (v === "") setTmWorkPerformedWindowCount(""); else { const n = parseFloat(v); if (!Number.isNaN(n) && n >= 0) setTmWorkPerformedWindowCount(v) } setTmWorkPerformedValidationError(null) }}
                                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800" />
                              </div>
                            )}
                            {meta.showHandrailCount && (
                              <div>
                                <Label className="text-gray-700 font-semibold mb-1 block">Handrail count (if applicable)</Label>
                                <input type="number" inputMode="numeric" min={0} step={1} placeholder="0" value={tmWorkPerformedHandrailCount}
                                  onChange={(e) => { const v = e.target.value; if (v === "") setTmWorkPerformedHandrailCount(""); else { const n = parseFloat(v); if (!Number.isNaN(n) && n >= 0) setTmWorkPerformedHandrailCount(v) } setTmWorkPerformedValidationError(null) }}
                                  className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none text-gray-800" />
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      {tmWorkPerformedValidationError && (
                        <p className="text-sm text-red-600 font-medium mt-2" role="alert">{tmWorkPerformedValidationError}</p>
                      )}
                      <button type="button" onClick={addTmWorkPerformedActivity}
                        className="w-full py-3 px-4 rounded-lg border-2 border-primary bg-primary/10 text-primary font-semibold text-sm hover:bg-primary/20 transition-colors mt-4">
                        {tmWorkPerformedEditIndex !== null ? "Update Task" : "Add Task"}
                      </button>
                      {tmWorkPerformedList.length > 0 && (
                        <div className="pt-2 mt-4">
                          <h3 className="text-base font-bold text-gray-800 mb-3">Saved T&amp;M activities ({tmWorkPerformedList.length})</h3>
                          <div className="space-y-3">
                            {tmWorkPerformedList.map((item, idx) => (
                              <div key={idx} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm relative">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div className="flex flex-wrap items-baseline gap-2 min-w-0">
                                    <span className="text-xs font-semibold uppercase text-gray-500">{item.area === "interior" ? "Interior" : "Exterior"}</span>
                                    <span className="text-gray-500 text-xs">•</span>
                                    <span className="text-gray-700 font-medium">{item.groupLabel}</span>
                                    <span className="text-gray-500 text-xs">•</span>
                                    <span className="text-gray-800 font-semibold">{item.taskLabel}</span>
                                  </div>
                                  <div className="flex shrink-0 gap-0.5">
                                    <button type="button" onClick={() => startEditingTmWorkPerformed(idx)} className="p-1.5 rounded-md text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors" aria-label="Edit activity"><Pencil size={18} /></button>
                                    <button type="button" onClick={() => removeTmWorkPerformedActivity(idx)} className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" aria-label="Remove activity"><Trash2 size={18} /></button>
                                  </div>
                                </div>
                                <dl className="text-sm text-gray-600 space-y-0.5">
                                  {item.quantity > 0 && <div><dt className="inline font-medium text-gray-500">Quantity: </dt><dd className="inline">{item.quantity}</dd></div>}
                                  {item.paintGallonsUsed > 0 && <div><dt className="inline font-medium text-gray-500">Paint: </dt><dd className="inline">{item.paintGallonsUsed} gal</dd></div>}
                                  {item.primerGallonsUsed > 0 && <div><dt className="inline font-medium text-gray-500">Primer: </dt><dd className="inline">{item.primerGallonsUsed} gal</dd></div>}
                                  <div><dt className="inline font-medium text-gray-500">Primer source: </dt><dd className="inline capitalize">{item.primerSource}</dd></div>
                                  {item.laborMinutes > 0 && <div><dt className="inline font-medium text-gray-500">Labor: </dt><dd className="inline">{formatHoursText(item.laborMinutes)}</dd></div>}
                                  {item.measurements?.count != null && item.measurements.count > 0 && <div><dt className="inline font-medium text-gray-500">Count: </dt><dd className="inline">{item.measurements.count}</dd></div>}
                                  {item.measurements?.linearFeet != null && item.measurements.linearFeet > 0 && <div><dt className="inline font-medium text-gray-500">Linear feet: </dt><dd className="inline">{item.measurements.linearFeet}</dd></div>}
                                  {item.measurements?.stairFloors != null && item.measurements.stairFloors > 0 && <div><dt className="inline font-medium text-gray-500">Stair floors: </dt><dd className="inline">{item.measurements.stairFloors}</dd></div>}
                                  {item.measurements?.doorCount != null && item.measurements.doorCount > 0 && <div><dt className="inline font-medium text-gray-500">Doors: </dt><dd className="inline">{item.measurements.doorCount}</dd></div>}
                                  {item.measurements?.windowCount != null && item.measurements.windowCount > 0 && <div><dt className="inline font-medium text-gray-500">Windows: </dt><dd className="inline">{item.measurements.windowCount}</dd></div>}
                                  {item.measurements?.handrailCount != null && item.measurements.handrailCount > 0 && <div><dt className="inline font-medium text-gray-500">Handrails: </dt><dd className="inline">{item.measurements.handrailCount}</dd></div>}
                                </dl>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-gray-500">Select a category to continue.</p>
                  )}
                </section>
              )}
            </div>

            <div className="px-4 py-3 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={() => setTmDetailsOpen(false)}
                className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
