import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

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
  days?: number // Number of days back to fetch (default: 30)
}

export function useTimeEntries(options?: UseTimeEntriesOptions) {
  const { days = 30 } = options || {}

  return useQuery<TimeEntry[]>({
    queryKey: ['time-entries', days],
    // Prevent query cancellation on unmount - let it complete
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get('/api/time-entries', {
          params: { days },
          timeout: 10000, // 10 second timeout - API can take 2-3 seconds
          signal, // Pass React Query's cancellation signal to axios
        })

        // DEBUG LOGGING
        console.log('[useTimeEntries] Raw Axios Response:', response)
        console.log('[useTimeEntries] Response Data:', response.data)
        console.log('[useTimeEntries] Response Data Type:', typeof response.data)
        console.log('[useTimeEntries] Is Array:', Array.isArray(response.data))

        // NORMALIZATION LOGIC
        let data = response.data

        // 1. Handle common API wrapper patterns
        if (data && !Array.isArray(data) && Array.isArray(data.data)) {
          console.log('[useTimeEntries] Unwrapping data property')
          data = data.data
        } else if (data && !Array.isArray(data) && Array.isArray(data.entries)) {
          console.log('[useTimeEntries] Unwrapping entries property')
          data = data.entries
        }

        // 2. Final Safety Check
        if (!Array.isArray(data)) {
          console.error('[useTimeEntries] CRITICAL: Data is still not an array:', data)
          console.error('[useTimeEntries] Data type:', typeof data)
          console.error('[useTimeEntries] Data keys:', data && typeof data === 'object' ? Object.keys(data) : 'N/A')
          return [] // Return empty array to prevent UI crashes
        }

        console.log('[useTimeEntries] Normalized data (array):', data.length, 'entries')
        return data
      } catch (error: any) {
        // Handle canceled requests (component unmounted)
        if (axios.isCancel(error) || error?.code === 'ERR_CANCELED' || signal?.aborted) {
          console.warn('[useTimeEntries] Request was canceled (component unmounted)')
          return [] // Return empty array, but don't treat as error
        }
        
        // On any other error (timeout, network, etc.), return empty array
        console.warn('[useTimeEntries] API error, returning empty array:', error?.message || error)
        return []
      }
    },
    // Keep data fresh for 1 minute (entries change frequently)
    staleTime: 60 * 1000,
    refetchOnMount: true, // Always refetch when component mounts
    // Retry once if request fails (network issues, etc.)
    retry: 1,
    retryDelay: 1000,
    // Return empty array on error instead of throwing
    throwOnError: false,
    // Don't refetch on window focus if we have data (even if empty)
    refetchOnWindowFocus: false,
    // Keep query active even if component unmounts (for background completion)
    refetchOnReconnect: true,
  })
}

/**
 * Hook to get recent entries (last N entries)
 * Uses 7 days to fetch recent entries from Postgres
 */
export function useRecentEntries(limit: number = 5) {
  const { data: rawEntries, ...rest } = useTimeEntries({ days: 7 })

  // Ensure it is always an array before slicing
  const entries = Array.isArray(rawEntries) ? rawEntries : []
  
  console.log('[useRecentEntries] Raw entries:', rawEntries)
  console.log('[useRecentEntries] Normalized entries:', entries.length)

  return {
    ...rest,
    data: entries.slice(0, limit),
  }
}

