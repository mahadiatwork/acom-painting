import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@/lib/supabase/server'
import { syncTimesheetToZoho, retryFailedSyncs } from '@/lib/sync-utils'
import { db } from '@/lib/db'
import { timeEntries, timesheetPainters } from '@/lib/schema'
import { eq, and, sql, desc } from 'drizzle-orm'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const painterRowSchema = z.object({
  painterId: z.string(),
  painterName: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  lunchStart: z.string().optional().default(''),
  lunchEnd: z.string().optional().default(''),
})

const timesheetSchema = z.object({
  jobId: z.string(),
  jobName: z.string(),
  date: z.string().optional(),
  notes: z.string().optional().default(''),
  changeOrder: z.string().nullable().optional().default(''),
  sundryItems: z.array(z.object({
    sundryItem: z.string(),
    quantity: z.number(),
  })).optional().default([]),
  painters: z.array(painterRowSchema).min(1, 'At least one painter is required'),
})

function parseTimeToMinutes(time: string): number {
  if (!time) return 0
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function computeTotalHours(start: string, end: string, lunchStart: string, lunchEnd: string): number {
  const startM = parseTimeToMinutes(start)
  const endM = parseTimeToMinutes(end)
  let workM = endM - startM
  if (lunchStart && lunchEnd) {
    const lunchM = parseTimeToMinutes(lunchEnd) - parseTimeToMinutes(lunchStart)
    if (lunchM > 0) workM -= lunchM
  }
  return workM > 0 ? Number((workM / 60).toFixed(2)) : 0
}

const SUNDRY_MAP: Record<string, string> = {
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

/**
 * GET /api/time-entries
 * Returns foreman's timesheets with nested painters.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const daysBack = searchParams.get('days') ? parseInt(searchParams.get('days')!, 10) : 30
    const cutoffDate = new Date()
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - daysBack)
    cutoffDate.setUTCHours(0, 0, 0, 0)
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0]

    const rows = await db
      .select()
      .from(timeEntries)
      .where(and(
        eq(timeEntries.userId, user.id),
        sql`${timeEntries.date} >= ${cutoffDateStr}`
      ))
      .orderBy(desc(timeEntries.date))

    const entries: any[] = []
    for (const te of rows) {
      const painterRows = await db
        .select()
        .from(timesheetPainters)
        .where(eq(timesheetPainters.timesheetId, te.id))
      const painters = painterRows.map(p => ({
        id: p.id,
        painterId: p.painterId,
        painterName: p.painterName,
        startTime: p.startTime,
        endTime: p.endTime,
        lunchStart: p.lunchStart || '',
        lunchEnd: p.lunchEnd || '',
        totalHours: parseFloat(p.totalHours),
        zohoJunctionId: p.zohoJunctionId,
      }))
      const sundry: Record<string, string> = {
        maskingPaperRoll: te.maskingPaperRoll ?? '0',
        plasticRoll: te.plasticRoll ?? '0',
        puttySpackleTub: te.puttySpackleTub ?? '0',
        caulkTube: te.caulkTube ?? '0',
        whiteTapeRoll: te.whiteTapeRoll ?? '0',
        orangeTapeRoll: te.orangeTapeRoll ?? '0',
        floorPaperRoll: te.floorPaperRoll ?? '0',
        tip: te.tip ?? '0',
        sandingSponge: te.sandingSponge ?? '0',
        inchRollerCover18: te.inchRollerCover18 ?? '0',
        inchRollerCover9: te.inchRollerCover9 ?? '0',
        miniCover: te.miniCover ?? '0',
        masks: te.masks ?? '0',
        brickTapeRoll: te.brickTapeRoll ?? '0',
      }
      entries.push({
        ...te,
        totalCrewHours: parseFloat(te.totalCrewHours ?? '0'),
        painters,
        sundryItems: sundry,
      })
    }

    return NextResponse.json(entries)
  } catch (error) {
    console.error('[API] Failed to fetch time entries:', error)
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
  }
}

/**
 * POST /api/time-entries
 * Create timesheet (parent + painters) in Postgres, then background sync to Zoho.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await request.json()
    const validated = timesheetSchema.parse(payload)
    const today = new Date().toISOString().split('T')[0]
    const date = validated.date || today

    const paintersWithHours = validated.painters.map(p => {
      const totalHours = computeTotalHours(p.startTime, p.endTime, p.lunchStart || '', p.lunchEnd || '')
      return { ...p, totalHours: String(totalHours) }
    })
    const totalCrewHours = paintersWithHours.reduce((sum, p) => sum + parseFloat(p.totalHours), 0)

    const sundryData: Record<string, string> = {}
    Object.values(SUNDRY_MAP).forEach(k => { sundryData[k] = '0' })
    ;(validated.sundryItems || []).forEach(item => {
      const key = SUNDRY_MAP[item.sundryItem]
      if (key) sundryData[key] = String(item.quantity)
    })

    const timesheetId = crypto.randomUUID()

    const parentValues = {
      id: timesheetId,
      userId: user.id,
      jobId: validated.jobId,
      jobName: validated.jobName,
      date,
      startTime: '',
      endTime: '',
      lunchStart: '',
      lunchEnd: '',
      totalHours: '0',
      notes: validated.notes || '',
      changeOrder: validated.changeOrder || '',
      synced: false,
      totalCrewHours: String(totalCrewHours),
      maskingPaperRoll: sundryData.maskingPaperRoll || '0',
      plasticRoll: sundryData.plasticRoll || '0',
      puttySpackleTub: sundryData.puttySpackleTub || '0',
      caulkTube: sundryData.caulkTube || '0',
      whiteTapeRoll: sundryData.whiteTapeRoll || '0',
      orangeTapeRoll: sundryData.orangeTapeRoll || '0',
      floorPaperRoll: sundryData.floorPaperRoll || '0',
      tip: sundryData.tip || '0',
      sandingSponge: sundryData.sandingSponge || '0',
      inchRollerCover18: sundryData.inchRollerCover18 || '0',
      inchRollerCover9: sundryData.inchRollerCover9 || '0',
      miniCover: sundryData.miniCover || '0',
      masks: sundryData.masks || '0',
      brickTapeRoll: sundryData.brickTapeRoll || '0',
    }

    try {
      await db.insert(timeEntries).values(parentValues)
      const junctionRows = paintersWithHours.map(p => ({
        timesheetId,
        painterId: p.painterId,
        painterName: p.painterName,
        startTime: p.startTime,
        endTime: p.endTime,
        lunchStart: p.lunchStart || '',
        lunchEnd: p.lunchEnd || '',
        totalHours: p.totalHours,
      }))
      if (junctionRows.length > 0) {
        await db.insert(timesheetPainters).values(junctionRows)
      }
    } catch (dbError: any) {
      const msg = dbError?.message || String(dbError)
      console.error('[API] Postgres write failed:', msg)
      if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
        return NextResponse.json({
          error: 'Database connection failed.',
          details: 'Use Connection Pooling URL (port 6543).',
        }, { status: 500 })
      }
      if (msg.includes('column') && (msg.includes('does not exist') || dbError?.code === '42703')) {
        return NextResponse.json({
          error: 'Database schema error. Run FOREMAN_MIGRATION_PHASE1.sql in Supabase.',
        }, { status: 500 })
      }
      return NextResponse.json({ error: 'Failed to create timesheet', details: msg }, { status: 500 })
    }

    const insertedPainters = await db.select().from(timesheetPainters).where(eq(timesheetPainters.timesheetId, timesheetId))
    const paintersForSync = insertedPainters.map(p => ({
      id: p.id,
      painterId: p.painterId,
      painterName: p.painterName,
      startTime: p.startTime,
      endTime: p.endTime,
      lunchStart: p.lunchStart || '',
      lunchEnd: p.lunchEnd || '',
      totalHours: p.totalHours,
      zohoJunctionId: undefined as string | undefined,
    }))

    const timesheetData = {
      id: timesheetId,
      userId: user.id,
      jobId: validated.jobId,
      jobName: validated.jobName,
      date,
      notes: validated.notes,
      changeOrder: validated.changeOrder ?? undefined,
      synced: false,
      zohoTimeEntryId: undefined as string | undefined,
      totalCrewHours: String(totalCrewHours),
      painters: paintersForSync,
      ...sundryData,
    }

    const userEmail = user.email
    const userId = user.id
    waitUntil(
      (async () => {
        try {
          await syncTimesheetToZoho(timesheetData, userEmail)
          await retryFailedSyncs(userEmail, userId)
        } catch (e) {
          console.error('[API] Background sync error:', e)
        }
      })()
    )

    return NextResponse.json({
      id: timesheetId,
      jobId: validated.jobId,
      jobName: validated.jobName,
      date,
      notes: validated.notes,
      totalCrewHours,
      synced: false,
      painters: paintersWithHours.map(p => ({
        painterId: p.painterId,
        painterName: p.painterName,
        startTime: p.startTime,
        endTime: p.endTime,
        lunchStart: p.lunchStart,
        lunchEnd: p.lunchEnd,
        totalHours: parseFloat(p.totalHours),
      })),
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload', details: error.errors }, { status: 400 })
    }
    console.error('[API] Failed to create timesheet:', error)
    return NextResponse.json({ error: 'Failed to create timesheet' }, { status: 500 })
  }
}
