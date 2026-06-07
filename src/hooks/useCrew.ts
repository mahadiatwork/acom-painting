import { useQuery } from '@tanstack/react-query'

export type CrewRole = 'painter' | 'foreman'

export interface CrewMember {
  id: string
  painterId: string | null
  foremanId: string | null
  name: string
  email: string
  phone: string
  roles: CrewRole[]
  syncReady: boolean
  matchStatus: 'painter' | 'matched_foreman' | 'unmatched_foreman'
}

export interface CrewResponse {
  crew: CrewMember[]
  summary: {
    total: number
    syncReady: number
    unmatchedForemen: number
  }
}

export function useCrew() {
  return useQuery<CrewResponse>({
    queryKey: ['crew'],
    queryFn: async () => {
      const res = await fetch('/api/crew', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data?.error || `Failed to fetch crew (${res.status})`
        throw new Error(msg)
      }
      return {
        crew: Array.isArray(data?.crew) ? data.crew : [],
        summary: data?.summary ?? { total: 0, syncReady: 0, unmatchedForemen: 0 },
      }
    },
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    throwOnError: false,
  })
}
