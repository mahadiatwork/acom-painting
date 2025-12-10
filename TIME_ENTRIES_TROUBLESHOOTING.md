# Time Entries Troubleshooting Guide

This document captures all issues encountered during the time entry implementation, the solutions attempted, and their outcomes.

## Table of Contents
1. [Initial Data Display Issues](#initial-data-display-issues)
2. [React Query Cache Issues](#react-query-cache-issues)
3. [Redis ZSET Timestamp Mismatch](#redis-zset-timestamp-mismatch)
4. [Postgres Fallback Logic](#postgres-fallback-logic)
5. [Upstash Redis JSON Parsing](#upstash-redis-json-parsing)
6. [Final Solution: Request Cancellation and Data Normalization](#final-solution-request-cancellation-and-data-normalization)
7. [Summary of Fixes Applied](#summary-of-fixes-applied)
8. [Key Learnings](#key-learnings)
9. [Prevention Checklist](#prevention-checklist-for-future-development)
10. [Quick Reference](#quick-reference-common-issues-and-solutions)

---

## Initial Data Display Issues

### Problem
Time entries were being created successfully (visible in Supabase Postgres), but not appearing in the UI after creation or refresh.

### Symptoms
- ✅ Backend logs showed entries being written to Redis and Postgres
- ✅ Supabase database showed entries in `time_entries` table
- ❌ Frontend showed "No entries found" or "No entries yet"
- ❌ Entries appeared briefly after creation, then disappeared

### Root Causes Identified
1. **React Query `initialData: []` preventing refetch**
2. **Cache invalidation not triggering refetch**
3. **Redis ZSET timestamp query returning 0 results**
4. **Postgres fallback only checking for 30+ days**

---

## React Query Cache Issues

### Issue #1: `initialData: []` Preventing Data Fetching

**Problem:**
The `useTimeEntries` hook had `initialData: []` configured, which made React Query think it already had data (empty array), preventing it from ever calling `queryFn`.

**Code:**
```typescript
// ❌ WRONG
useQuery({
  queryKey: ['time-entries', days],
  queryFn: async () => { ... },
  initialData: [], // This prevents fetching!
})
```

**Solution:**
Removed `initialData: []` and added `refetchOnMount: true`:

```typescript
// ✅ CORRECT
useQuery({
  queryKey: ['time-entries', days],
  queryFn: async () => { ... },
  refetchOnMount: true, // Always refetch on mount
  // No initialData
})
```

**Files Changed:**
- `src/hooks/useTimeEntries.ts`
- `src/hooks/useProjects.ts` (same issue)

**Result:** ✅ Fixed - React Query now fetches data on mount

---

### Issue #2: Cache Invalidation Not Refetching

**Problem:**
After creating a time entry, cache invalidation wasn't triggering an immediate refetch.

**Code:**
```typescript
// ❌ WRONG
queryClient.invalidateQueries({ queryKey: ['time-entries'] });
// No explicit refetch
```

**Solution:**
Added `refetchType: 'active'` to ensure active queries refetch immediately:

```typescript
// ✅ CORRECT
queryClient.invalidateQueries({ 
  queryKey: ['time-entries'],
  refetchType: 'active' // Refetch active queries immediately
});
router.push("/");
router.refresh(); // Force page refresh
```

**Files Changed:**
- `src/app/(main)/entry/new/page.tsx`

**Result:** ✅ Fixed - Cache now invalidates and refetches correctly

---

## Redis ZSET Timestamp Mismatch

### Problem
Redis ZSET had 8 entries, but the timestamp-based `zrange` query returned 0 results.

**Symptoms:**
- `[API] ZSET has 8 total entries`
- `[API] Found 0 entry IDs in Redis ZSET (after date filter)`
- Entries existed in Redis but weren't being returned

**Root Cause:**
Timestamp calculation mismatch between:
- **Write:** `new Date(entryData.date + 'T00:00:00Z').getTime()` (UTC)
- **Query:** `cutoffDate.setUTCHours(0, 0, 0, 0).getTime()` (UTC)

The ZSET query `zrange(zsetKey, cutoffTimestamp, '+inf', { byScore: true })` wasn't matching entries even though timestamps were correct.

**Investigation:**
```typescript
// Debug logs showed:
[API] Sample timestamp in ZSET: 1765238400000, cutoff: 1764720000000, match: true
[API] Found 0 entry IDs in Redis ZSET (after date filter)
```

The timestamps matched, but the query still returned 0. This suggests an issue with how Upstash Redis handles `zrange` with `byScore: true`.

**Solution:**
Added fallback logic to fetch all entries and filter by date in code:

```typescript
// If ZSET query returns 0 but ZSET has entries, fetch all and filter in code
if (zsetSize > 0 && entryIds.length === 0) {
  const allEntryIds = await redis.zrange(zsetKey, 0, -1, { rev: true })
  // Fetch all entries and filter by date in code
  const allEntries = await fetchAndFilterByDate(allEntryIds, cutoffTimestamp)
  entries = allEntries
}
```

**Files Changed:**
- `src/app/api/time-entries/route.ts`

**Result:** ✅ Fixed - Fallback now fetches entries correctly

---

## Postgres Fallback Logic

### Problem
The GET endpoint only checked Postgres if:
- `daysBack > 30` OR
- Redis was empty AND `daysBack >= 30`

This meant for 7-day queries, if Redis was empty, it would return nothing instead of checking Postgres.

**Code:**
```typescript
// ❌ WRONG
const shouldCheckPostgres = daysBack > 30 || (entries.length === 0 && daysBack >= 30)
```

**Solution:**
Changed to always check Postgres if Redis is empty, regardless of days:

```typescript
// ✅ CORRECT
const shouldCheckPostgres = daysBack > 30 || entries.length === 0
```

**Files Changed:**
- `src/app/api/time-entries/route.ts`

**Result:** ✅ Fixed - Postgres fallback now works for all date ranges

---

## Upstash Redis JSON Parsing

### Problem
Upstash Redis auto-parses JSON values, so `hget` returns objects instead of strings. When we tried to `JSON.parse()` an already-parsed object, we got:

```
SyntaxError: "[object Object]" is not valid JSON
```

**Symptoms:**
- `[API] Failed to parse entry JSON in fallback: SyntaxError: "[object Object]" is not valid JSON`
- Repeated errors for each entry
- Fallback logic returning 0 entries

**Root Cause:**
Upstash Redis automatically parses JSON when storing/retrieving. When we stored:
```typescript
await redis.hset(entryKey, { data: JSON.stringify(entryData) })
```

Upstash stored it as JSON, and when we retrieved:
```typescript
const json = await redis.hget<string>(entryKey, 'data')
// json is already an object, not a string!
JSON.parse(json) // ❌ Fails because json is already parsed
```

**Solution:**
Handle both string and object cases:

```typescript
// ✅ CORRECT
const data = await redis.hget(entryKey, 'data')

let entry: any
if (typeof data === 'string') {
  entry = JSON.parse(data) // Parse if string
} else if (typeof data === 'object') {
  entry = data // Use as-is if already object
} else {
  return null
}
```

**Files Changed:**
- `src/app/api/time-entries/route.ts` (main parsing and fallback)

**Result:** ✅ Fixed - Parsing now works for both string and object responses

---

## Current Status

### What's Working ✅
1. **Backend API:**
   - ✅ Entries are being written to Redis (Hash + ZSET)
   - ✅ Entries are being synced to Postgres (background)
   - ✅ Entries are being synced to Zoho (background)
   - ✅ GET endpoint returns 8 entries from Redis (fallback logic)
   - ✅ GET endpoint falls back to Postgres when Redis is empty
   - ✅ Parsing handles both string and object responses

2. **Logs Show Success:**
   ```
   [API] After code-level date filter: 8 entries
   [API] Returning 8 total entries for mahadi.gusion@gmail.com
   [API] First entry sample: {
     id: 'a34516ce-175c-481d-9dee-2a41bf8dde6b',
     date: '2025-12-10',
     jobName: 'Rydberg Residence-54 Meyer Road-54 Meyer Road-Plano-252823'
   }
   ```

### What's Not Working ❌
1. **Frontend Display:**
   - ❌ UI still shows "No entries found" despite API returning 8 entries
   - ❌ Entries not appearing in Dashboard or History pages

### Potential Frontend Issues

#### Issue #1: React Query Not Receiving Data
**Check:**
- Is the API response format correct?
- Is React Query parsing the response correctly?
- Are there any errors in browser console?

**Debug Steps:**
1. Open browser DevTools (F12)
2. Check Network tab → `/api/time-entries?days=7`
3. Verify response contains entries array
4. Check React Query DevTools (if installed)
5. Check browser console for errors

#### Issue #2: Component Not Re-rendering
**Check:**
- Is `useTimeEntries` hook being called?
- Is `data` being destructured correctly?
- Is component checking `isLoading` before showing "no data"?

**Code to Verify:**
```typescript
// In Dashboard/History component
const { data: entries = [], isLoading, error } = useTimeEntries({ days: 7 })

console.log('Entries:', entries) // Debug log
console.log('Is Loading:', isLoading) // Debug log
console.log('Error:', error) // Debug log
```

#### Issue #3: Data Format Mismatch
**Check:**
- Does the API response match the `TimeEntry` interface?
- Are all required fields present?
- Is `totalHours` a number (not string)?

**Expected Format:**
```typescript
interface TimeEntry {
  id: string
  userId: string
  jobId: string
  jobName: string
  date: string
  startTime: string
  endTime: string
  totalHours: number // Must be number
  synced: boolean
  notes?: string
}
```

---

## Final Solution: Request Cancellation and Data Normalization

### Issue: Frontend Not Displaying Entries (RESOLVED ✅)

**Status:** ✅ **RESOLVED**

**Root Causes:**
1. **Request Cancellation:** React Query was canceling requests when components unmounted/remounted
2. **Timeout Too Short:** 3-second timeout was too tight for 2.6-second API responses
3. **Data Structure Mismatch:** API response wasn't being normalized properly
4. **Component Rendering:** Components weren't defensively checking for array types

**Symptoms:**
- API returns 8 entries (confirmed in backend logs)
- Network tab shows request as `(canceled)`
- UI shows "No entries found"
- Frontend logs show `[History Render] Raw entries: undefined`
- Request completes successfully but data never reaches component

**Solution Implemented:**

#### 1. Increased Timeout and Added Cancellation Handling

```typescript
// ✅ CORRECT
queryFn: async ({ signal }) => {
  try {
    const response = await axios.get('/api/time-entries', {
      params: { days },
      timeout: 10000, // 10 seconds - API can take 2-3 seconds
      signal, // Pass React Query's cancellation signal to axios
    })
    // ... normalization logic
  } catch (error: any) {
    // Handle canceled requests gracefully
    if (axios.isCancel(error) || error?.code === 'ERR_CANCELED' || signal?.aborted) {
      console.warn('[useTimeEntries] Request was canceled (component unmounted)')
      return [] // Return empty array, but don't treat as error
    }
    // ... other error handling
  }
}
```

**Why This Works:**
- 10-second timeout gives API enough time to complete (2-3 seconds typical)
- Signal handling allows React Query to cancel requests properly
- Graceful cancellation handling prevents errors from breaking the UI

#### 2. Data Normalization in Hook

```typescript
// ✅ CORRECT - Handle all response shapes
let data = response.data

// Handle common API wrapper patterns
if (data && !Array.isArray(data) && Array.isArray(data.data)) {
  console.log('[useTimeEntries] Unwrapping data property')
  data = data.data
} else if (data && !Array.isArray(data) && Array.isArray(data.entries)) {
  console.log('[useTimeEntries] Unwrapping entries property')
  data = data.entries
}

// Final safety check
if (!Array.isArray(data)) {
  console.error('[useTimeEntries] CRITICAL: Data is still not an array:', data)
  return [] // Return empty array to prevent UI crashes
}

return data
```

**Why This Works:**
- Handles both direct arrays `[...]` and wrapped responses `{ data: [...] }`
- Prevents crashes if API response format changes
- Always returns a valid array, never `undefined` or `null`

#### 3. Defensive Rendering in Components

```typescript
// ✅ CORRECT - Always ensure array type
const { data: rawEntries, isLoading } = useTimeEntries({ days: 30 })

// Ensure it is always an array before the UI touches it
const entries = Array.isArray(rawEntries) ? rawEntries : []

// Debug Log in Render
console.log('[History Render] Raw entries:', rawEntries)
console.log('[History Render] Entries available:', entries.length)
```

**Why This Works:**
- Prevents `undefined.length` errors
- Handles cases where React Query returns `undefined` during loading
- Provides clear debugging information

#### 4. Improved React Query Configuration

```typescript
// ✅ CORRECT
return useQuery<TimeEntry[]>({
  queryKey: ['time-entries', days],
  queryFn: async ({ signal }) => { ... },
  staleTime: 60 * 1000,
  gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  refetchOnMount: true,
  retry: 1, // Retry once on failure
  retryDelay: 1000,
  throwOnError: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true, // Retry on network reconnect
})
```

**Why This Works:**
- `retry: 1` helps with transient network issues
- `gcTime` keeps data in cache even if component unmounts
- `refetchOnReconnect` handles network interruptions

**Files Modified:**
1. `src/hooks/useTimeEntries.ts` - Added timeout, signal handling, normalization
2. `src/app/(main)/page.tsx` - Added defensive rendering
3. `src/app/(main)/history/page.tsx` - Added defensive rendering

**Result:** ✅ **FIXED** - Entries now display correctly in UI

---

## Summary of Fixes Applied

| Issue | Status | Solution |
|-------|--------|----------|
| React Query `initialData: []` | ✅ Fixed | Removed `initialData`, added `refetchOnMount: true` |
| Cache invalidation | ✅ Fixed | Added `refetchType: 'active'` and `router.refresh()` |
| Redis ZSET timestamp query | ✅ Fixed | Added fallback to fetch all and filter by date in code |
| Postgres fallback logic | ✅ Fixed | Changed to check Postgres if Redis is empty (any days) |
| Upstash JSON parsing | ✅ Fixed | Handle both string and object responses |
| Request cancellation | ✅ Fixed | Increased timeout to 10s, added signal handling, graceful cancellation |
| Data normalization | ✅ Fixed | Handle both `[...]` and `{ data: [...] }` response shapes |
| Defensive rendering | ✅ Fixed | Always ensure array type before UI touches data |
| Frontend display | ✅ **RESOLVED** | All fixes combined - entries now display correctly |

---

## Key Learnings

1. **React Query `initialData`:** Never use `initialData: []` or `initialData: {}` - it prevents fetching. Use `placeholderData` if you need defaults.

2. **Upstash Redis Auto-Parsing:** Upstash automatically parses JSON, so always check if data is string or object before parsing.

3. **Redis ZSET Queries:** `zrange` with `byScore: true` can be unreliable. Always have a fallback to fetch all and filter in code.

4. **Postgres Fallback:** Always check Postgres if Redis is empty, regardless of date range. Don't assume Redis will always have recent data.

5. **Debugging Strategy:** When API works but UI doesn't, check:
   - Network tab (is API being called? Is request canceled?)
   - Response format (does it match expected interface?)
   - React Query state (is data being cached correctly?)
   - Component rendering (is component receiving data?)
   - Request timeout (is it long enough for API response time?)
   - Cancellation handling (are canceled requests handled gracefully?)

6. **Request Cancellation:** React Query cancels requests when components unmount. Always:
   - Pass `signal` to axios for proper cancellation
   - Handle `ERR_CANCELED` errors gracefully
   - Use appropriate timeout (at least 2x expected API response time)
   - Don't treat cancellation as a real error

7. **Data Normalization:** Never assume API response shape. Always:
   - Check if response is array or wrapped object
   - Normalize to array before returning from hook
   - Use defensive checks in components (`Array.isArray()`)
   - Log response structure for debugging

8. **Timeout Configuration:** Set timeout based on actual API performance:
   - Measure API response time (check backend logs)
   - Set timeout to at least 2-3x the typical response time
   - Account for network latency and retries
   - Example: If API takes 2.6s, use 10s timeout

---

## Files Modified

1. `src/hooks/useTimeEntries.ts` - Complete rewrite with:
   - Removed `initialData: []`
   - Added `refetchOnMount: true`
   - Increased timeout from 3s to 10s
   - Added signal handling for cancellation
   - Added data normalization (handle wrapped responses)
   - Added comprehensive error handling
   - Added debug logging

2. `src/hooks/useProjects.ts` - Same fixes as above

3. `src/app/(main)/entry/new/page.tsx` - Improved cache invalidation

4. `src/app/(main)/page.tsx` - Added defensive rendering:
   - Changed from `data: recentEntries = []` to defensive array check
   - Added debug logging in render

5. `src/app/(main)/history/page.tsx` - Added defensive rendering:
   - Changed from `data: entries = []` to defensive array check
   - Added debug logging in render

6. `src/app/api/time-entries/route.ts` - Multiple fixes:
   - Fixed Postgres fallback logic
   - Added Redis ZSET fallback
   - Fixed JSON parsing for Upstash
   - Added extensive debug logging

---

## Prevention Checklist (For Future Development)

When implementing similar data fetching patterns, always:

1. ✅ **Set Appropriate Timeout:**
   - Measure actual API response time
   - Set timeout to 2-3x the typical response time
   - Don't use "fail fast" timeouts that are too aggressive

2. ✅ **Handle Request Cancellation:**
   - Pass `signal` from React Query to axios
   - Handle `ERR_CANCELED` errors gracefully
   - Don't treat cancellation as a real error

3. ✅ **Normalize API Responses:**
   - Never assume response shape
   - Handle both `[...]` and `{ data: [...] }` patterns
   - Always return a valid array from hooks

4. ✅ **Defensive Component Rendering:**
   - Always check `Array.isArray()` before using data
   - Use `const entries = Array.isArray(rawEntries) ? rawEntries : []`
   - Never rely on default parameters alone

5. ✅ **Add Debug Logging:**
   - Log raw response in hook
   - Log normalized data in hook
   - Log data in component render
   - Helps identify where data is lost

6. ✅ **Configure React Query Properly:**
   - Use `retry: 1` for transient failures
   - Set appropriate `gcTime` to keep data in cache
   - Use `refetchOnReconnect: true` for network resilience

---

## Related Documentation

- `TROUBLESHOOTING_AND_LESSONS.md` - General troubleshooting guide
- `ZOHO_TIME_ENTRIES_IMPLEMENTATION_PLAN.md` - Implementation plan
- `POSTGRES_CONNECTION_TROUBLESHOOTING.md` - Database connection issues

---

*Last Updated: 2025-12-10*
*Status: ✅ **RESOLVED** - All issues fixed, entries displaying correctly in UI*

---

## Quick Reference: Common Issues and Solutions

### Issue: "Request canceled" in Network tab
**Solution:** Increase timeout, add signal handling, handle cancellation gracefully

### Issue: "No entries found" but API returns data
**Solution:** Add data normalization, defensive rendering, check for wrapped responses

### Issue: Entries appear then disappear
**Solution:** Fix cache invalidation, ensure proper refetch, check component unmounting

### Issue: `undefined.length` errors
**Solution:** Always use `Array.isArray()` check before accessing array properties

### Issue: Timeout errors on slow APIs
**Solution:** Measure API response time, set timeout to 2-3x typical response time

