import { createBrowserClient } from '@supabase/ssr'

// Singleton: reuse the same client instance across the entire browser session.
// Previously, every createClient() call created a fresh instance with a new connection.
let _cachedClient: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (!_cachedClient) {
    _cachedClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _cachedClient
}
