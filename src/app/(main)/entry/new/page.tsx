"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { Layout } from "@/components/Layout"
import { PrimaryButton } from "@/components/PrimaryButton"
import { TextAreaField } from "@/components/FormFields"
import { ArrowLeft, Save, Loader2, Calendar, Clock, Package, Plus, Minus, Trash2, UserPlus } from "lucide-react"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useProjects } from "@/hooks/useProjects"
import { usePainters } from "@/hooks/usePainters"
import { useQueryClient } from "@tanstack/react-query"

type TabType = "crew" | "sundry"

interface PainterRow {
  painterId: string
  painterName: string
  startTime: string
  endTime: string
  lunchStart: string
  lunchEnd: string
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
  lunchStart: "",
  lunchEnd: "",
})

function parseTimeToMinutes(time: string): number {
  if (!time) return 0
  const [h, m] = time.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function computeHours(start: string, end: string, lunchStart: string, lunchEnd: string): number {
  let workM = parseTimeToMinutes(end) - parseTimeToMinutes(start)
  if (lunchStart && lunchEnd) {
    const lunchM = parseTimeToMinutes(lunchEnd) - parseTimeToMinutes(lunchStart)
    if (lunchM > 0) workM -= lunchM
  }
  return workM > 0 ? Number((workM / 60).toFixed(2)) : 0
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
  const [painters, setPainters] = useState<PainterRow[]>([emptyPainterRow()])
  const [sundryItems, setSundryItems] = useState<SundryItem[]>([])

  const { data: projects, isLoading: isLoadingProjects } = useProjects()
  const { data: paintersList = [], isLoading: isLoadingPainters } = usePainters()

  const addPainter = () => setPainters((prev) => [...prev, emptyPainterRow()])
  const removePainter = (index: number) => {
    if (painters.length <= 1) return
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
        sundryItems: sundryItems.filter((i) => i.quantity > 0),
        painters: validPainters.map((p) => ({
          painterId: p.painterId,
          painterName: p.painterName,
          startTime: p.startTime,
          endTime: p.endTime,
          lunchStart: p.lunchStart || "",
          lunchEnd: p.lunchEnd || "",
        })),
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
              <Package size={18} /> Sundry
            </span>
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6 xl:p-4 space-y-6 pb-32 max-w-2xl md:max-w-none xl:max-w-2xl mx-auto">
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
                    ) : (
                      <select
                        className="w-full h-12 px-3 rounded-md border border-gray-300 bg-white focus:ring-2 focus:ring-primary outline-none"
                        value={jobId}
                        onChange={(e) => setJobId(e.target.value)}
                      >
                        <option value="">Select a job</option>
                        {projects?.map((j) => (
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
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h2 className="text-lg font-bold text-gray-800">Crew</h2>
                  <button
                    type="button"
                    onClick={addPainter}
                    className="flex items-center gap-2 px-4 py-2 rounded-md border-2 border-primary bg-primary/10 text-primary font-semibold text-sm hover:bg-primary/20 transition-colors shrink-0"
                    aria-label="Add another painter to crew"
                  >
                    <UserPlus size={18} aria-hidden /> Add painter
                  </button>
                </div>
                {isLoadingPainters ? (
                  <div className="p-4 border rounded-lg bg-gray-50 text-gray-500">Loading painters...</div>
                ) : (
                  <div className="space-y-4">
                    {painters.map((row, index) => (
                      <div key={index} className="p-4 rounded-lg border border-gray-200 bg-gray-50/50 space-y-3">
                        <div className="flex justify-between items-center">
                          <Label className="text-gray-600 text-sm">Painter {index + 1}</Label>
                          {painters.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removePainter(index)}
                              className="text-red-600 hover:text-red-700 p-1"
                              aria-label="Remove painter"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                        <select
                          className="w-full h-11 px-3 rounded-md border border-gray-300 bg-white text-base focus:ring-2 focus:ring-primary outline-none"
                          value={row.painterId}
                          onChange={(e) => updatePainter(index, "painterId", e.target.value)}
                        >
                          <option value="">Select painter</option>
                          {paintersList.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-gray-500">Start</Label>
                            <input
                              type="time"
                              className="w-full h-10 px-2 rounded border border-gray-300 bg-white text-sm"
                              value={row.startTime}
                              onChange={(e) => updatePainter(index, "startTime", e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-gray-500">End</Label>
                            <input
                              type="time"
                              className="w-full h-10 px-2 rounded border border-gray-300 bg-white text-sm"
                              value={row.endTime}
                              onChange={(e) => updatePainter(index, "endTime", e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-gray-500">Lunch start</Label>
                            <input
                              type="time"
                              className="w-full h-10 px-2 rounded border border-gray-300 bg-white text-sm"
                              value={row.lunchStart}
                              onChange={(e) => updatePainter(index, "lunchStart", e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-gray-500">Lunch end</Label>
                            <input
                              type="time"
                              className="w-full h-10 px-2 rounded border border-gray-300 bg-white text-sm"
                              value={row.lunchEnd}
                              onChange={(e) => updatePainter(index, "lunchEnd", e.target.value)}
                            />
                          </div>
                        </div>
                        {row.startTime && row.endTime && (
                          <p className="text-xs text-gray-500">
                            Hours: {computeHours(row.startTime, row.endTime, row.lunchStart, row.lunchEnd)}
                          </p>
                        )}
                      </div>
                    ))}
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
                <h2 className="text-lg font-bold text-gray-800 mb-4">Sundry Used (for this timesheet)</h2>
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
