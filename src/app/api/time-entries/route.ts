import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@/lib/supabase/server'
import { syncToPermanentStorage, retryFailedSyncs } from '@/lib/sync-utils'
import { db } from '@/lib/db'
import { timeEntries } from '@/lib/schema'
import { eq, and, sql } from 'drizzle-orm'
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
  // Add sundry items array
  sundryItems: z.array(z.object({
    sundryItem: z.string(),
    quantity: z.number(),
  })).optional().default([]),
})

/**
 * GET /api/time-entries
 * Returns user's time entries from Postgres
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
    
    // Calculate date cutoff for Postgres query
    const cutoffDate = new Date()
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - daysBack)
    cutoffDate.setUTCHours(0, 0, 0, 0)
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0]
    
    console.log(`[API] Fetching entries for ${user.email}, days=${daysBack}, date >= ${cutoffDateStr}`)
    console.log(`[API] User email: ${user.email}, User ID (Auth): ${user.id}`)
    
    // 3. Query Postgres directly
    try {
      const postgresEntries = await db
        .select()
        .from(timeEntries)
        .where(and(
          eq(timeEntries.userId, user.id),
          sql`${timeEntries.date} >= ${cutoffDateStr}`
        ))
        .orderBy(timeEntries.date)

      console.log(`[API] Found ${postgresEntries.length} entries in Postgres for user ${user.id}`)

      const entries = postgresEntries.map(e => ({
        ...e,
        totalHours: parseFloat(e.totalHours),
        synced: e.synced,
      }))

      // Sort by date (newest first)
      entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      console.log(`[API] Returning ${entries.length} total entries for ${user.email}`)
      if (entries.length > 0) {
        console.log(`[API] First entry sample:`, { id: entries[0].id, date: entries[0].date, jobName: entries[0].jobName })
      }

      return NextResponse.json(entries)
    } catch (dbError: any) {
      const errorMessage = dbError?.message || dbError?.code || String(dbError)
      console.error('[API] Postgres query failed:', errorMessage)
      return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
    }
  } catch (error) {
    console.error('[API] Failed to fetch entries:', error)
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
  }
}

/**
 * POST /api/time-entries
 * Write to Postgres first, then background sync to Zoho
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
    const sundryItems = validated.sundryItems || []

    // Map sundry items to database columns
    const sundryMap: Record<string, string> = {
      'Masking Paper Roll': 'maskingPaperRoll',
      'Plastic Roll': 'plasticRoll',
      'Putty/Spackle Tub': 'puttySpackleTub',
      'Caulk Tube': 'caulkTube',
      'White Tape Roll': 'whiteTapeRoll',
      'Orange Tape Roll': 'orangeTapeRoll',
      'Floor Paper Roll': 'floorPaperRoll',
      'Tip': 'tip',
      'Sanding Sponge': 'sandingSponge',
      '18" Roller Cover': 'inchRollerCover18',
      '9" Roller Cover': 'inchRollerCover9',
      'Mini Cover': 'miniCover',
      'Masks': 'masks',
      'Brick Tape Roll': 'brickTapeRoll',
    }

    // Initialize all sundry items to "0"
    const sundryData: Record<string, string> = {}
    Object.values(sundryMap).forEach(key => {
      sundryData[key] = '0'
    })

    // Set quantities from submitted items
    sundryItems.forEach(item => {
      const dbKey = sundryMap[item.sundryItem]
      if (dbKey) {
        sundryData[dbKey] = String(item.quantity)
      }
    })

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
      synced: false, // Will be updated after Zoho sync
      // Add all sundry items
      ...sundryData,
    }

    console.log(`[API] Writing entry ${entryId} with date=${entryData.date}`)
    console.log(`[API] User email: ${user.email}, User ID (Auth): ${user.id}`)

    // 5. Write to Postgres immediately (blocking)
    try {
      await db.insert(timeEntries).values({
        id: entryData.id,
        userId: entryData.userId,
        jobId: entryData.jobId,
        jobName: entryData.jobName,
        date: entryData.date,
        startTime: entryData.startTime,
        endTime: entryData.endTime,
        lunchStart: entryData.lunchStart,
        lunchEnd: entryData.lunchEnd,
        totalHours: entryData.totalHours,
        notes: entryData.notes,
        changeOrder: entryData.changeOrder,
        synced: entryData.synced,
        // Add all sundry item fields
        maskingPaperRoll: entryData.maskingPaperRoll,
        plasticRoll: entryData.plasticRoll,
        puttySpackleTub: entryData.puttySpackleTub,
        caulkTube: entryData.caulkTube,
        whiteTapeRoll: entryData.whiteTapeRoll,
        orangeTapeRoll: entryData.orangeTapeRoll,
        floorPaperRoll: entryData.floorPaperRoll,
        tip: entryData.tip,
        sandingSponge: entryData.sandingSponge,
        inchRollerCover18: entryData.inchRollerCover18,
        inchRollerCover9: entryData.inchRollerCover9,
        miniCover: entryData.miniCover,
        masks: entryData.masks,
        brickTapeRoll: entryData.brickTapeRoll,
      })
      console.log(`[API] Entry ${entryId} written to Postgres`)
    } catch (dbError: any) {
      const errorMsg = dbError?.message || String(dbError)
      console.error('[API] Postgres write failed:', errorMsg)
      
      // Check if it's a connection error
      if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('getaddrinfo')) {
        console.error('[API] Database connection error - check DATABASE_URL in Vercel')
        return NextResponse.json({ 
          error: 'Database connection failed. Please check server configuration.' 
        }, { status: 500 })
      }
      
      return NextResponse.json({ 
        error: 'Failed to create entry',
        details: process.env.NODE_ENV === 'development' ? errorMsg : undefined
      }, { status: 500 })
    }

    // Store user email and ID in constants for background sync (TypeScript narrowing)
    const userEmail = user.email
    const userId = user.id

    // 6. BACKGROUND PATH: Sync to Zoho (non-blocking)
    waitUntil(
      (async () => {
        try {
          // Sync this entry to Zoho
          await syncToPermanentStorage(entryData, userEmail)
          
          // Piggyback recovery: Retry any failed syncs for this user
          await retryFailedSyncs(userEmail, userId)
        } catch (error) {
          console.error('[API] Background sync error:', error)
          // Don't throw - this is background processing
        }
      })()
    )

    // 7. Return immediately (user doesn't wait for Zoho sync)
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
