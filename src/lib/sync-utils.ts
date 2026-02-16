import { db } from '@/lib/db'
import { timeEntries, timesheetPainters, users } from '@/lib/schema'
import { zohoClient } from '@/lib/zoho'
import { getUserTimezoneOffset } from '@/lib/timezone'
import { eq, and } from 'drizzle-orm'

export interface TimesheetPainterData {
  id: string
  painterId: string
  painterName: string
  startTime: string
  endTime: string
  lunchStart: string
  lunchEnd: string
  totalHours: string
  zohoJunctionId?: string
}

export interface TimesheetData {
  id: string
  userId: string
  jobId: string
  jobName: string
  date: string
  notes?: string
  changeOrder?: string
  synced: boolean
  zohoTimeEntryId?: string
  totalCrewHours: string
  painters: TimesheetPainterData[]
  maskingPaperRoll?: string
  plasticRoll?: string
  puttySpackleTub?: string
  caulkTube?: string
  whiteTapeRoll?: string
  orangeTapeRoll?: string
  floorPaperRoll?: string
  tip?: string
  sandingSponge?: string
  inchRollerCover18?: string
  inchRollerCover9?: string
  miniCover?: string
  masks?: string
  brickTapeRoll?: string
}

const SUNDRY_TO_ZOHO: Record<string, string> = {
  maskingPaperRoll: 'Masking_Paper_Roll',
  plasticRoll: 'Plastic_Roll',
  puttySpackleTub: 'Putty_Spackle_Tub',
  caulkTube: 'Caulk_Tube',
  whiteTapeRoll: 'White_Tape_Roll',
  orangeTapeRoll: 'Orange_Tape_Roll',
  floorPaperRoll: 'Floor_Paper_Roll',
  tip: 'Tip',
  sandingSponge: 'Sanding_Sponge',
  inchRollerCover18: 'Inch_Roller_Cover1',
  inchRollerCover9: 'Inch_Roller_Cover',
  miniCover: 'Mini_Cover',
  masks: 'Masks',
  brickTapeRoll: 'Brick_Tape_Roll',
}

function buildSundryPayload(data: TimesheetData): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [dbKey, zohoName] of Object.entries(SUNDRY_TO_ZOHO)) {
    const q = parseInt((data as unknown as Record<string, string>)[dbKey] || '0', 10)
    if (q > 0) out[zohoName] = q
  }
  return out
}

async function getForemanZohoIdFromEmail(email: string): Promise<string | null> {
  try {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    return user?.zohoId || null
  } catch (error) {
    console.error('[Sync] Failed to lookup Foreman Portal User ID:', error)
    return null
  }
}

/**
 * Two-phase Zoho sync for a timesheet: create parent Time_Entry, then create each Time_Entries_X_Painters record.
 */
export async function syncTimesheetToZoho(data: TimesheetData, foremanEmail: string): Promise<void> {
  const timezone = getUserTimezoneOffset()
  const foremanId = await getForemanZohoIdFromEmail(foremanEmail)
  if (!foremanId) {
    console.warn(`[Sync] Foreman Portal User ID not found for ${foremanEmail}, skipping Zoho sync`)
    return
  }

  let zohoTimeEntryId: string | null = data.zohoTimeEntryId || null

  // Phase 1: Create parent Time_Entries record if not already created
  if (!zohoTimeEntryId) {
    try {
      const sundryItems = buildSundryPayload(data)
      const parent = await zohoClient.createTimeEntryParent({
        projectId: data.jobId,
        foremanId,
        date: data.date,
        notes: data.notes,
        sundryItems: Object.keys(sundryItems).length > 0 ? sundryItems : undefined,
      })
      const newId = parent?.id
      if (!newId) {
        throw new Error('Zoho createTimeEntryParent did not return an id')
      }
      zohoTimeEntryId = newId
      await db.update(timeEntries)
        .set({ zohoTimeEntryId: newId })
        .where(eq(timeEntries.id, data.id))
      console.log(`[Sync] Created Zoho parent Time_Entry: ${zohoTimeEntryId}`)
    } catch (err: any) {
      console.error(`[Sync] Failed to create Zoho parent for timesheet ${data.id}:`, err?.message || err)
      return
    }
  }

  // Phase 2: Create junction records for painters that don't have zoho_junction_id.
  // Only sync painters that have a Zoho-style id (long numeric). Skip test/seed ids like "dummy-001"
  // because Zoho Painters lookup requires an actual Zoho Painter record id.
  const paintersToSync = data.painters.filter(p => !p.zohoJunctionId)
  for (const p of paintersToSync) {
    const isZohoPainterId = /^\d{10,}$/.test(String(p.painterId))
    if (!isZohoPainterId) {
      console.warn(`[Sync] Skipping junction for painter ${p.painterId} – not a Zoho Painter record id (use painters synced from Zoho CRM for junction sync).`)
      continue
    }
    try {
      const junction = await zohoClient.createTimesheetPainterEntry({
        zohoTimeEntryId,
        painterId: p.painterId,
        date: data.date,
        startTime: p.startTime,
        endTime: p.endTime,
        lunchStart: p.lunchStart || undefined,
        lunchEnd: p.lunchEnd || undefined,
        totalHours: p.totalHours,
        timezone,
      })
      const junctionId = junction?.id
      if (junctionId) {
        await db.update(timesheetPainters)
          .set({ zohoJunctionId: junctionId })
          .where(eq(timesheetPainters.id, p.id))
        console.log(`[Sync] Created Zoho junction for painter ${p.painterId}: ${junctionId}`)
      }
    } catch (err: any) {
      console.error(`[Sync] Failed to create Zoho junction for painter ${p.painterId}:`, err?.message || err)
    }
  }

  // Phase 3: If all painters now have zoho_junction_id, mark timesheet as synced
  const allSynced = data.painters.every(p => p.zohoJunctionId) ||
    (data.painters.filter(p => !p.zohoJunctionId).length === 0 && paintersToSync.length === 0)
  const afterSync = await db.select().from(timesheetPainters).where(eq(timesheetPainters.timesheetId, data.id))
  const allJunctionSynced = afterSync.length > 0 && afterSync.every(row => row.zohoJunctionId != null)
  if (zohoTimeEntryId && allJunctionSynced) {
    await db.update(timeEntries).set({ synced: true }).where(eq(timeEntries.id, data.id))
    console.log(`[Sync] Timesheet ${data.id} marked synced`)
  }
}

/**
 * Retry unsynced timesheets for this foreman (piggyback recovery).
 */
export async function retryFailedSyncs(foremanEmail: string, foremanUserId: string): Promise<void> {
  try {
    const unsynced = await db.select().from(timeEntries).where(and(
      eq(timeEntries.userId, foremanUserId),
      eq(timeEntries.synced, false)
    ))
    if (unsynced.length === 0) return

    console.log(`[Retry] Found ${unsynced.length} unsynced timesheets, retrying...`)
    for (const te of unsynced) {
      const rows = await db.select().from(timesheetPainters).where(eq(timesheetPainters.timesheetId, te.id))
      const paintersData: TimesheetPainterData[] = rows.map(r => ({
        id: r.id,
        painterId: r.painterId,
        painterName: r.painterName,
        startTime: r.startTime,
        endTime: r.endTime,
        lunchStart: r.lunchStart || '',
        lunchEnd: r.lunchEnd || '',
        totalHours: r.totalHours,
        zohoJunctionId: r.zohoJunctionId ?? undefined,
      }))
      const timesheetData: TimesheetData = {
        id: te.id,
        userId: te.userId,
        jobId: te.jobId,
        jobName: te.jobName,
        date: te.date,
        notes: te.notes ?? undefined,
        changeOrder: te.changeOrder ?? undefined,
        synced: te.synced,
        zohoTimeEntryId: te.zohoTimeEntryId ?? undefined,
        totalCrewHours: te.totalCrewHours ?? '0',
        painters: paintersData,
        maskingPaperRoll: te.maskingPaperRoll ?? undefined,
        plasticRoll: te.plasticRoll ?? undefined,
        puttySpackleTub: te.puttySpackleTub ?? undefined,
        caulkTube: te.caulkTube ?? undefined,
        whiteTapeRoll: te.whiteTapeRoll ?? undefined,
        orangeTapeRoll: te.orangeTapeRoll ?? undefined,
        floorPaperRoll: te.floorPaperRoll ?? undefined,
        tip: te.tip ?? undefined,
        sandingSponge: te.sandingSponge ?? undefined,
        inchRollerCover18: te.inchRollerCover18 ?? undefined,
        inchRollerCover9: te.inchRollerCover9 ?? undefined,
        miniCover: te.miniCover ?? undefined,
        masks: te.masks ?? undefined,
        brickTapeRoll: te.brickTapeRoll ?? undefined,
      }
      await syncTimesheetToZoho(timesheetData, foremanEmail)
    }
    console.log(`[Retry] Completed retry for ${unsynced.length} timesheets`)
  } catch (error) {
    console.error('[Retry] Failed to retry syncs:', error)
  }
}
