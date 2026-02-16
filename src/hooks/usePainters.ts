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
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  })
}
