import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { redis } from '@/lib/redis'
import { createClient } from '@/lib/supabase/server'
import { syncToPermanentStorage, retryFailedSyncs } from '@/lib/sync-utils'
import { db } from '@/lib/db'
import { timeEntries } from '@/lib/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// Schema for entry validation
const timeEntrySchema = z.object({
  jobId: z.string(),
  jobName: z.string(),
  userId: z.string(),
  date: z.string().optional(), // Will default to today if not provided
  startTime: z.string(),
  endTime: z.string(),
  lunchStart: z.string().optional(),
  lunchEnd: z.string().optional(),
  totalHours: z.number(),
  notes: z.string().optional(),
  changeOrder: z.string().nullable().optional(),
})

/**
 * GET /api/time-entries
 * Returns user's time entries (Redis-first, Postgres fallback)
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate User
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Check for date range query (optional)
    const { searchParams } = new URL(request.url)
    const daysBack = searchParams.get('days') ? parseInt(searchParams.get('days')!) : 30
    // Use start of day in UTC for cutoff to match entry timestamp calculation
    const cutoffDate = new Date()
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - daysBack)
    cutoffDate.setUTCHours(0, 0, 0, 0) // Set to start of day in UTC
    const cutoffTimestamp = cutoffDate.getTime()

    // 3. Fetch from Redis (Hot Data - Last 30 days)
    const zsetKey = `user:${user.email}:entries:by-date`
    
    console.log(`[API] Fetching entries for ${user.email}, days=${daysBack}, cutoffTimestamp=${cutoffTimestamp}`)
    console.log(`[API] User email: ${user.email}, User ID (Auth): ${user.id}`)
    console.log(`[API] Redis ZSET key: ${zsetKey}`)
    
    // First, check if ZSET exists and get its size
    const zsetSize = await redis.zcard(zsetKey)
    console.log(`[API] ZSET ${zsetKey} has ${zsetSize} total entries`)
    
    // Debug: Get all entries with scores to see what timestamps are stored
    if (zsetSize > 0) {
      const allEntries = await redis.zrange(zsetKey, 0, -1, { withScores: true })
      console.log(`[API] Sample ZSET entries with scores:`, allEntries.slice(0, 3))
      if (allEntries && allEntries.length > 0 && allEntries[0] !== null && allEntries[0] !== undefined) {
        const firstEntry = allEntries[0]
        const sampleScore = typeof firstEntry === 'object' && firstEntry !== null && 'score' in firstEntry 
          ? (firstEntry as any).score 
          : (allEntries[1] !== null && allEntries[1] !== undefined ? allEntries[1] : null)
        if (sampleScore !== null) {
          console.log(`[API] Sample timestamp in ZSET: ${sampleScore}, cutoff: ${cutoffTimestamp}, match: ${sampleScore >= cutoffTimestamp}`)
        }
      }
    }
    
    // Only fetch entries within the date range from Redis (optimize query)
    const entryIds = await redis.zrange(zsetKey, cutoffTimestamp, '+inf', { 
      byScore: true, 
      rev: true,
      offset: 0,
      count: 1000 // Limit to prevent huge queries
    })

    console.log(`[API] Found ${entryIds?.length || 0} entry IDs in Redis ZSET (after date filter)`)
    
    let entries: any[] = []

    if (entryIds && entryIds.length > 0) {
      // Batch fetch entry details from Redis Hash (parallel)
      const entryData = await Promise.all(
        entryIds.map(id => redis.hget(`entry:${id}`, 'data'))
      )
      
      entries = entryData
        .filter((data): data is string | object => data !== null)
        .map(data => {
          try {
            // Handle both string (needs parsing) and object (already parsed by Upstash) cases
            let entry: any
            if (typeof data === 'string') {
              entry = JSON.parse(data)
            } else if (typeof data === 'object') {
              // Already an object (Upstash auto-parsed), use as-is
              entry = data
            } else {
              return null
            }
            
            // Convert totalHours back to number if stored as string
            return {
              ...entry,
              totalHours: typeof entry.totalHours === 'string' ? parseFloat(entry.totalHours) : entry.totalHours,
            }
          } catch (e) {
            console.error('[API] Failed to parse entry JSON:', e, 'Data type:', typeof data)
            return null
          }
        })
        .filter((entry): entry is any => entry !== null)
      
      console.log(`[API] Parsed ${entries.length} entries from Redis`)
    } else if (zsetSize > 0) {
      // If ZSET has entries but query returned none, try fetching all and filtering in code
      // This handles cases where timestamps don't match due to timezone or calculation differences
      console.log(`[API] WARNING: ZSET has ${zsetSize} entries but date filter returned 0. Fetching all entries and filtering by date...`)
      const allEntryIds = await redis.zrange(zsetKey, 0, -1, { rev: true })
      console.log(`[API] All entry IDs in ZSET:`, allEntryIds.slice(0, 5))
      
      // Fetch all entries and filter by date in code
      if (allEntryIds && allEntryIds.length > 0) {
        const allEntryData = await Promise.all(
          allEntryIds.map(id => redis.hget(`entry:${id}`, 'data'))
        )
        
        const allEntries = allEntryData
          .filter((data): data is string | object => data !== null)
          .map(data => {
            try {
              // Handle both string (needs parsing) and object (already parsed) cases
              if (typeof data === 'string') {
                return JSON.parse(data)
              } else if (typeof data === 'object') {
                // Already an object, return as-is
                return data
              }
              return null
            } catch (e) {
              console.error('[API] Failed to parse entry JSON in fallback:', e, 'Data type:', typeof data)
              return null
            }
          })
          .filter((entry): entry is any => entry !== null)
          .filter(entry => {
            // Filter by date string comparison (more reliable than timestamp)
            const entryDate = new Date(entry.date + 'T00:00:00Z')
            const entryTimestamp = entryDate.getTime()
            const isInRange = entryTimestamp >= cutoffTimestamp
            return isInRange
          })
        
        console.log(`[API] After code-level date filter: ${allEntries.length} entries`)
        entries = allEntries.map(e => ({
          ...e,
          totalHours: typeof e.totalHours === 'string' ? parseFloat(e.totalHours) : e.totalHours,
        }))
      }
    } else {
      console.log(`[API] No entry IDs found in Redis ZSET for ${user.email}`)
    }

    // 4. Query Postgres if:
    //    - Requesting data older than 30 days (need historical data), OR
    //    - Redis is completely empty (fallback to Postgres for any date range)
    //    This ensures we always return data even if Redis cache is empty or expired
    const shouldCheckPostgres = daysBack > 30 || entries.length === 0
    
    if (shouldCheckPostgres) {
      try {
        console.log(`[API] Checking Postgres for entries (daysBack=${daysBack}, redisEntries=${entries.length})`)
        
        // Calculate date cutoff for Postgres query
        const cutoffDate = new Date()
        cutoffDate.setUTCDate(cutoffDate.getUTCDate() - daysBack)
        cutoffDate.setUTCHours(0, 0, 0, 0)
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0]
        
        console.log(`[API] Postgres query: userId=${user.id}, email=${user.email}, date >= ${cutoffDateStr}`)
        
        const postgresEntries = await db
          .select()
          .from(timeEntries)
          .where(eq(timeEntries.userId, user.id))
          .orderBy(timeEntries.date)

        console.log(`[API] Found ${postgresEntries.length} total entries in Postgres for user ${user.id}`)
        if (postgresEntries.length > 0) {
          // Log the userIds we found to check for mismatches
          const uniqueUserIds = [...new Set(postgresEntries.map(e => e.userId))]
          console.log(`[API] Postgres entries have userIds:`, uniqueUserIds)
          console.log(`[API] Querying with userId: ${user.id}`)
          console.log(`[API] First entry sample:`, { 
            id: postgresEntries[0].id, 
            userId: postgresEntries[0].userId, 
            date: postgresEntries[0].date 
          })
        }

        // Merge with Redis entries (avoid duplicates)
        const redisIds = new Set(entries.map(e => e.id))
        const additionalEntries = postgresEntries
          .filter(e => {
            // Only include entries within date range and not already in Redis
            const isInDateRange = e.date >= cutoffDateStr
            const notInRedis = !redisIds.has(e.id)
            return isInDateRange && notInRedis
          })
          .map(e => ({
            ...e,
            totalHours: parseFloat(e.totalHours),
            synced: true, // Postgres entries are always synced
          }))

        console.log(`[API] Adding ${additionalEntries.length} entries from Postgres (after filtering)`)
        entries = [...entries, ...additionalEntries]
      } catch (dbError: any) {
        // Database connection failed - log but don't fail the request
        // Return Redis entries only (graceful degradation)
        const errorMessage = dbError?.message || dbError?.code || String(dbError)
        console.warn('[API] Postgres query failed (returning Redis entries only):', errorMessage)
        // Don't throw - return what we have from Redis
      }
    }

    // Sort by date (newest first)
    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    console.log(`[API] Returning ${entries.length} total entries for ${user.email}`)
    if (entries.length > 0) {
      console.log(`[API] First entry sample:`, { id: entries[0].id, date: entries[0].date, jobName: entries[0].jobName })
    }

    return NextResponse.json(entries)
  } catch (error) {
    console.error('[API] Failed to fetch entries:', error)
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
  }
}

/**
 * POST /api/time-entries
 * Write-behind pattern: Redis first, background sync to Postgres + Zoho
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate User
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse and validate payload
    const payload = await request.json()
    const validated = timeEntrySchema.parse(payload)

    // 3. Generate UUID for entry
    const entryId = crypto.randomUUID()

    // 4. Prepare entry data
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const entryData = {
      id: entryId,
      userId: validated.userId,
      jobId: validated.jobId,
      jobName: validated.jobName,
      date: validated.date || today,
      startTime: validated.startTime,
      endTime: validated.endTime,
      lunchStart: validated.lunchStart || '',
      lunchEnd: validated.lunchEnd || '',
      totalHours: String(validated.totalHours),
      notes: validated.notes || '',
      changeOrder: validated.changeOrder || '',
      synced: false, // Will be updated after background sync
    }

    // 5. BLOCKING PATH: Write to Redis immediately
    const entryKey = `entry:${entryId}`
    const zsetKey = `user:${user.email}:entries:by-date`
    
    // Calculate timestamp from date string (YYYY-MM-DD format)
    // Use start of day in UTC to ensure consistent querying across timezones
    const entryDate = new Date(entryData.date + 'T00:00:00Z') // Z = UTC
    const timestamp = entryDate.getTime()
    
    console.log(`[API] Writing entry ${entryId} with date=${entryData.date}, timestamp=${timestamp}`)
    console.log(`[API] User email: ${user.email}, User ID (Auth): ${user.id}`)
    console.log(`[API] Redis ZSET key: ${zsetKey}`)

    // Write to Redis Hash (store as JSON string in 'data' field, matching single-entry pattern)
    await redis.hset(entryKey, { data: JSON.stringify(entryData) })
    
    // Add to ZSET with timestamp as score (for date-based queries)
    const zaddResult = await redis.zadd(zsetKey, { score: timestamp, member: entryId })
    console.log(`[API] ZADD result for ${zsetKey}: ${zaddResult} (1 = added, 0 = already exists)`)
    
    // Verify the entry was added by checking ZSET
    const verifyCount = await redis.zcard(zsetKey)
    console.log(`[API] ZSET ${zsetKey} now has ${verifyCount} entries`)

    // Set 30-day TTL on both keys
    const ttlSeconds = 30 * 24 * 60 * 60 // 30 days
    await redis.expire(entryKey, ttlSeconds)
    await redis.expire(zsetKey, ttlSeconds)

    console.log(`[API] Entry ${entryId} written to Redis`)

    // Store user email and ID in constants for background sync (TypeScript narrowing)
    const userEmail = user.email
    const userId = user.id

    // 6. BACKGROUND PATH: Sync to Postgres + Zoho (non-blocking)
    waitUntil(
      (async () => {
        try {
          // Sync this entry
          await syncToPermanentStorage(entryData, userEmail)
          
          // Piggyback recovery: Retry any failed syncs for this user
          await retryFailedSyncs(userEmail, userId)
        } catch (error) {
          console.error('[API] Background sync error:', error)
          // Don't throw - this is background processing
        }
      })()
    )

    // 7. Return immediately (user doesn't wait for Postgres/Zoho sync)
    return NextResponse.json(
      {
        ...entryData,
        totalHours: validated.totalHours, // Convert back to number from string
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API] Failed to create entry:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid payload', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to create entry' },
      { status: 500 }
    )
  }
}
