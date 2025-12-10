# Troubleshooting & Lessons Learned

This document captures the specific challenges encountered during the implementation of the Roof Worx Field App, particularly the Zoho CRM integration and Supabase Auth flow. Use this as a reference for future projects to avoid similar pitfalls.

## 1. Environment Variable Confusion (`CRON_SECRET` vs `ZOHO_WEBHOOK_SECRET`)

**The Issue:**
We initially used `CRON_SECRET` in the code (`process.env.CRON_SECRET`) but instructed the setup of `ZOHO_WEBHOOK_SECRET` in the documentation and Vercel. This led to `401 Unauthorized` errors because the code was checking against an undefined variable.

**The Fix:**
-   Ensure the code variable matches the Vercel environment variable exactly.
-   **Lesson:** Standardize naming early. If a secret is used for a webhook, `WEBHOOK_SECRET` is better than `CRON_SECRET` to avoid ambiguity.

## 2. Zoho Connection Types (OAuth vs Custom Service)

**The Issue:**
We used the existing `portal_conn` (a "Zoho OAuth" connection) to call our Next.js app.
-   **Zoho OAuth** connections inject `Authorization: Zoho-oauthtoken ...` intended for Zoho APIs.
-   Our Next.js app expected `Authorization: Bearer <OUR_SECRET>`.
-   Result: `401 Unauthorized`.

**The Fix:**
-   Created a **Custom Service** connection (`roofworx_app_conn`) with `Authentication Type: API Key`.
-   Configured it to inject `Authorization: Bearer <SECRET>` into the header.
-   **Lesson:** "Zoho OAuth" connections are for Zoho calling Zoho. "Custom Service" connections are for Zoho calling external apps.

## 3. Zoho Deluge Payload Formatting

**The Issue:**
We encountered `400 Bad Request` ("Missing required fields") because the Next.js API wasn't receiving the JSON body correctly.
-   Using `parameters: payload.toString()` in `invokeurl` often sends data as `application/x-www-form-urlencoded` or a stringified key-value pair, not raw JSON.

**The Fix:**
-   Explicitly set the header: `headers.put("Content-Type", "application/json")`.
-   Passed the JSON string as the `parameters` argument (which acts as the body when the content-type is JSON).
-   **Lesson:** Always explicit set `Content-Type: application/json` when sending JSON from Deluge.

## 4. Supabase Service Role Key

**The Issue:**
We encountered `500 Internal Server Error` on the provisioning route.
-   The server-side admin client (`createAdminClient`) requires the `SUPABASE_SERVICE_ROLE_KEY` to bypass Row Level Security (RLS) and create users.
-   This key was missing from Vercel environment variables.

**The Fix:**
-   Added `SUPABASE_SERVICE_ROLE_KEY` to Vercel (obtained from Supabase > Project Settings > API).
-   **Lesson:** Client-side uses `ANON_KEY`. Server-side admin tasks (user creation) use `SERVICE_ROLE_KEY`. Never expose the Service Role Key to the client.

## 5. Vercel Cron Job Limits

**The Issue:**
Deployment failed with "Hobby accounts are limited to daily cron jobs".
-   We had configured a cron job to run hourly (`0 * * * *`).

**The Fix:**
-   Changed schedule to daily (`0 0 * * *`).
-   **Lesson:** Check platform limits (Vercel Hobby Tier) before defining cron schedules.

## 6. Next.js Build Time Errors

**The Issue:**
1.  **Unescaped JSX**: Apostrophes in text (e.g., `We'll`) caused build failures. Fixed by using `&apos;`.
2.  **Database Connection**: The build failed because `DATABASE_URL` was missing in the local/build environment, and the `db.ts` file initialized the connection at the top level.

**The Fix:**
-   Added fallback logic in `db.ts`: `process.env.DATABASE_URL || "postgres://..."` to allow the build to proceed (even if the connection isn't usable).
-   **Lesson:** Ensure top-level code in library files handles missing environment variables gracefully during the build phase.

## 7. Layout & Redirects

**The Issue:**
-   The "Update Password" page showed the bottom navigation bar (intended for logged-in users).
-   After updating the password, users weren't forced to re-login.

**The Fix:**
-   Updated `Layout.tsx` to conditionally hide `BottomNav` for `/update-password`.
-   Added `supabase.auth.signOut()` and redirected to `/login` after password update.
-   **Lesson:** explicit layout control per route is often necessary. Password changes should always invalidate the current session for security.

## 8. Data Sync Strategy & Scalability (Global vs User-Scoped)

**The Evolution:**
1.  **Phase 1 (Global):** We synced ALL deals to a single Redis key.
    *   *Problem:* Every user saw every project. No privacy/relevance.
2.  **Phase 2 (Iterative Sync):** We considered fetching "Related Deals" for each user individually.
    *   *Bottleneck:* This causes an **N+1 API Call** problem. For 100 users, we make 101 calls. This hits Zoho API limits and times out Vercel functions.
3.  **Phase 3 (Junction Module - The Fix):** We utilized a custom module `Portal_Us_X_Job_Ticke` acting as a junction table.
    *   *Benefit:* We fetch **ALL** connections in a single API call.
    *   *Result:* Sync time reduced from O(Users) to O(1). "Blazingly fast" and scalable.

**Lesson:**
When syncing relational data from Zoho, avoid iterating parent records to fetch children. Instead, fetch the child/junction module directly and group in code.

## 9. Redis Hash Storage Pattern (Time Entries)

**The Issue:**
Initially tried to store entry objects directly in Redis Hash using `redis.hset(key, object)`, which spreads object properties into multiple hash fields. This made retrieval inconsistent.

**The Fix:**
Store entire entry as JSON string in a single hash field:
```typescript
// Store
await redis.hset(`entry:${id}`, { data: JSON.stringify(entry) })

// Read
const json = await redis.hget<string>(`entry:${id}`, 'data')
const entry = json ? JSON.parse(json) : null
```

**Why This Pattern:**
- Matches the pattern used for projects (`projects:data` hash)
- Single field = single read operation
- Easy to update (replace entire JSON string)
- Consistent with how we store complex objects

**Lesson:**
For complex objects in Redis Hash, store as JSON string in a single field rather than spreading properties. This provides consistency and easier updates.

## 10. Write-Behind Pattern with waitUntil

**The Challenge:**
Need to return success immediately while ensuring data is persisted to Postgres.

**The Solution:**
Use Vercel's `waitUntil` to keep function alive after response is sent:

```typescript
import { waitUntil } from '@vercel/functions'

export async function POST(request: NextRequest) {
  // 1. Write to Redis (blocking, fast)
  await redis.hset(key, data)
  
  // 2. Background sync (non-blocking)
  waitUntil(
    (async () => {
      await syncToPostgres(data)
    })()
  )
  
  // 3. Return immediately
  return NextResponse.json({ success: true })
}
```

**Key Points:**
- `waitUntil` must be called BEFORE response is sent
- Errors in `waitUntil` don't affect the response
- Function stays alive until promise resolves (up to Vercel limits)
- Perfect for Postgres writes (typically <2s)

**Common Mistakes:**
- Calling `waitUntil` after `return` (won't work)
- Throwing errors in `waitUntil` (affects function, not user)
- Not wrapping in async function (can't await)

**Lesson:**
`waitUntil` is perfect for write-behind patterns. Keep it simple - don't over-engineer with queues unless you have very high volume or long-running tasks.

## 11. Self-Healing with Piggyback Recovery

**The Problem:**
What if background sync fails? Do we need a separate cron job to retry?

**The Solution:**
Piggyback recovery - retry failed syncs on every new entry submission:

```typescript
waitUntil(
  (async () => {
    // Sync current entry
    await syncToPermanentStorage(entryData, userEmail)
    
    // Also retry any previous failures
    await retryFailedSyncs(userEmail, userId)
  })()
)
```

**Why It Works:**
- Users typically submit multiple entries per day
- Failed syncs get retried automatically on next action
- No separate monitoring/cron infrastructure needed
- Self-healing without additional complexity

**Edge Cases:**
- User never submits again? → Data still in Redis (30 days), can add manual retry endpoint
- Very high failure rate? → Add lightweight cron for "orphaned" entries
- Need immediate retry? → Add manual "Retry Sync" button in UI

**Lesson:**
Piggyback recovery is elegant for self-healing. Only add separate retry mechanisms if you have specific requirements (e.g., SLA guarantees, very high failure rates).

## 12. Redis ZSET vs Simple Set for Date Queries

**The Challenge:**
Need to fetch entries sorted by date and support date-range queries efficiently.

**Initial Approach:**
Simple Set + fetch all + sort in code:
```typescript
const ids = await redis.smembers(key)
const entries = await fetchEntries(ids)
entries.sort((a, b) => new Date(b.date) - new Date(a.date))
```

**The Problem:**
- Fetching all entries even if only need last 7 days
- Sorting in code (slower, more memory)
- Can't do efficient date-range queries

**The Solution:**
Redis ZSET with timestamp as score:
```typescript
// Add with timestamp score
const timestamp = new Date(entry.date).getTime()
await redis.zadd(key, { score: timestamp, member: entryId })

// Fetch newest first
const ids = await redis.zrange(key, 0, -1, { byScore: true, rev: true })

// Fetch date range
const minScore = new Date('2024-01-01').getTime()
const maxScore = new Date('2024-01-31').getTime()
const ids = await redis.zrange(key, minScore, maxScore, { byScore: true })
```

**Benefits:**
- Automatic sorting by date
- Efficient range queries (O(log N) instead of O(N))
- Can fetch "last N entries" without fetching all
- Supports pagination naturally

**Lesson:**
When you need sorted data or range queries, ZSET is worth the slight complexity. The performance benefits are significant, especially as data grows.

## 13. TTL Management for Memory Constraints

**The Constraint:**
Redis has 250MB limit. Can't cache forever.

**The Solution:**
30-day TTL on all entry-related keys:
```typescript
const ttlSeconds = 30 * 24 * 60 * 60 // 30 days
await redis.expire(entryKey, ttlSeconds)
await redis.expire(zsetKey, ttlSeconds)
```

**Why 30 Days:**
- Covers typical "recent entries" use case
- Most queries are for last week/month
- Older data falls back to Postgres (still fast)
- Automatic cleanup prevents memory issues

**Monitoring:**
- Track Redis memory usage in Upstash dashboard
- Adjust TTL if needed (e.g., 14 days for higher volume)
- Consider separate TTL for different data types

**Lesson:**
TTL is essential for bounded memory. Choose TTL based on query patterns, not just "as long as possible". 30 days is a good default for time-series data.

## 14. React Query Caching Strategy

**The Challenge:**
Balance freshness with performance. Don't refetch too often, but show recent data.

**The Solution:**
```typescript
useQuery({
  queryKey: ['time-entries', days],
  queryFn: async () => {
    const { data } = await axios.get('/api/time-entries', { params: { days } })
    return data
  },
  staleTime: 60 * 1000, // 1 minute - data is fresh for 1 min
  gcTime: 5 * 60 * 1000, // 5 minutes - cache for 5 min
})
```

**Why These Values:**
- `staleTime: 1 min` - Entries change frequently, but not every second
- `gcTime: 5 min` - Keep in cache for quick navigation, but not forever
- Different from projects (which use `staleTime: 5 min` because they change less)

**Pattern:**
- High-frequency data (entries): Short staleTime (1 min)
- Low-frequency data (projects): Longer staleTime (5 min)
- Always set gcTime > staleTime

**Lesson:**
Tune React Query cache times based on data change frequency. There's no one-size-fits-all. Monitor and adjust based on user behavior.

## 15. QueryClient Provider Setup Issues

**The Problem:**
After implementing React Query hooks (`useTimeEntries`, `useProjects`), the app threw "No QueryClient set, use QueryClientProvider to set one" errors.

**Root Causes:**
1. **Build Cache Issues:** After clearing `.next` directory, the dev server was still running and trying to access deleted files
2. **QueryClient Initialization:** The initial setup used a complex pattern that might have hydration issues
3. **Server Restart Required:** Changes to Providers component require full dev server restart

**The Fix:**
1. **Simplified QueryClient Setup:**
   ```typescript
   export function Providers({ children }: { children: React.ReactNode }) {
     const [queryClient] = useState(
       () => new QueryClient({
         defaultOptions: {
           queries: {
             refetchOnWindowFocus: true,
             staleTime: 60 * 1000,
             gcTime: 5 * 60 * 1000,
             retry: 1,
           },
         },
       })
     )
     return <QueryClientProvider client={queryClient}>...</QueryClientProvider>
   }
   ```

2. **Clear Build Cache:**
   ```bash
   rm -rf .next
   npm run dev
   ```

3. **Verify Providers in Root Layout:**
   - Ensure `Providers` wraps all children in `src/app/layout.tsx`
   - Verify `"use client"` directive is present

**Lesson:**
- Always restart dev server after clearing `.next` cache
- Keep QueryClient initialization simple - `useState(() => new QueryClient())` is sufficient
- Verify Providers are in the root layout, not nested layouts

## 16. Database Connection Errors (Graceful Degradation)

**The Problem:**
API route `/api/time-entries` was throwing 500 errors when Postgres connection failed (`ECONNREFUSED`), even though Redis cache had data.

**The Issue:**
The GET endpoint was trying to query Postgres for older data without error handling, causing the entire request to fail even when Redis had recent entries.

**The Fix:**
Added try-catch around Postgres queries with graceful degradation:

```typescript
// 4. If requesting older data or cache miss, query Postgres
if (daysBack > 30 || entries.length === 0) {
  try {
    const postgresEntries = await db.select()...
    entries = [...entries, ...additionalEntries]
  } catch (dbError: any) {
    // Database connection failed - log but don't fail the request
    // Return Redis entries only (graceful degradation)
    console.error('[API] Postgres query failed (returning Redis entries only):', dbError?.message)
    // Don't throw - return what we have from Redis
  }
}
```

**Benefits:**
- App continues working even if Postgres is down
- Users can still see recent entries (last 30 days from Redis)
- Better user experience - no complete failure

**Lesson:**
Always implement graceful degradation for non-critical data sources. If you have a cache, use it as a fallback. Don't let one service failure break the entire app.

## 17. Responsive Layout Breakpoint Confusion (iPad vs Desktop)

**The Problem:**
iPad Pro (1024px) was showing phone-like centered layout instead of full-width tablet layout.

**Root Cause:**
- Tailwind `lg` breakpoint = 1024px (exactly iPad Pro width)
- Code used `lg:max-w-md` which triggered on iPad, shrinking it back to phone size
- Intended behavior: iPad should be full-width, only desktop (1280px+) should be phone-like

**The Fix:**
Changed all `lg:` breakpoints to `xl:` (1280px+):

```typescript
// Before (WRONG for iPad)
className="max-w-md md:max-w-none lg:max-w-md"

// After (CORRECT)
className="max-w-md md:max-w-none xl:max-w-md"
```

**Breakpoint Strategy:**
- **Mobile (< 768px):** `max-w-md` - Phone size, centered
- **Tablet/iPad (768px - 1279px):** `max-w-none` - Full width
- **Desktop (1280px+):** `max-w-md` - Phone size, centered (like mobile app in browser)

**Files Updated:**
- `src/components/Layout.tsx`
- `src/app/(main)/layout.tsx`
- All page components (dashboard, entry/new, history, projects, profile)

**Lesson:**
- Know your device widths: iPad Pro = 1024px, Desktop = 1280px+
- Use `xl:` (1280px) for desktop, not `lg:` (1024px)
- Test on actual devices or use browser dev tools with correct dimensions
- Tailwind breakpoints: `sm:640px`, `md:768px`, `lg:1024px`, `xl:1280px`, `2xl:1536px`

## 18. Fixed vs Inline Buttons (Mobile App UX)

**The Problem:**
Time entry form had buttons in a `fixed` position at the bottom, which felt disconnected from the content and didn't scroll naturally.

**User Feedback:**
"Everything should be in the same window like before. Like in a mobile app view."

**The Fix:**
Moved buttons from `fixed` position to inline within scrollable content:

```typescript
// Before (WRONG - fixed at bottom)
<div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
  <button>Cancel</button>
  <button>Submit</button>
</div>

// After (CORRECT - inline in content)
<section className="pt-4 border-t border-gray-200">
  <div className="flex flex-col sm:flex-row gap-3">
    <button>Cancel</button>
    <button>Submit</button>
  </div>
</section>
```

**Benefits:**
- Natural scrolling - buttons scroll with content
- Better mobile UX - feels like native app
- No z-index issues
- Works better with bottom navigation

**Lesson:**
For mobile-first apps, prefer inline content over fixed elements. Fixed elements should be reserved for navigation (header, bottom nav), not form actions. Users expect to scroll to see all content, including buttons.

## 19. Form Simplification (Removing Unnecessary Fields)

**The Problem:**
Initial form had too many fields that weren't needed:
- Safety checklist (PPE, Ladder, Hazards)
- Employee field
- Lunch Start/End times
- Extras/Change Order field
- Multi-step wizard

**User Request:**
"Simple time entry" - just the essentials.

**The Solution:**
Simplified to single-page form with only:
- Job (required)
- Date (required, defaults to today)
- Start Time (required)
- End Time (required)
- Notes (optional)

**Removed:**
- Safety checklist section
- Employee field
- Lunch time fields
- Change order/extras field
- Multi-step wizard (3 steps → 1 page)

**Code Changes:**
- Removed `safetyChecks` state
- Removed `lunchStart`, `lunchEnd` state
- Removed `extras` state
- Removed step navigation logic
- Simplified validation (only job, date, start/end time required)
- Updated total hours calculation (no lunch deduction)

**Lesson:**
Start with the simplest form possible. Add fields only when users explicitly request them. Multi-step forms add complexity - single page is often better for mobile. Always ask "what's the minimum viable form?"

## 20. Time Entry Write-Behind Implementation

**The Challenge:**
Implementing the "Optimistic & Self-Healing" write-behind pattern for time entries with:
- Sub-50ms write responses
- Background sync to Postgres + Zoho
- Self-healing retry mechanism
- 30-day TTL for Redis memory management

**Key Implementation Details:**

1. **Redis Hash Storage Pattern:**
   ```typescript
   // Store entire entry as JSON string
   await redis.hset(`entry:${id}`, JSON.stringify(entryData))
   
   // Read back
   const json = await redis.hget<string>(`entry:${id}`)
   const entry = json ? JSON.parse(json) : null
   ```

2. **ZSET for Date Queries:**
   ```typescript
   // Add with timestamp score
   const timestamp = new Date(entryData.date).getTime()
   await redis.zadd(`user:${email}:entries:by-date`, { score: timestamp, member: entryId })
   
   // Fetch sorted by date
   const ids = await redis.zrange(key, 0, -1, { byScore: true, rev: true })
   ```

3. **waitUntil Pattern:**
   ```typescript
   // Return immediately
   await redis.hset(entryKey, JSON.stringify(entryData))
   
   // Background sync (non-blocking)
   waitUntil(
     (async () => {
       await syncToPermanentStorage(entryData, userEmail)
       await retryFailedSyncs(userEmail, userId)
     })()
   )
   
   return NextResponse.json({ id: entryId, ...entryData }, { status: 201 })
   ```

**Common Issues:**

1. **Redis Hash Value Type:**
   - Issue: Tried to store object directly, but Upstash requires string values
   - Fix: Always stringify objects: `JSON.stringify(entryData)`

2. **ZSET Score Type:**
   - Issue: Need numeric timestamp for sorting
   - Fix: Use `new Date(dateString).getTime()` for score

3. **TTL on Multiple Keys:**
   - Issue: Need to set TTL on both Hash and ZSET
   - Fix: Set TTL on both keys separately:
     ```typescript
     await redis.expire(entryKey, ttlSeconds)
     await redis.expire(zsetKey, ttlSeconds)
     ```

4. **Background Error Handling:**
   - Issue: Errors in `waitUntil` can crash the function
   - Fix: Always wrap in try-catch, don't throw:
     ```typescript
     waitUntil(
       (async () => {
         try {
           await syncToPermanentStorage(...)
         } catch (error) {
           console.error('Background error:', error)
           // Don't throw - background processing
         }
       })()
     )
     ```

**Performance Results:**
- Write response: <50ms (Redis only)
- Background sync: <2s (non-blocking)
- Read (cache hit): <50ms
- Read (cache miss): <200ms (Postgres fallback)

**Lesson:**
- Write-behind pattern provides excellent UX (instant feedback)
- `waitUntil` is perfect for this use case (no queues needed)
- Always handle background errors gracefully
- TTL is essential for memory-constrained environments
- Piggyback recovery eliminates need for separate cron jobs

## 21. React Query `initialData` Preventing Data Fetching

**The Problem:**
Projects page showed "No projects found" even though:
- The API endpoint (`/api/projects`) was returning data correctly (verified in browser Network tab)
- Redis had project data (verified in logs)
- The API response was valid JSON with project objects

**Root Cause:**
The `useProjects` hook had `initialData: []` configured:
```typescript
useQuery({
  queryKey: ['projects'],
  queryFn: async () => { ... },
  initialData: [], // ❌ This was the problem
})
```

**Why This Breaks:**
React Query treats `initialData` as "already fetched data". When you provide `initialData: []`, React Query thinks:
1. "I already have data (empty array)"
2. "The data is fresh (no staleTime check needed)"
3. "I don't need to call `queryFn`"

This prevents the `queryFn` from ever executing, even on component mount.

**The Symptoms:**
- ✅ API endpoint works (returns data in Network tab)
- ✅ Backend logs show data being fetched
- ❌ Frontend shows "No projects found"
- ❌ React Query never calls `queryFn` (no network request from hook)
- ❌ `isLoading` stays `false` (because it thinks it has data)

**The Fix:**
Remove `initialData` and add `refetchOnMount: true`:

```typescript
useQuery({
  queryKey: ['projects'],
  queryFn: async () => {
    try {
      const { data } = await axios.get('/api/projects', {
        timeout: 3000, // Fail fast
      })
      return data || [] // Return empty array on error, not as initialData
    } catch (error) {
      console.warn('[useProjects] API error:', error)
      return [] // Return empty array on error
    }
  },
  // ❌ Remove initialData: []
  // ✅ Add refetchOnMount to ensure fresh data
  refetchOnMount: true,
  retry: 0, // Fail fast
  throwOnError: false, // Don't throw, return empty array
})
```

**Component-Level Fix:**
Also ensure the component checks `isLoading` before showing "no data":

```typescript
// ❌ WRONG - shows "no data" while loading
if (!projects || projects.length === 0) {
  return <div>No projects found</div>
}

// ✅ CORRECT - only show "no data" after loading completes
if (isLoading) {
  return <div>Loading...</div>
}

if (!isLoading && (!projects || projects.length === 0)) {
  return <div>No projects found</div>
}
```

**Test Cases:**

1. **Fresh Mount (No Cache):**
   - Expected: `queryFn` executes, shows loading, then data
   - With `initialData: []`: ❌ Never calls `queryFn`, shows empty immediately
   - Without `initialData`: ✅ Calls `queryFn`, shows loading, then data

2. **Stale Cache:**
   - Expected: `queryFn` executes in background, shows cached data, then updates
   - With `initialData: []`: ❌ Never calls `queryFn`, shows empty
   - Without `initialData`: ✅ Calls `queryFn`, shows cached data, then updates

3. **Error State:**
   - Expected: Shows error or empty state after failed fetch
   - With `initialData: []`: ❌ Never attempts fetch, shows empty (hides error)
   - Without `initialData`: ✅ Attempts fetch, shows error/empty on failure

**When to Use `initialData`:**
- ✅ **Good:** Server-side rendering (SSR) - you already have data from server
- ✅ **Good:** Optimistic updates - you know what the data will be
- ❌ **Bad:** Empty arrays/objects - prevents fetching
- ❌ **Bad:** Default values - use `placeholderData` instead

**Alternative: `placeholderData`**
If you need a default value but still want to fetch:
```typescript
useQuery({
  queryKey: ['projects'],
  queryFn: async () => { ... },
  placeholderData: [], // ✅ Shows empty array while loading, but still fetches
  // This is different from initialData - it doesn't prevent fetching
})
```

**Debugging Checklist:**
1. ✅ Check Network tab - is the API being called?
2. ✅ Check React Query DevTools - what's the query state?
3. ✅ Check `isLoading` - is it stuck at `false`?
4. ✅ Check `queryFn` - add `console.log` to see if it's called
5. ✅ Check `initialData` - remove it if present
6. ✅ Check `refetchOnMount` - add it if missing

**Lesson:**
- **Never use `initialData: []` or `initialData: {}`** - it prevents fetching
- Use `placeholderData` if you need default values during loading
- Use `initialData` only when you have real data (e.g., from SSR)
- Always check `isLoading` before showing "no data" messages
- Add `refetchOnMount: true` if you want fresh data on every mount
- When debugging "no data" issues, check React Query state, not just API responses
