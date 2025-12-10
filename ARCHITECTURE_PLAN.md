# Roof Worx Field App - High-Performance Architecture Plan

**Objective:** Implement an "Optimistic & Self-Healing" Read-Aside/Write-Behind architecture to ensure sub-100ms interactions for field workers, even on slow networks, while respecting Redis memory constraints (250MB limit).

## 1. Setup & Configuration

### Dependencies
Install the required packages for the architecture:
```bash
npm install @upstash/redis @vercel/functions axios
```

**Key Packages:**
- `@upstash/redis`: Redis client for caching
- `@vercel/functions`: Background processing with `waitUntil` (non-blocking writes)
- `axios`: HTTP client for external API calls

### Environment Variables
Configure the following secrets in Replit (Tools > Secrets):

**Upstash Redis (Read Cache)**
- `UPSTASH_REDIS_REST_URL`: Your database URL
- `UPSTASH_REDIS_REST_TOKEN`: Your access token

**Supabase/Postgres**
- `DATABASE_URL`: Your Supabase/Neon connection string

**Zoho CRM (Source of Truth)**
- `ZOHO_CLIENT_ID`: OAuth Client ID
- `ZOHO_CLIENT_SECRET`: OAuth Client Secret
- `ZOHO_REFRESH_TOKEN`: Long-lived refresh token
- `ZOHO_API_DOMAIN`: e.g., `https://www.zohoapis.com`

### Initialization Files
Create a server-side configuration file (e.g., `server/lib/services.ts`) to initialize clients:

```typescript
import { Redis } from '@upstash/redis';

// Redis Client
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
```

---

## 2. Data Architecture (Hot vs Warm vs Cold Split)

**Goal:** Optimize memory usage while maintaining speed.

### Data Tiers

1. **HOT Data (Redis):** Last 30 days of entries
   - **Structure:** Redis **HASH** for efficiency (`entry:{uuid}`)
   - **TTL:** Strict 30-day expiry to respect 250MB limit
   - **Index:** Redis **ZSET** (`user:{email}:entries:by-date`) with timestamp score for date-range queries

2. **WARM Data (Postgres):** Permanent database storage
   - All entries stored permanently
   - Source of truth for data integrity

3. **COLD Data (Zoho CRM):** Compliance record
   - Optional sync for compliance/export
   - Can be done asynchronously

## 3. The "Read" Strategy (Cache-First)

**Goal:** Sub-50ms reads for recent data, seamless fallback for older data.

### Projects (Read-Aside Pattern)
- **API Route:** `/api/projects`
- **Cache Key:** `projects:data` (Hash), `user:{email}:projects` (Set)
- **Flow:**
  1. Check Redis Hash for project details
  2. Check Redis Set for user's allowed project IDs
  3. Return cached data immediately
  4. Fallback to Zoho API if cache miss (then populate cache)

### Time Entries (Hot Data First)
- **API Route:** `/api/time-entries`
- **Recent Data (Last 30 Days):**
  1. Fetch entry IDs from Redis ZSET `user:{email}:entries:by-date`
  2. Pipeline fetch entry details from Redis Hash `entry:{uuid}`
  3. Return immediately (<50ms)
- **Older Data (>30 Days):**
  1. Bypass Redis completely
  2. Query Postgres directly
  3. Return results

---

## 4. The "Write" Strategy (Write-Behind with Self-Healing)

**Goal:** Return 200 OK immediately (<50ms), sync to permanent storage in background.

### Implementation: `POST /api/time-entries`

**Step A: The Blocking Path (Immediate Response)**
1. Accept request, generate UUID
2. Write to Redis **HASH** (`entry:{uuid}`) with:
   - All entry data
   - `synced: "false"` flag
3. Add entry ID to Redis **ZSET** (`user:{email}:entries:by-date`) with timestamp as score
4. **CRITICAL:** Set 30-day TTL on both Hash and ZSet keys
5. Return 200 OK immediately

**Step B: The Background Path (Non-Blocking)**
Use `waitUntil` from `@vercel/functions` to keep server alive after response:

```typescript
import { waitUntil } from '@vercel/functions'

export async function POST(request: NextRequest) {
  // ... blocking path (Redis write) ...
  
  waitUntil(syncToPermanentStorage(entryData, userId))
  
  return NextResponse.json({ id: uuid }, { status: 201 })
}
```

Inside `waitUntil`, run `syncToPermanentStorage()`:
1. **Write to Postgres** (permanent storage)
2. **Write to Zoho CRM** (optional, can fail gracefully)
3. **On Success:** Update Redis `entry:{uuid}` → set `synced: "true"`
4. **On Fail:** Log error, leave `synced: "false"` for retry

**Step C: The "Piggyback" Recovery (Self-Healing)**
Inside the same `waitUntil` block, run `retryFailedSyncs(userId)`:
- Scan user's Redis ZSET for entries with `synced: "false"`
- Attempt to sync them to Postgres/Zoho
- **Theory:** If a sync fails today, it gets retried automatically the next time the user saves an entry
- **No cron jobs needed** - self-healing on user activity

### Benefits
- ✅ **Instant user feedback** (<50ms response time)
- ✅ **Data safety** (eventual consistency, Postgres is source of truth)
- ✅ **Self-healing** (failed syncs retry on next write)
- ✅ **Memory efficient** (30-day TTL prevents Redis bloat)

---

## 5. Redis Data Structures

### Projects
- **Hash:** `projects:data` → `{ projectId: JSON.stringify(project) }`
- **Set:** `user:{email}:projects` → Set of project IDs
- **Hash:** `zoho:map:user_id_to_email` → `{ userId: email }` (for webhooks)

### Time Entries
- **Hash:** `entry:{uuid}` → `{ ...entryData, synced: "true|false" }` (30-day TTL)
- **ZSet:** `user:{email}:entries:by-date` → `{ entryId: timestamp }` (30-day TTL)
  - Enables efficient date-range queries
  - Sorted by timestamp for chronological access

## 6. Security & Context

1. **Authentication:** Supabase Auth - user must be logged in for all operations
2. **User Scoping:** All data queries filtered by user email (from Supabase session)
3. **Webhook Security:** `x-roofworx-secret` header for Zoho webhook authentication
4. **Error Handling:** Failed syncs logged but don't block user experience

## 7. Performance Targets

- **Read (Cache Hit):** <50ms
- **Read (Cache Miss):** <200ms (Postgres query)
- **Write (Response):** <50ms (Redis write only)
- **Write (Background Sync):** <2s (non-blocking)
- **Cache Hit Rate:** >95% (after warm-up period)

## 8. Memory Management

- **30-Day TTL:** Automatic expiration prevents Redis from exceeding 250MB
- **ZSET Cleanup:** Old entries automatically removed from sorted sets
- **Hash Cleanup:** Expired entries removed from hash automatically
- **Monitoring:** Track `synced: false` entries to identify sync issues
