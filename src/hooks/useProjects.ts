import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

export interface Project {
  id: string
  name: string
  customer: string
  status: string
  address: string
  salesRep: string
  supplierColor?: string
  trimColor?: string
  accessoryColor?: string
  gutterType?: string
  sidingStyle?: string
  workOrderLink?: string
}

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      try {
        const { data } = await axios.get('/api/projects', {
          timeout: 3000, // 3 second timeout - fail fast
        })
        return data || [] // Always return array, never null/undefined
      } catch (error) {
        // On any error (timeout, network, etc.), return empty array
        console.warn('[useProjects] API error, returning empty array:', error)
        return []
      }
    },
    // Keep data fresh for 5 minutes, cache for 1 hour
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    // Don't retry - fail fast and show "no data"
    retry: 0,
    retryDelay: 0,
    // Return empty array on error instead of throwing
    throwOnError: false,
    // Always refetch when component mounts to get fresh data
    refetchOnMount: true,
    // Don't refetch on window focus
    refetchOnWindowFocus: false,
  })
}


