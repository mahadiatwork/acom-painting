import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@/lib/supabase/server'
import { syncTimesheetToZoho, retryFailedSyncs } from '@/lib/sync-utils'
import { db } from '@/lib/db'
import { timeEntries, timesheetPainters, workEntries, workEntryCrewRows, workEntrySundryRows, workEntryWorkRows } from '@/lib/schema'
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

/** Optional task-specific measurements (serialization-friendly). Aligns with JobProductionReference for future CRM. */
const workPerformedMeasurementsSchema = z.object({
  count: z.number().optional(),
  linearFeet: z.number().optional(),
  stairFloors: z.number().optional(),
  doorCount: z.number().optional(),
  windowCount: z.number().optional(),
  handrailCount: z.number().optional(),
}).strict()

/** Work Performed: one entry per task. Paint/primer usage are per entry, not day-level. Normalized: groupCode, taskCode, measurements. */
const workPerformedEntrySchema = z.object({
  area: z.enum(['interior', 'exterior']),
  groupCode: z.string(),
  groupLabel: z.string(),
  taskCode: z.string(),
  taskLabel: z.string(),
  quantity: z.number(),
  paintGallonsUsed: z.number(),
  primerGallonsUsed: z.number(),
  primerSource: z.enum(['stock', 'retail']),
  laborMinutes: z.number().optional().default(0),
  measurements: workPerformedMeasurementsSchema.optional().default({}),
  sortOrder: z.number().optional(),
})

/** Optional structured T&M extra work entry (separate from primary/customer work). */
const tmExtraWorkSchema = z.object({
  painters: z.array(painterRowSchema).optional().default([]),
  notes: z.string().optional().default(''),
  totalHours: z.number().optional().default(0),
  sundryItems: z.array(z.object({
    sundryItem: z.string(),
    quantity: z.number(),
  })).optional().default([]),
  workPerformed: z.array(workPerformedEntrySchema).optional().default([]),
}).optional()

const entryInputSchema = z.object({
  jobId: z.string().optional(),
  jobName: z.string().optional(),
  date: z.string().optional(),
  notes: z.string().optional().default(''),
  changeOrder: z.string().nullable().optional().default(''),
  displayLabel: z.string().optional(),
  sundryItems: z.array(z.object({
    sundryItem: z.string(),
    quantity: z.number(),
  })).optional().default([]),
  workPerformed: z.array(workPerformedEntrySchema).optional().default([]),
  painters: z.array(painterRowSchema).optional().default([]),
})

const newTimesheetPayloadSchema = z.object({
  mainEntry: entryInputSchema.extend({
    jobId: z.string(),
    jobName: z.string(),
    painters: z.array(painterRowSchema).min(1, 'At least one painter is required'),
  }),
  tmEntries: z.array(entryInputSchema).optional().default([]),
})

const timesheetSchema = z.object({
  jobId: z.string(),
  jobName: z.string(),
  date: z.string().optional(),
  notes: z.string().optional().default(''),
  changeOrder: z.string().nullable().optional().default(''),
  extraHours: z.union([z.string(), z.number()]).optional().default(0),
  extraWorkDescription: z.string().optional().default(''),
  tmExtraWork: tmExtraWorkSchema,
  sundryItems: z.array(z.object({
    sundryItem: z.string(),
    quantity: z.number(),
  })).optional().default([]),
  workPerformed: z.array(workPerformedEntrySchema).optional().default([]),
  painters: z.array(painterRowSchema).min(1, 'At least one painter is required'),
})

type NormalizedEntry = {
  jobId: string
  jobName: string
  date: string
  notes: string
  changeOrder: string
  displayLabel?: string
  sundryItems: Array<{ sundryItem: string; quantity: number }>
  workPerformed: Array<z.infer<typeof workPerformedEntrySchema>>
  painters: Array<z.infer<typeof painterRowSchema>>
}

type NormalizedPayload = {
  mainEntry: NormalizedEntry
  tmEntries: NormalizedEntry[]
}

function normalizePayload(payload: unknown): NormalizedPayload {
  const today = new Date().toISOString().split('T')[0]

  const newParsed = newTimesheetPayloadSchema.safeParse(payload)
  if (newParsed.success) {
    const mainDate = newParsed.data.mainEntry.date || today
    const mainEntry: NormalizedEntry = {
      jobId: newParsed.data.mainEntry.jobId,
      jobName: newParsed.data.mainEntry.jobName,
      date: mainDate,
      notes: newParsed.data.mainEntry.notes || '',
      changeOrder: newParsed.data.mainEntry.changeOrder || '',
      displayLabel: newParsed.data.mainEntry.displayLabel,
      sundryItems: newParsed.data.mainEntry.sundryItems || [],
      workPerformed: newParsed.data.mainEntry.workPerformed || [],
      painters: newParsed.data.mainEntry.painters,
    }
    const tmEntries: NormalizedEntry[] = (newParsed.data.tmEntries || []).map((entry, index) => ({
      jobId: entry.jobId || mainEntry.jobId,
      jobName: entry.jobName || mainEntry.jobName,
      date: entry.date || mainDate,
      notes: entry.notes || '',
      changeOrder: entry.changeOrder || '',
      displayLabel: entry.displayLabel || (entry.notes?.trim() ? `T&M Extra Work - ${entry.notes.trim()}` : `T&M Extra Work #${index + 1}`),
      sundryItems: entry.sundryItems || [],
      workPerformed: entry.workPerformed || [],
      painters: entry.painters || [],
    }))

    return { mainEntry, tmEntries }
  }

  const legacyParsed = timesheetSchema.parse(payload)
  const date = legacyParsed.date || today
  const mainEntry: NormalizedEntry = {
    jobId: legacyParsed.jobId,
    jobName: legacyParsed.jobName,
    date,
    notes: legacyParsed.notes || '',
    changeOrder: legacyParsed.changeOrder || '',
    sundryItems: legacyParsed.sundryItems || [],
    workPerformed: legacyParsed.workPerformed || [],
    painters: legacyParsed.painters,
  }

  const tmEntries: NormalizedEntry[] = []
  if (legacyParsed.tmExtraWork) {
    const hasTmData =
      (legacyParsed.tmExtraWork.painters?.length || 0) > 0 ||
      (legacyParsed.tmExtraWork.sundryItems?.some((i) => i.quantity > 0) ?? false) ||
      (legacyParsed.tmExtraWork.workPerformed?.length || 0) > 0 ||
      !!legacyParsed.tmExtraWork.notes?.trim() ||
      Number(legacyParsed.tmExtraWork.totalHours || 0) > 0

    if (hasTmData) {
      tmEntries.push({
        jobId: legacyParsed.jobId,
        jobName: legacyParsed.jobName,
        date,
        notes: legacyParsed.tmExtraWork.notes || legacyParsed.extraWorkDescription || '',
        changeOrder: '',
        displayLabel: (legacyParsed.tmExtraWork.notes || legacyParsed.extraWorkDescription || '').trim()
          ? `T&M Extra Work - ${(legacyParsed.tmExtraWork.notes || legacyParsed.extraWorkDescription || '').trim()}`
          : 'T&M Extra Work #1',
        sundryItems: legacyParsed.tmExtraWork.sundryItems || [],
        workPerformed: legacyParsed.tmExtraWork.workPerformed || [],
        painters: legacyParsed.tmExtraWork.painters || [],
      })
    }
  }

  return { mainEntry, tmEntries }
}

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

const SELECTED_FOREMAN_HEADER = 'x-selected-foreman-id'

/**
 * GET /api/time-entries
 * Returns the selected foreman's timesheets with nested painters.
 * Requires X-Selected-Foreman-Id header (foremen.id from Postgres).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const foremanId = request.headers.get(SELECTED_FOREMAN_HEADER)?.trim()
    if (!foremanId) {
      return NextResponse.json({ error: 'Missing X-Selected-Foreman-Id. Select a foreman first.' }, { status: 400 })
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
        eq(timeEntries.foremanId, foremanId),
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
        extraHours: te.extraHours ?? '0',
        extraWorkDescription: te.extraWorkDescription ?? '',
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
 * Create timesheet (parent + painters) in Postgres under the selected foreman, then background sync to Zoho.
 * Requires X-Selected-Foreman-Id header (foremen.id from Postgres).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const foremanId = request.headers.get(SELECTED_FOREMAN_HEADER)?.trim()
    if (!foremanId) {
      return NextResponse.json({ error: 'Missing X-Selected-Foreman-Id. Select a foreman first.' }, { status: 400 })
    }

    const payload = await request.json()
    const normalized = normalizePayload(payload)

    const mainPaintersWithHours = normalized.mainEntry.painters.map(p => {
      const totalHours = computeTotalHours(p.startTime, p.endTime, p.lunchStart || '', p.lunchEnd || '')
      return { ...p, totalHours: String(totalHours) }
    })
    const mainTotalCrewHours = mainPaintersWithHours.reduce((sum, p) => sum + parseFloat(p.totalHours), 0)

    const tmComputed = normalized.tmEntries.map((entry) => {
      const paintersWithHours = entry.painters.map(p => {
        const totalHours = computeTotalHours(p.startTime, p.endTime, p.lunchStart || '', p.lunchEnd || '')
        return { ...p, totalHours: String(totalHours) }
      })
      const totalCrewHours = paintersWithHours.reduce((sum, p) => sum + parseFloat(p.totalHours), 0)
      return {
        ...entry,
        paintersWithHours,
        totalCrewHours,
      }
    })

    const tmTotalHours = tmComputed.reduce((sum, tm) => sum + tm.totalCrewHours, 0)
    const grandTotalHours = mainTotalCrewHours + tmTotalHours
    const tmSummaryText = tmComputed.length === 0
      ? ''
      : tmComputed
        .map((tm, index) => `#${index + 1} ${tm.notes?.trim() || 'T&M Extra'} (${tm.totalCrewHours.toFixed(2)}h)`)
        .join('; ')

    const sundryData: Record<string, string> = {}
    Object.values(SUNDRY_MAP).forEach(k => { sundryData[k] = '0' })
      ; (normalized.mainEntry.sundryItems || []).forEach(item => {
        const key = SUNDRY_MAP[item.sundryItem]
        if (key) sundryData[key] = String(item.quantity)
      })

    let createdId = ''

    try {
      await db.transaction(async (tx) => {
        const mainId = crypto.randomUUID()
        createdId = mainId

        await tx.insert(workEntries).values({
          id: mainId,
          entryType: 'main',
          parentEntryId: null,
          foremanId,
          jobId: normalized.mainEntry.jobId,
          jobName: normalized.mainEntry.jobName,
          entryDate: normalized.mainEntry.date,
          notes: normalized.mainEntry.notes || '',
          changeOrder: normalized.mainEntry.changeOrder || '',
          status: 'draft',
          totalCrewHours: String(mainTotalCrewHours),
          tmCount: tmComputed.length,
          tmTotalHours: String(tmTotalHours),
          tmTotalLaborCost: '0',
          grandTotalHours: String(grandTotalHours),
          tmSummaryText,
          syncState: 'pending',
        })

        if (mainPaintersWithHours.length > 0) {
          await tx.insert(workEntryCrewRows).values(
            mainPaintersWithHours.map((p) => ({
              workEntryId: mainId,
              painterId: p.painterId,
              painterName: p.painterName,
              startTime: p.startTime,
              endTime: p.endTime,
              lunchStart: p.lunchStart || '',
              lunchEnd: p.lunchEnd || '',
              totalHours: p.totalHours,
              syncState: 'pending',
            }))
          )
        }

        const mainSundryRows = (normalized.mainEntry.sundryItems || [])
          .filter(item => Number(item.quantity) > 0)
          .map(item => ({
            workEntryId: mainId,
            sundryName: item.sundryItem,
            quantity: String(item.quantity),
            syncState: 'pending' as const,
          }))
        if (mainSundryRows.length > 0) {
          await tx.insert(workEntrySundryRows).values(mainSundryRows)
        }

        const mainWorkRows = (normalized.mainEntry.workPerformed || []).map((wp, index) => ({
          workEntryId: mainId,
          area: wp.area,
          groupCode: wp.groupCode,
          groupLabel: wp.groupLabel,
          taskCode: wp.taskCode,
          taskLabel: wp.taskLabel,
          quantity: String(wp.quantity ?? 0),
          laborHours: String(((wp.laborMinutes ?? 0) / 60).toFixed(2)),
          paintGallons: String(wp.paintGallonsUsed ?? 0),
          primerGallons: String(wp.primerGallonsUsed ?? 0),
          primerSource: wp.primerSource,
          count: wp.measurements?.count,
          linearFeet: wp.measurements?.linearFeet != null ? String(wp.measurements.linearFeet) : null,
          stairFloors: wp.measurements?.stairFloors,
          doorCount: wp.measurements?.doorCount,
          windowCount: wp.measurements?.windowCount,
          handrailCount: wp.measurements?.handrailCount,
          sortOrder: wp.sortOrder ?? index,
          syncState: 'pending' as const,
        }))
        if (mainWorkRows.length > 0) {
          await tx.insert(workEntryWorkRows).values(mainWorkRows)
        }

        for (let i = 0; i < tmComputed.length; i++) {
          const tm = tmComputed[i]
          const tmId = crypto.randomUUID()

          await tx.insert(workEntries).values({
            id: tmId,
            entryType: 'tm_extra',
            parentEntryId: mainId,
            foremanId,
            jobId: tm.jobId,
            jobName: tm.jobName,
            entryDate: tm.date,
            notes: tm.notes || '',
            changeOrder: tm.changeOrder || '',
            status: 'draft',
            tmSequence: i + 1,
            displayLabel: tm.displayLabel || `T&M Extra Work #${i + 1}`,
            totalCrewHours: String(tm.totalCrewHours),
            syncState: 'pending',
          })

          if (tm.paintersWithHours.length > 0) {
            await tx.insert(workEntryCrewRows).values(
              tm.paintersWithHours.map((p) => ({
                workEntryId: tmId,
                painterId: p.painterId,
                painterName: p.painterName,
                startTime: p.startTime,
                endTime: p.endTime,
                lunchStart: p.lunchStart || '',
                lunchEnd: p.lunchEnd || '',
                totalHours: p.totalHours,
                syncState: 'pending',
              }))
            )
          }

          const tmSundryRows = (tm.sundryItems || [])
            .filter(item => Number(item.quantity) > 0)
            .map(item => ({
              workEntryId: tmId,
              sundryName: item.sundryItem,
              quantity: String(item.quantity),
              syncState: 'pending' as const,
            }))
          if (tmSundryRows.length > 0) {
            await tx.insert(workEntrySundryRows).values(tmSundryRows)
          }

          const tmWorkRows = (tm.workPerformed || []).map((wp, index) => ({
            workEntryId: tmId,
            area: wp.area,
            groupCode: wp.groupCode,
            groupLabel: wp.groupLabel,
            taskCode: wp.taskCode,
            taskLabel: wp.taskLabel,
            quantity: String(wp.quantity ?? 0),
            laborHours: String(((wp.laborMinutes ?? 0) / 60).toFixed(2)),
            paintGallons: String(wp.paintGallonsUsed ?? 0),
            primerGallons: String(wp.primerGallonsUsed ?? 0),
            primerSource: wp.primerSource,
            count: wp.measurements?.count,
            linearFeet: wp.measurements?.linearFeet != null ? String(wp.measurements.linearFeet) : null,
            stairFloors: wp.measurements?.stairFloors,
            doorCount: wp.measurements?.doorCount,
            windowCount: wp.measurements?.windowCount,
            handrailCount: wp.measurements?.handrailCount,
            sortOrder: wp.sortOrder ?? index,
            syncState: 'pending' as const,
          }))
          if (tmWorkRows.length > 0) {
            await tx.insert(workEntryWorkRows).values(tmWorkRows)
          }
        }

        // Legacy write path (kept for backward compatibility with existing GET and Zoho sync flow)
        await tx.insert(timeEntries).values({
          id: mainId,
          foremanId,
          jobId: normalized.mainEntry.jobId,
          jobName: normalized.mainEntry.jobName,
          date: normalized.mainEntry.date,
          startTime: '',
          endTime: '',
          lunchStart: '',
          lunchEnd: '',
          totalHours: '0',
          notes: normalized.mainEntry.notes || '',
          changeOrder: normalized.mainEntry.changeOrder || '',
          synced: false,
          totalCrewHours: String(mainTotalCrewHours),
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
          extraHours: String(tmTotalHours),
          extraWorkDescription: tmSummaryText,
        })

        if (mainPaintersWithHours.length > 0) {
          await tx.insert(timesheetPainters).values(
            mainPaintersWithHours.map((p) => ({
              timesheetId: mainId,
              painterId: p.painterId,
              painterName: p.painterName,
              startTime: p.startTime,
              endTime: p.endTime,
              lunchStart: p.lunchStart || '',
              lunchEnd: p.lunchEnd || '',
              totalHours: p.totalHours,
            }))
          )
        }
      })
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

    const insertedPainters = await db.select().from(timesheetPainters).where(eq(timesheetPainters.timesheetId, createdId))
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
      id: createdId,
      userId: foremanId,
      jobId: normalized.mainEntry.jobId,
      jobName: normalized.mainEntry.jobName,
      date: normalized.mainEntry.date,
      notes: normalized.mainEntry.notes,
      changeOrder: normalized.mainEntry.changeOrder ?? undefined,
      synced: false,
      zohoTimeEntryId: undefined as string | undefined,
      totalCrewHours: String(mainTotalCrewHours),
      painters: paintersForSync,
      extraHours: String(tmTotalHours),
      extraWorkDescription: tmSummaryText,
      ...sundryData,
    }

    waitUntil(
      (async () => {
        try {
          await syncTimesheetToZoho(timesheetData, foremanId)
          await retryFailedSyncs(foremanId)
        } catch (e) {
          console.error('[API] Background sync error:', e)
        }
      })()
    )

    return NextResponse.json({
      success: true,
      id: createdId,
      jobId: normalized.mainEntry.jobId,
      jobName: normalized.mainEntry.jobName,
      date: normalized.mainEntry.date,
      notes: normalized.mainEntry.notes,
      totalCrewHours: mainTotalCrewHours,
      extraHours: String(tmTotalHours),
      extraWorkDescription: tmSummaryText,
      synced: false,
      painters: mainPaintersWithHours.map(p => ({
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
