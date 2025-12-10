import { useQuery } from '@tanstack/react-query'
import { useTimeEntries } from './useTimeEntries'

/**
 * Calculate weekly hours from time entries
 * Returns total hours for the current week (Monday to Sunday)
 */
export function useWeeklyHours() {
  const { data: entries = [], isLoading: entriesLoading } = useTimeEntries({ days: 7 })

  // Calculate immediately - don't wait for query
  const calculateHours = () => {
    if (!entries || entries.length === 0) {
      return 0
    }

    // Get current week boundaries (Monday to Sunday)
    const now = new Date()
    const dayOfWeek = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    monday.setHours(0, 0, 0, 0)
    
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    // Filter entries within current week
    const weekEntries = entries.filter(entry => {
      const entryDate = new Date(entry.date)
      return entryDate >= monday && entryDate <= sunday
    })

    // Sum total hours
    const total = weekEntries.reduce((sum, entry) => {
      return sum + (entry.totalHours || 0)
    }, 0)

    return Number(total.toFixed(2))
  }

  // Return immediately - no async query needed
  return {
    data: calculateHours(),
    isLoading: entriesLoading,
    isError: false,
  }
}

