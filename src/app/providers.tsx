"use client"

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SelectedForemanProvider } from '@/contexts/SelectedForemanContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { NavigationLoadingProvider } from '@/contexts/NavigationLoadingContext'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Prevent unnecessary refetches when the user switches tabs
            refetchOnWindowFocus: false,
            staleTime: 2 * 60 * 1000,    // 2-minute default stale time
            gcTime: 10 * 60 * 1000,      // 10-minute garbage-collection window
            retry: 1,
          },
          mutations: {
            retry: 1,
          },
        },
      })
  )

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SelectedForemanProvider>
          <NavigationLoadingProvider>
            <TooltipProvider>
              <Toaster />
              {children}
            </TooltipProvider>
          </NavigationLoadingProvider>
        </SelectedForemanProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
