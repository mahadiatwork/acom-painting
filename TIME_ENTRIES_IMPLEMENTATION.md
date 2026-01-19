# Time Entries Implementation Guide

This document captures the complete implementation of the "Optimistic & Self-Healing" write-behind architecture for time entries, including key decisions, patterns, and lessons learned.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Implementation Details](#implementation-details)
3. [Key Design Decisions](#key-design-decisions)
4. [Redis Data Structures](#redis-data-structures)
5. [API Endpoints](#api-endpoints)
6. [Frontend Integration](#frontend-integration)
7. [Common Patterns](#common-patterns)
8. [Testing Considerations](#testing-considerations)
9. [Deployment Checklist](#deployment-checklist)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### The "Optimistic & Self-Healing" Pattern

**Core Principle:** Return success immediately, sync in background, auto-retry failures.

```
User Submits Entry
    ↓
Write to Redis (<50ms) ← User sees success
    ↓
Background: Sync to Postgres + Zoho (non-blocking)
    ↓
Update Redis synced flag
    ↓
Piggyback: Retry any failed syncs
```

### Data Tiers

- **HOT (Redis):** Last 30 days, <50ms reads, auto-expires
- **WARM (Postgres):** Permanent storage, source of truth
- **COLD (Zoho):** Compliance/export, optional, can fail gracefully

---

## Implementation Details

### 1. Sync Utilities (`src/lib/sync-utils.ts`)

**Purpose:** Background sync logic that runs after user response is sent.

#### `syncToPermanentStorage(entryData, userEmail)`

**What it does:**
1. Writes entry to Postgres (source of truth)
2. Attempts Zoho sync (optional, failures are logged but don't block)
3. Updates Redis `synced` flag to `true` on success

**Key Points:**
- Uses `onConflictDoNothing()` for Postgres to handle race conditions
- Zoho failures are caught and logged, but don't throw
- Always updates Redis synced flag if entry exists in cache

**Error Handling:**
```typescript
try {
  // Postgres write
} catch (error) {
  // Log but don't throw - will be retried via piggyback
}
```

#### `retryFailedSyncs(userEmail, userId)`

**What it does:**
1. Scans user's Redis ZSET for all entry IDs
2. Checks each entry's `synced` status
3. Retries sync for any entries with `synced: false`
4. Validates `userId` matches for security

**Why it works:**
- Runs automatically on every new entry submission
- No cron jobs needed
- Self-healing: Failed syncs get retried on next user action

**Performance:**
- Only scans entries in Redis (last 30 days)
- Batch processing would be overkill for typical volumes

---

### 2. API Route (`src/app/api/time-entries/route.ts`)

#### GET Endpoint

**Flow:**
```
1. Authenticate user (Supabase)
2. Check query params (days back, default: 30)
3. Fetch from Redis ZSET (hot data)
4. If older data requested or cache miss → Query Postgres
5. Merge and sort results
6. Return to user
```

**Key Implementation Notes:**

```typescript
// Redis ZSET fetch with date filtering
const entryIds = await redis.zrange(zsetKey, 0, -1, { byScore: true, rev: true })

// Batch fetch entry details
const entryJsons = await Promise.all(
  entryIds.map(id => redis.hget<string>(`entry:${id}`, 'data'))
)

// Filter by date cutoff
.filter(entry => {
  const entryDate = new Date(entry.date).getTime()
  return entryDate >= cutoffTimestamp
})
```

**Postgres Fallback:**
- Only queries if `daysBack > 30` or Redis returns empty
- Uses `eq(timeEntries.userId, user.id)` for user scoping
- Merges with Redis results, avoiding duplicates

#### POST Endpoint

**Blocking Path (Immediate Response):**

```typescript
// 1. Generate UUID
const entryId = crypto.randomUUID()

// 2. Prepare entry data
const entryData = {
  id: entryId,
  userId: validated.userId,
  // ... all fields
  synced: false, // Will be updated after background sync
}

// 3. Write to Redis Hash
await redis.hset(`entry:${entryId}`, { data: JSON.stringify(entryData) })

// 4. Add to ZSET with timestamp score
await redis.zadd(zsetKey, { score: timestamp, member: entryId })

// 5. Set 30-day TTL
await redis.expire(entryKey, ttlSeconds)
await redis.expire(zsetKey, ttlSeconds)

// 6. Return immediately
return NextResponse.json({ id: entryId, ...entryData }, { status: 201 })
```

**Background Path (Non-Blocking):**

```typescript
waitUntil(
  (async () => {
    try {
      // Sync this entry
      await syncToPermanentStorage(entryData, user.email)
      
      // Piggyback recovery
      await retryFailedSyncs(user.email, user.id)
    } catch (error) {
      // Don't throw - background processing
      console.error('[API] Background sync error:', error)
    }
  })()
)
```

**Critical Points:**
- `waitUntil` keeps Vercel function alive after response is sent
- Background errors don't affect user experience
- Piggyback recovery runs on every write (self-healing)

---

## Key Design Decisions

### 1. Why Redis Hash + ZSET?

**Hash (`entry:{uuid}`):**
- Stores full entry JSON in single field (`data`)
- Enables O(1) lookup by ID
- Matches pattern used for projects

**ZSET (`user:{email}:entries:by-date`):**
- Sorted by timestamp (score = `new Date(entry.date).getTime()`)
- Enables efficient date-range queries
- Can fetch "last N entries" or "entries in date range"

**Alternative Considered:** Simple Set
- ❌ No ordering (would need to fetch all and sort)
- ❌ Can't do date-range queries efficiently
- ✅ ZSET provides both ordering and range queries

### 2. Why 30-Day TTL?

**Constraints:**
- Redis has 250MB limit
- Need to prevent unbounded growth
- Most queries are for recent data

**Decision:**
- 30 days covers typical "recent entries" use case
- Older data falls back to Postgres (still fast)
- Automatic cleanup prevents memory issues

**Adjustment:** Can be changed based on usage patterns:
```typescript
const ttlSeconds = 30 * 24 * 60 * 60 // Adjust days here
```

### 3. Why `waitUntil` Instead of Queue?

**Benefits:**
- No additional infrastructure (queues, workers)
- Simpler deployment (works on Vercel out of the box)
- Self-contained (sync logic in same codebase)

**Limitations:**
- Vercel Functions have execution time limits
- Not suitable for very long-running tasks
- For this use case (Postgres + Zoho write), it's perfect

**Alternative:** If volume grows, consider:
- Vercel Queue (new feature)
- External queue (Bull, BullMQ)
- Separate worker service

### 4. Why Piggyback Recovery?

**Problem:** What if background sync fails?

**Solution:** Retry on next user action

**Why it works:**
- Users typically submit multiple entries per day
- Failed syncs get retried automatically
- No separate monitoring/cron needed

**Edge Case:** User never submits again?
- Data is still in Redis (30 days)
- Can add manual retry endpoint if needed
- Or add lightweight cron for "orphaned" entries

---

## Redis Data Structures

### Entry Hash

**Key:** `entry:{uuid}`

**Structure:**
```typescript
{
  data: JSON.stringify({
    id: "uuid",
    userId: "supabase-user-id",
    jobId: "project-id",
    jobName: "Project Name",
    date: "2024-01-15",
    startTime: "08:00",
    endTime: "17:00",
    lunchStart: "12:00",
    lunchEnd: "12:30",
    totalHours: "8.5",
    notes: "Work notes...",
    changeOrder: "",
    synced: true // or false
  })
}
```

**TTL:** 30 days

**Operations:**
- Write: `redis.hset(key, { data: JSON.stringify(entry) })`
- Read: `redis.hget(key, 'data')`
- Update: `redis.hset(key, { data: JSON.stringify(updated) })`

### Entry Index (ZSET)

**Key:** `user:{email}:entries:by-date`

**Structure:**
```
Score: timestamp (new Date(entry.date).getTime())
Member: entryId (uuid)
```

**TTL:** 30 days

**Operations:**
- Add: `redis.zadd(key, { score: timestamp, member: entryId })`
- Fetch all: `redis.zrange(key, 0, -1, { byScore: true, rev: true })`
- Fetch range: `redis.zrange(key, minScore, maxScore, { byScore: true })`

**Why ZSET:**
- Sorted by date automatically
- Can query "entries from last week" efficiently
- Reverse order (`rev: true`) gives newest first

---

## API Endpoints

### GET `/api/time-entries`

**Query Parameters:**
- `days` (optional): Number of days back to fetch (default: 30)

**Response:**
```json
[
  {
    "id": "uuid",
    "userId": "user-id",
    "jobId": "project-id",
    "jobName": "Project Name",
    "date": "2024-01-15",
    "startTime": "08:00",
    "endTime": "17:00",
    "lunchStart": "12:00",
    "lunchEnd": "12:30",
    "totalHours": 8.5,
    "synced": true,
    "notes": "Work notes...",
    "changeOrder": ""
  }
]
```

**Performance:**
- Cache hit: <50ms
- Cache miss: <200ms (Postgres query)

### POST `/api/time-entries`

**Request Body:**
```json
{
  "jobId": "project-id",
  "jobName": "Project Name",
  "userId": "user-id",
  "date": "2024-01-15", // Optional, defaults to today
  "startTime": "08:00",
  "endTime": "17:00",
  "lunchStart": "12:00", // Optional
  "lunchEnd": "12:30", // Optional
  "totalHours": 8.5,
  "notes": "Work notes...", // Optional
  "changeOrder": "" // Optional
}
```

**Response:**
```json
{
  "id": "uuid",
  // ... same as request, plus generated id
}
```

**Performance:**
- Response time: <50ms (Redis write only)
- Background sync: <2s (non-blocking)

---

## Frontend Integration

### React Query Hooks

#### `useTimeEntries(options?)`

**Usage:**
```typescript
const { data: entries, isLoading, isError } = useTimeEntries({ days: 30 })
```

**Features:**
- Automatic caching (5 minutes)
- Refetch on window focus
- Error handling built-in

#### `useRecentEntries(limit)`

**Usage:**
```typescript
const { data: recentEntries } = useRecentEntries(5)
```

**Returns:** Last N entries (sorted by date, newest first)

#### `useWeeklyHours()`

**Usage:**
```typescript
const { data: weeklyHours } = useWeeklyHours()
```

**Calculates:** Total hours for current week (Monday to Sunday)

**Implementation:**
- Filters entries within current week
- Sums `totalHours` field
- Returns number (e.g., `38.5`)

### Page Updates

#### Dashboard (`src/app/(main)/page.tsx`)

**Changes:**
- Replaced `getRecentEntries()` with `useRecentEntries(2)`
- Replaced `getWeeklyHours()` with `useWeeklyHours()`
- Added loading states
- Added empty state handling

#### History (`src/app/(main)/history/page.tsx`)

**Changes:**
- Replaced `timeEntries` mock with `useTimeEntries({ days: 30 })`
- Added loading/error states
- Shows sync status (SYNCED/PENDING)
- Displays notes if available

#### Entry Form (`src/app/(main)/entry/new/page.tsx`)

**Changes:**
- Added `date` field (defaults to today)
- No other changes needed (already posts to API)

---

## Common Patterns

### Pattern 1: Redis Hash Storage

**Store:**
```typescript
await redis.hset(key, { data: JSON.stringify(object) })
```

**Read:**
```typescript
const json = await redis.hget<string>(key, 'data')
const object = json ? JSON.parse(json) : null
```

**Update:**
```typescript
const existing = JSON.parse(await redis.hget<string>(key, 'data'))
const updated = { ...existing, field: newValue }
await redis.hset(key, { data: JSON.stringify(updated) })
```

### Pattern 2: ZSET with Timestamps

**Add:**
```typescript
const timestamp = new Date(dateString).getTime()
await redis.zadd(key, { score: timestamp, member: id })
```

**Fetch (newest first):**
```typescript
const ids = await redis.zrange(key, 0, -1, { byScore: true, rev: true })
```

**Fetch Range:**
```typescript
const minScore = new Date('2024-01-01').getTime()
const maxScore = new Date('2024-01-31').getTime()
const ids = await redis.zrange(key, minScore, maxScore, { byScore: true })
```

### Pattern 3: TTL Management

**Set TTL:**
```typescript
const ttlSeconds = 30 * 24 * 60 * 60 // 30 days
await redis.expire(key, ttlSeconds)
```

**Check TTL:**
```typescript
const ttl = await redis.ttl(key) // Returns seconds until expiry, -1 if no TTL
```

### Pattern 4: Background Processing with waitUntil

```typescript
import { waitUntil } from '@vercel/functions'

export async function POST(request: NextRequest) {
  // ... blocking operations ...
  
  waitUntil(
    (async () => {
      try {
        // Background work here
        await someAsyncOperation()
      } catch (error) {
        // Log but don't throw
        console.error('Background error:', error)
      }
    })()
  )
  
  // Return immediately
  return NextResponse.json({ success: true })
}
```

**Important:**
- `waitUntil` must be called before response is sent
- Errors in `waitUntil` don't affect response
- Function stays alive until promise resolves

---

## Testing Considerations

### Unit Tests

**Test Sync Utilities:**
```typescript
// Mock Redis, Postgres, Zoho
// Test syncToPermanentStorage success/failure
// Test retryFailedSyncs logic
```

**Test API Routes:**
```typescript
// Mock Supabase auth
// Test GET with/without Redis data
// Test POST write-behind pattern
// Test error handling
```

### Integration Tests

**Test Full Flow:**
1. Submit entry → Check Redis
2. Wait for background sync → Check Postgres
3. Verify `synced` flag updated
4. Test retry logic with failed sync

### Manual Testing Checklist

- [ ] Submit entry → Verify immediate success
- [ ] Check Redis for entry (should have `synced: false`)
- [ ] Wait 2-3 seconds → Check Postgres for entry
- [ ] Check Redis again → Should have `synced: true`
- [ ] Submit another entry → Verify previous failed syncs retried
- [ ] Fetch entries → Verify data appears correctly
- [ ] Check weekly hours calculation
- [ ] Test with entries older than 30 days (should query Postgres)

---

## Deployment Checklist

### Environment Variables

**Required:**
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `DATABASE_URL` (Postgres connection string)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**Optional (for Zoho sync):**
- `ZOHO_ACCESS_TOKEN_URL`
- `ZOHO_WEBHOOK_SECRET`

### Vercel Configuration

**Required:**
- Deploy to Vercel (for `waitUntil` support)
- Set all environment variables
- Ensure function timeout is sufficient (default 10s is fine)

**Optional:**
- Enable Vercel Analytics for monitoring
- Set up error tracking (Sentry, etc.)

### Database Setup

**Postgres:**
- Run migrations: `npm run db:push`
- Verify `time_entries` table exists
- Check indexes are created (`user_id_idx`, `date_idx`, `job_id_idx`)

**Redis:**
- Verify Upstash Redis is accessible
- Test connection with simple `redis.ping()`
- Monitor memory usage (should stay under 250MB)

### Post-Deployment Verification

1. **Submit Test Entry:**
   ```bash
   curl -X POST https://acom-painting.vercel.app/api/time-entries \
     -H "Content-Type: application/json" \
     -H "Cookie: your-session-cookie" \
     -d '{"jobId":"test","jobName":"Test","userId":"test-user",...}'
   ```

2. **Check Redis:**
   - Entry should appear in `entry:{uuid}`
   - Entry ID should be in ZSET

3. **Wait 2-3 seconds, then check Postgres:**
   - Entry should appear in `time_entries` table
   - Redis `synced` flag should be `true`

4. **Fetch Entries:**
   ```bash
   curl https://acom-painting.vercel.app/api/time-entries \
     -H "Cookie: your-session-cookie"
   ```
   - Should return the test entry

---

## Troubleshooting

### Issue: Entries not appearing in Postgres

**Symptoms:**
- Entry appears in Redis
- `synced` flag stays `false`
- Entry not in Postgres table

**Debug Steps:**
1. Check Vercel function logs for background sync errors
2. Verify `DATABASE_URL` is correct
3. Check Postgres connection (test with `db.select()`)
4. Verify table schema matches (`db:push`)

**Common Causes:**
- Database connection string incorrect
- Table doesn't exist (run migrations)
- Row-level security blocking inserts
- Background sync failing silently

**Fix:**
```typescript
// Add more logging in syncToPermanentStorage
console.log('[Sync] Attempting Postgres write:', entryData.id)
try {
  await db.insert(timeEntries).values(postgresData)
  console.log('[Sync] Postgres write successful')
} catch (error) {
  console.error('[Sync] Postgres write failed:', error)
  throw error // Re-throw to see in logs
}
```

### Issue: Redis entries expiring too early

**Symptoms:**
- Entries disappear before 30 days
- Recent entries not found in cache

**Debug Steps:**
1. Check TTL on keys: `redis.ttl('entry:{uuid}')`
2. Verify TTL is set correctly in POST endpoint
3. Check if keys are being deleted elsewhere

**Fix:**
```typescript
// Verify TTL is set
const ttl = await redis.ttl(entryKey)
console.log(`[Debug] TTL for ${entryId}: ${ttl} seconds`)

// Should be: 30 * 24 * 60 * 60 = 2,592,000 seconds
```

### Issue: Background sync not running

**Symptoms:**
- Entry saved to Redis
- No Postgres entry after waiting
- No errors in logs

**Debug Steps:**
1. Verify `waitUntil` is imported correctly
2. Check Vercel function logs (background errors might be separate)
3. Test `waitUntil` with simple console.log

**Fix:**
```typescript
waitUntil(
  (async () => {
    console.log('[Background] Starting sync...') // Should appear in logs
    try {
      await syncToPermanentStorage(entryData, user.email)
      console.log('[Background] Sync completed')
    } catch (error) {
      console.error('[Background] Sync error:', error) // Check this
    }
  })()
)
```

### Issue: Piggyback recovery not working

**Symptoms:**
- Failed syncs never retry
- `synced: false` entries accumulate

**Debug Steps:**
1. Check `retryFailedSyncs` is being called
2. Verify it's finding failed entries
3. Check if sync is actually failing or just slow

**Fix:**
```typescript
// Add logging in retryFailedSyncs
console.log(`[Retry] Checking ${entryIds.length} entries`)
console.log(`[Retry] Found ${failedEntries.length} failed syncs`)

// Verify sync function is actually being called
for (const entryId of failedEntries) {
  console.log(`[Retry] Retrying entry: ${entryId}`)
  await syncToPermanentStorage(entryData, userEmail)
}
```

### Issue: Zoho sync failing

**Symptoms:**
- Postgres sync works
- Zoho sync fails
- Entry marked as synced anyway (Postgres success)

**Expected Behavior:**
- Zoho failures are logged but don't block
- Entry is marked `synced: true` if Postgres succeeds
- Zoho failures can be retried manually if needed

**If Zoho is Required:**
- Modify `syncToPermanentStorage` to throw on Zoho failure
- Or add separate `zohoSynced` flag
- Or use queue for Zoho sync (separate from Postgres)

---

## Performance Optimization Tips

### 1. Batch Redis Operations

**Instead of:**
```typescript
for (const id of ids) {
  await redis.hget(`entry:${id}`, 'data')
}
```

**Use:**
```typescript
const results = await Promise.all(
  ids.map(id => redis.hget(`entry:${id}`, 'data'))
)
```

### 2. Pipeline Multiple Commands

**For high-volume operations:**
```typescript
const pipeline = redis.pipeline()
pipeline.hset('key1', data1)
pipeline.hset('key2', data2)
pipeline.hset('key3', data3)
await pipeline.exec()
```

### 3. Cache Weekly Hours

**Current:** Calculated on every request

**Optimization:**
```typescript
// Cache in Redis with 5-minute TTL
const cacheKey = `user:${email}:weekly-hours`
const cached = await redis.get(cacheKey)
if (cached) return parseFloat(cached)

const hours = calculateWeeklyHours(entries)
await redis.set(cacheKey, hours, { ex: 300 }) // 5 min TTL
return hours
```

### 4. Index Postgres Queries

**Already done:**
- `user_id_idx` on `userId`
- `date_idx` on `date`
- `job_id_idx` on `jobId`

**Verify:**
```sql
EXPLAIN SELECT * FROM time_entries WHERE user_id = 'xxx';
-- Should show index usage
```

---

## Future Enhancements

### 1. Real-time Updates

**Use Supabase Realtime:**
```typescript
const channel = supabase
  .channel('time-entries')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'time_entries',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    // Update React Query cache
    queryClient.setQueryData(['time-entries'], (old) => {
      return [...(old || []), payload.new]
    })
  })
  .subscribe()
```

### 2. Offline Support

**Use React Query Offline:**
- Cache entries locally
- Queue writes when offline
- Sync when connection restored

### 3. Export to CSV

**Add endpoint:**
```typescript
export async function GET(request: NextRequest) {
  const entries = await fetchEntries()
  const csv = convertToCSV(entries)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="entries.csv"'
    }
  })
}
```

### 4. Analytics Dashboard

**Track:**
- Entries per user
- Hours per project
- Sync success rate
- Cache hit rate

---

## Key Takeaways

1. **Write-behind pattern** provides instant user feedback while ensuring data safety
2. **Piggyback recovery** eliminates need for separate cron jobs
3. **30-day TTL** balances performance with memory constraints
4. **ZSET for date queries** enables efficient range queries
5. **waitUntil** keeps background processing simple (no queues needed)
6. **User-scoped data** ensures security and performance
7. **Postgres as source of truth** provides data durability
8. **Redis as hot cache** provides sub-50ms reads

---

## References

- [Vercel Functions waitUntil](https://vercel.com/docs/functions/runtimes#using-waituntil)
- [Upstash Redis Documentation](https://docs.upstash.com/redis)
- [React Query Documentation](https://tanstack.com/query/latest)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)

---

**Last Updated:** 2024-01-15  
**Implementation Version:** 1.0  
**Architecture:** Optimistic & Self-Healing Write-Behind

