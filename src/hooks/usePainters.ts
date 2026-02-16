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
      const res = await fetch('/api/painters')
      if (!res.ok) throw new Error('Failed to fetch painters')
      const data = await res.json()
      return Array.isArray(data) ? data : []
    },
    staleTime: 5 * 60 * 1000,
  })
}
