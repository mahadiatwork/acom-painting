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
      const { data } = await axios.get('/api/projects')
      return data
    },
    // Keep data fresh for 5 minutes, cache for 1 hour
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000, 
  })
}


