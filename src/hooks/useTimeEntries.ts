import { useQuery } from '@tanstack/react-query'
import { useSelectedForeman } from '@/contexts/SelectedForemanContext'

export interface TimeEntryPainter {
  id: string
  painterId: string
  painterName: string
  startTime: string
  endTime: string
  lunchStart: string
  lunchEnd: string
  totalHours: number
  zohoJunctionId?: string | null
}

export interface TimeEntry {
  id: string
  userId: string
  jobId: string
  jobName: string
  date: string
  totalCrewHours: number
  synced: boolean
  notes?: string
  changeOrder?: string
  extraHours?: string
  extraWorkDescription?: string
  painters: TimeEntryPainter[]
  sundryItems?: Record<string, string>
  // Legacy flat sundry (API may return either)
  maskingPaperRoll?: string
  plasticRoll?: string
  puttySpackleTub?: string
  caulkTube?: string
  whiteTapeRoll?: string
  orangeTapeRoll?: string
  floorPaperRoll?: string
  tip?: string
  sandingSponge?: string
  inchRollerCover18?: string
  inchRollerCover9?: string
  miniCover?: string
  masks?: string
  brickTapeRoll?: string
}

interface UseTimeEntriesOptions {
  days?: number
}

export function useTimeEntries(options?: UseTimeEntriesOptions) {
  const { days = 30 } = options || {}
  const { foreman } = useSelectedForeman()

  return useQuery<TimeEntry[]>({
    queryKey: ['time-entries', days, foreman?.id ?? null],
    // Keep in cache for 5 minutes after unmount
    gcTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      if (!foreman?.id) return []
      try {
        const res = await fetch(`/api/time-entries?days=${days}`, {
          signal,
          headers: { 'X-Selected-Foreman-Id': foreman.id },
        })

        if (!res.ok) return []

        const data = await res.json()

        // Normalise: handle { data: [...] }, { entries: [...] }, or raw array
        if (Array.isArray(data)) return data
        if (data && Array.isArray(data.data)) return data.data
        if (data && Array.isArray(data.entries)) return data.entries
        return []
      } catch (error: any) {
        // Ignore AbortError — component unmounted or query was cancelled
        if (error?.name === 'AbortError' || signal?.aborted) return []
        return []
      }
    },
    // Keep data fresh for 1 minute (entries change frequently)
    staleTime: 60 * 1000,
    refetchOnMount: true,
    retry: 1,
    retryDelay: 1000,
    throwOnError: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  })
}

/**
 * Recent entries: last N timesheets from the past 7 days.
 */
export function useRecentEntries(limit: number = 5) {
  const { data: rawEntries, ...rest } = useTimeEntries({ days: 7 })
  const entries = Array.isArray(rawEntries) ? rawEntries : []
  return {
    ...rest,
    data: entries.slice(0, limit),
  }
}
