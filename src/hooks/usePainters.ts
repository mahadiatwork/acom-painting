import { useQuery } from '@tanstack/react-query'

export interface Painter {
  id: string
  name: string
  email: string | null
  phone: string | null
}

export function usePainters() {
  return useQuery<Painter[]>({
    queryKey: ['painters'],
    queryFn: async () => {
      const res = await fetch('/api/painters', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data?.error || `Failed to fetch painters (${res.status})`
        throw new Error(msg)
      }
      return Array.isArray(data) ? data : []
    },
    // Painters rarely change mid-session; keep in cache for 30 min
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    throwOnError: false,
  })
}
