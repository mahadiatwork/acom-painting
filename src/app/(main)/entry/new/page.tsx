"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { Layout } from "@/components/Layout"
import { PrimaryButton } from "@/components/PrimaryButton"
import { TextAreaField } from "@/components/FormFields"
import { ArrowLeft, Save, Loader2, Calendar, Clock, Package, Plus, Minus, Trash2 } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ChevronDown } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useProjects } from "@/hooks/useProjects"
import { usePainters } from "@/hooks/usePainters"
import { useQueryClient } from "@tanstack/react-query"

type TabType = "crew" | "sundry"

const DEFAULT_START = "07:30"
const DEFAULT_END = "16:00"

const LUNCH_DURATION_OPTIONS = [
  { value: "", label: "No lunch" },
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "1 hr" },
] as const

const MINUTE_OPTIONS = ["00", "15", "30", "45"] as const
const HOUR_OPTIONS = Array.from({ length: 18 }, (_, i) => i + 4) // 4 AM–9 PM

interface PainterRow {
  painterId: string
  painterName: string
  startTime: string
  endTime: string
  lunchDuration: string // "" | "15" | "30" | "45" | "60" (minutes)
}

interface SundryItem {
  sundryItem: string
  quantity: number
}

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
  startTime: "",
  endTime: "",
  lunchDuration: "",
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
  const [activeTab, setActiveTab] = useState<TabType>("crew")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [jobId, setJobId] = useState("")
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState("")
  const [painters, setPainters] = useState<PainterRow[]>([])
  const [sundryItems, setSundryItems] = useState<SundryItem[]>([])
  const [extraWorkChecked, setExtraWorkChecked] = useState(false)
  const [extraHours, setExtraHours] = useState("")
  const [extraWorkDescription, setExtraWorkDescription] = useState("")

  const { data: projects = [], isLoading: isLoadingProjects, isError: isProjectsError } = useProjects()
  const { data: paintersList = [], isLoading: isLoadingPainters, isError: isPaintersError } = usePainters()

  const selectedPainterIds = painters.map((p) => p.painterId).filter(Boolean)
  const togglePainterInCrew = (painterId: string) => {
    const p = paintersList.find((x) => x.id === painterId)
    if (!p) return
    const isSelected = selectedPainterIds.includes(painterId)
    if (isSelected) {
      setPainters((prev) => prev.filter((row) => row.painterId !== painterId))
    } else {
      setPainters((prev) => [
        ...prev,
        { painterId: p.id, painterName: p.name, startTime: DEFAULT_START, endTime: DEFAULT_END, lunchDuration: "" },
      ])
    }
  }
  const removePainter = (index: number) => {
    setPainters((prev) => prev.filter((_, i) => i !== index))
  }
  const updatePainter = (index: number, field: keyof PainterRow, value: string) => {
    setPainters((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      if (field === "painterId") {
        const p = paintersList.find((x) => x.id === value)
        if (p) next[index].painterName = p.name
      }
      return next
    })
  }

  const getItemQuantity = (itemName: string) => {
    const item = sundryItems.find((i) => i.sundryItem === itemName)
    return item ? item.quantity : 0
  }
  const handleIncrement = (itemName: string) => {
    setSundryItems((prev) => {
      const i = prev.findIndex((x) => x.sundryItem === itemName)
      if (i >= 0) return prev.map((x, j) => (j === i ? { ...x, quantity: x.quantity + 1 } : x))
      return [...prev, { sundryItem: itemName, quantity: 1 }]
    })
  }
  const handleDecrement = (itemName: string) => {
    setSundryItems((prev) => {
      const i = prev.findIndex((x) => x.sundryItem === itemName)
      if (i < 0) return prev
      const q = prev[i].quantity
      if (q <= 1) return prev.filter((_, j) => j !== i)
      return prev.map((x, j) => (j === i ? { ...x, quantity: x.quantity - 1 } : x))
    })
  }

  const handleSubmit = async () => {
    if (!jobId) {
      toast({ title: "Validation Error", description: "Please select a job", variant: "destructive" })
      return
    }
    const validPainters = painters.filter((p) => p.painterId && p.startTime && p.endTime)
    if (validPainters.length === 0) {
      toast({ title: "Validation Error", description: "Add at least one painter with start and end times", variant: "destructive" })
      return
    }
    const painterIds = new Set(validPainters.map((p) => p.painterId))
    if (painterIds.size !== validPainters.length) {
      toast({ title: "Validation Error", description: "Each painter can only appear once", variant: "destructive" })
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        jobId,
        jobName: projects?.find((j) => j.id === jobId)?.name ?? "",
        date,
        notes: notes || "",
        changeOrder: "",
        extraHours: extraWorkChecked ? (extraHours.trim() || "0") : "0",
        extraWorkDescription: extraWorkChecked ? extraWorkDescription.trim() : "",
        sundryItems: sundryItems.filter((i) => i.quantity > 0),
        painters: validPainters.map((p) => {
          const durationMin = p.lunchDuration ? parseInt(p.lunchDuration, 10) || 0 : 0
          const { lunchStart, lunchEnd } = durationToLunchStartEnd(p.startTime, p.endTime, durationMin)
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
      const res = await fetch("/api/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const isFormValid =
    jobId &&
    painters.some((p) => p.painterId && p.startTime && p.endTime) &&
    painters.filter((p) => p.painterId).length === new Set(painters.filter((p) => p.painterId).map((p) => p.painterId)).size

  return (
    <Layout>
      <div className="bg-secondary text-white p-4 flex items-center sticky top-0 z-20 shadow-md">
        <button onClick={() => router.push("/")} className="mr-4 text-gray-300 hover:text-white p-1">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-lg font-bold">New Timesheet</h1>
      </div>

      <div className="bg-white border-b border-gray-200 sticky top-[60px] z-10">
        <div className="max-w-2xl md:max-w-none xl:max-w-2xl mx-auto flex">
          <button
            onClick={() => setActiveTab("crew")}
            className={`flex-1 py-3 px-4 text-center font-semibold text-sm ${activeTab === "crew" ? "text-primary border-b-2 border-primary" : "text-gray-500"}`}
          >
            <span className="flex items-center justify-center gap-2">
              <Clock size={18} /> Crew &amp; Time
            </span>
          </button>
          <button
            onClick={() => setActiveTab("sundry")}
            className={`flex-1 py-3 px-4 text-center font-semibold text-sm ${activeTab === "sundry" ? "text-primary border-b-2 border-primary" : "text-gray-500"}`}
          >
            <span className="flex items-center justify-center gap-2">
              <Package size={18} /> Sundries
            </span>
          </button>
        </div>
      </div>

      {/* max-h keeps content above the fixed bottom nav; overflow-y-auto makes this the scroll container */}
      <main className="flex-1 min-h-0 overflow-y-auto max-h-[calc(100vh-11rem)]">
        <div className="p-4 md:p-6 xl:p-4 space-y-6 pb-24 max-w-2xl md:max-w-none xl:max-w-2xl mx-auto" style={{ paddingBottom: "max(6rem, calc(5rem + env(safe-area-inset-bottom, 0px)))" }}>
          {activeTab === "crew" && (
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
                      <select
                        className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none"
                        value={jobId}
                        onChange={(e) => setJobId(e.target.value)}
                      >
                        <option value="">Select a job</option>
                        {projects.map((j) => (
                          <option key={j.id} value={j.id}>{j.name}</option>
                        ))}
                      </select>
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
                </div>
              </section>

              <section>
                <h2 className="text-lg font-bold text-gray-800 mb-2">Crew</h2>
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
                        <Label className="text-sm text-gray-600 block mb-2">Crew 1</Label>
                        <p className="text-xs text-gray-500 mb-2">Tap to select painters. Each person can have individual start/end times below.</p>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="w-full min-h-11 px-3 py-2 rounded-md border border-gray-300 bg-white text-left text-sm font-medium text-gray-800 focus:ring-2 focus:ring-primary focus:ring-offset-0 outline-none flex items-center justify-between gap-2"
                            >
                              <span className="truncate">
                                {selectedPainterIds.length === 0
                                  ? "Select painters..."
                                  : selectedPainterIds.length === 1
                                    ? painters.find((r) => r.painterId === selectedPainterIds[0])?.painterName ?? "1 selected"
                                    : `${selectedPainterIds.length} selected`}
                              </span>
                              <ChevronDown className="shrink-0 text-gray-500" size={18} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2 max-h-64 overflow-y-auto" align="start">
                            <div className="space-y-0.5">
                              {paintersList.map((p) => (
                                <label
                                  key={p.id}
                                  className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-2 hover:bg-gray-100"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedPainterIds.includes(p.id)}
                                    onChange={() => togglePainterInCrew(p.id)}
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
                    {painters.length > 0 && (
                    <div className="space-y-4">
                    {painters.map((row, index) => (
                      <div key={row.painterId} className="p-4 rounded-lg border border-gray-200 bg-gray-50/50 space-y-3">
                        <div className="flex justify-between items-center">
                          <Label className="text-gray-600 text-sm font-medium">{row.painterName || `Painter ${index + 1}`}</Label>
                          {painters.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removePainter(index)}
                              className="text-red-600 hover:text-red-700 p-1"
                              aria-label={`Remove ${row.painterName}`}
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-gray-500">Start</Label>
                            <div className="flex gap-1">
                              <select
                                className="flex-1 min-w-0 h-10 px-2 rounded border border-gray-300 bg-white text-sm"
                                value={String(getTimeParts(row.startTime, DEFAULT_START).hour)}
                                onChange={(e) => {
                                  const { minute } = getTimeParts(row.startTime, DEFAULT_START)
                                  updatePainter(index, "startTime", `${e.target.value.padStart(2, "0")}:${minute}`)
                                }}
                              >
                                {HOUR_OPTIONS.map((h) => (
                                  <option key={h} value={h}>{h === 12 ? "12 (noon)" : h < 12 ? `${h} AM` : `${h - 12} PM`}</option>
                                ))}
                              </select>
                              <select
                                className="w-16 shrink-0 h-10 px-2 rounded border border-gray-300 bg-white text-sm"
                                value={getTimeParts(row.startTime, DEFAULT_START).minute}
                                onChange={(e) => {
                                  const { hour } = getTimeParts(row.startTime, DEFAULT_START)
                                  updatePainter(index, "startTime", `${String(hour).padStart(2, "0")}:${e.target.value}`)
                                }}
                              >
                                {MINUTE_OPTIONS.map((m) => (
                                  <option key={m} value={m}>:{m}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs text-gray-500">End</Label>
                            <div className="flex gap-1">
                              <select
                                className="flex-1 min-w-0 h-10 px-2 rounded border border-gray-300 bg-white text-sm"
                                value={String(getTimeParts(row.endTime, DEFAULT_END).hour)}
                                onChange={(e) => {
                                  const { minute } = getTimeParts(row.endTime, DEFAULT_END)
                                  updatePainter(index, "endTime", `${e.target.value.padStart(2, "0")}:${minute}`)
                                }}
                              >
                                {HOUR_OPTIONS.map((h) => (
                                  <option key={h} value={h}>{h === 12 ? "12 (noon)" : h < 12 ? `${h} AM` : `${h - 12} PM`}</option>
                                ))}
                              </select>
                              <select
                                className="w-16 shrink-0 h-10 px-2 rounded border border-gray-300 bg-white text-sm"
                                value={getTimeParts(row.endTime, DEFAULT_END).minute}
                                onChange={(e) => {
                                  const { hour } = getTimeParts(row.endTime, DEFAULT_END)
                                  updatePainter(index, "endTime", `${String(hour).padStart(2, "0")}:${e.target.value}`)
                                }}
                              >
                                {MINUTE_OPTIONS.map((m) => (
                                  <option key={m} value={m}>:{m}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs text-gray-500">Lunch</Label>
                            <select
                              className="w-full h-10 px-2 rounded border border-gray-300 bg-white text-sm"
                              value={row.lunchDuration}
                              onChange={(e) => updatePainter(index, "lunchDuration", e.target.value)}
                            >
                              {LUNCH_DURATION_OPTIONS.map((opt) => (
                                <option key={opt.value || "none"} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {row.startTime && row.endTime && (
                          <p className="text-xs text-gray-500">
                            Hours: {computeHours(row.startTime, row.endTime, row.lunchDuration)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                    )}
                  </>
                )}
              </section>

              <section>
                <h2 className="text-lg font-bold text-gray-800 mb-2">Extra Work</h2>
                <label className="flex items-center gap-2 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={extraWorkChecked}
                    onChange={(e) => setExtraWorkChecked(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-gray-800">Extra Work</span>
                </label>
                {extraWorkChecked && (
                  <div className="space-y-3 p-4 rounded-lg border border-gray-200 bg-gray-50/50">
                    <div>
                      <Label className="text-xs text-gray-500 block mb-1">Hours</Label>
                      <input
                        type="number"
                        min={0}
                        step={0.25}
                        placeholder="0"
                        value={extraHours}
                        onChange={(e) => setExtraHours(e.target.value)}
                        className="w-full max-w-32 h-10 px-3 rounded border border-gray-300 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 block mb-1">Description</Label>
                      <textarea
                        placeholder="Describe extra work..."
                        value={extraWorkDescription}
                        onChange={(e) => setExtraWorkDescription(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded border border-gray-300 bg-white text-sm"
                      />
                    </div>
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-lg font-bold text-gray-800 mb-4">Notes</h2>
                <TextAreaField
                  id="notes"
                  label="Notes"
                  placeholder="Notes for this timesheet..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full"
                />
              </section>

              <section className="pt-4 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => router.push("/")}
                    disabled={isSubmitting}
                    className="flex-1 h-12 px-4 rounded-md border-2 border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <PrimaryButton
                    onClick={handleSubmit}
                    disabled={!isFormValid || isSubmitting}
                    className="flex-1 text-lg shadow-md"
                  >
                    {isSubmitting ? (
                      <><Loader2 className="mr-2 h-5 w-5 animate-spin inline" /> Submitting...</>
                    ) : (
                      <><Save className="mr-2 inline" size={20} /> Submit Timesheet</>
                    )}
                  </PrimaryButton>
                </div>
              </section>
            </>
          )}

          {activeTab === "sundry" && (
            <>
              <section>
                <h2 className="text-lg font-bold text-gray-800 mb-4">Sundries Used (for this timesheet)</h2>
                <p className="text-sm text-gray-500 mb-4">Add quantities used. Submit from the Crew &amp; Time tab.</p>
                <div className="space-y-3">
                  {SUNDRY_ITEMS.map((itemName) => {
                    const q = getItemQuantity(itemName)
                    return (
                      <div
                        key={itemName}
                        className={`flex items-center justify-between p-4 rounded-lg border ${q > 0 ? "bg-primary/5 border-primary/30" : "bg-white border-gray-200"}`}
                      >
                        <span className={`font-medium ${q > 0 ? "text-primary" : "text-gray-700"}`}>{itemName}</span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleDecrement(itemName)}
                            disabled={q === 0}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Minus size={18} />
                          </button>
                          <span className={`w-8 text-center font-bold ${q > 0 ? "text-primary" : "text-gray-400"}`}>{q}</span>
                          <button
                            type="button"
                            onClick={() => handleIncrement(itemName)}
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
        </div>
      </main>
    </Layout>
  )
}
