import { db } from '@/lib/db'
import {
    foremen,
    painters,
    projects,
    timeEntries,
    timesheetPainters,
    workEntries,
    workEntryCrewRows,
    workEntrySundryRows,
    workEntryWorkRows,
} from '@/lib/schema'
import { zohoClient } from '@/lib/zoho'
import { getUserTimezoneOffset } from '@/lib/timezone'
import { and, eq, or } from 'drizzle-orm'

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
    extraHours?: string
    extraWorkDescription?: string
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

interface WorkPerformedSyncRow {
    id: string
    workEntryId: string
    area: string
    groupCode: string
    groupLabel: string
    taskCode: string
    taskLabel: string
    quantity: string
    laborHours: string
    paintGallons: string
    primerGallons: string
    primerSource: string
    count: number | null
    linearFeet: string | null
    stairFloors: number | null
    doorCount: number | null
    windowCount: number | null
    handrailCount: number | null
    sortOrder: number
    zohoRecordId: string | null
    entryType: string
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

const SUNDRY_LABEL_TO_ZOHO: Record<string, string> = {
    'Masking Paper Roll': 'Masking_Paper_Roll',
    'Plastic Roll': 'Plastic_Roll',
    'Putty/Spackle Tub': 'Putty_Spackle_Tub',
    'Caulk Tube': 'Caulk_Tube',
    'White Tape Roll': 'White_Tape_Roll',
    'Orange Tape Roll': 'Orange_Tape_Roll',
    'Floor Paper Roll': 'Floor_Paper_Roll',
    'Tip': 'Tip',
    'Sanding Sponge': 'Sanding_Sponge',
    '18" Roller Cover': 'Inch_Roller_Cover1',
    '9" Roller Cover': 'Inch_Roller_Cover',
    'Mini Cover': 'Mini_Cover',
    'Masks': 'Masks',
    'Brick Tape Roll': 'Brick_Tape_Roll',
}

function buildLegacySundryPayload(data: TimesheetData): Record<string, number> {
    const out: Record<string, number> = {}
    for (const [dbKey, zohoName] of Object.entries(SUNDRY_TO_ZOHO)) {
        const q = parseInt((data as unknown as Record<string, string>)[dbKey] || '0', 10)
        if (q > 0) out[zohoName] = q
    }
    return out
}

function isZohoStyleId(value: string | null | undefined): boolean {
    return /^\d{10,}$/.test(String(value ?? ''))
}

function toNumber(value: string | number | null | undefined): number {
    const parsed = Number(value ?? 0)
    return Number.isFinite(parsed) ? parsed : 0
}

function parseTimeToMinutes(time: string | null | undefined): number {
    if (!time) return Number.NaN
    const normalized = String(time).trim().toUpperCase()
    const meridiemMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/)
    if (meridiemMatch) {
        let hours = Number(meridiemMatch[1])
        const minutes = Number(meridiemMatch[2])
        const suffix = meridiemMatch[3]
        if (suffix === 'PM' && hours !== 12) hours += 12
        if (suffix === 'AM' && hours === 12) hours = 0
        return hours * 60 + minutes
    }
    const parts = normalized.split(':')
    if (parts.length < 2) return Number.NaN
    const hours = Number(parts[0])
    const minutes = Number(parts[1])
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.NaN
    return hours * 60 + minutes
}

function minutesToTimeString(minutes: number): string {
    const safe = ((Math.round(minutes) % 1440) + 1440) % 1440
    const hours = Math.floor(safe / 60)
    const mins = safe % 60
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

function formatZohoDateTime(date: string, time: string, timezone: string): string {
    return `${date}T${time}:00${timezone}`
}

function buildEntryTimeSummary(
    date: string,
    timezone: string,
    crewRows: Array<{
        startTime: string
        endTime: string
        lunchStart: string
        lunchEnd: string
        totalHours: string | number
    }>
) {
    const validRows = crewRows.filter((row) => row.startTime && row.endTime)
    if (validRows.length === 0) {
        return {
            startDateTime: undefined,
            endDateTime: undefined,
            lunchStartDateTime: undefined,
            lunchEndDateTime: undefined,
            totalHours: 0,
        }
    }

    const startMinutes = validRows.map((row) => parseTimeToMinutes(row.startTime)).filter(Number.isFinite)
    const endMinutes = validRows.map((row) => parseTimeToMinutes(row.endTime)).filter(Number.isFinite)
    const lunchStarts = validRows.map((row) => parseTimeToMinutes(row.lunchStart)).filter(Number.isFinite)
    const lunchEnds = validRows.map((row) => parseTimeToMinutes(row.lunchEnd)).filter(Number.isFinite)
    const totalHours = validRows.reduce((sum, row) => sum + toNumber(row.totalHours), 0)

    return {
        startDateTime: startMinutes.length > 0 ? formatZohoDateTime(date, minutesToTimeString(Math.min(...startMinutes)), timezone) : undefined,
        endDateTime: endMinutes.length > 0 ? formatZohoDateTime(date, minutesToTimeString(Math.max(...endMinutes)), timezone) : undefined,
        lunchStartDateTime: lunchStarts.length > 0 ? formatZohoDateTime(date, minutesToTimeString(Math.min(...lunchStarts)), timezone) : undefined,
        lunchEndDateTime: lunchEnds.length > 0 ? formatZohoDateTime(date, minutesToTimeString(Math.max(...lunchEnds)), timezone) : undefined,
        totalHours: Number(totalHours.toFixed(2)),
    }
}

function buildTotalHoursOnly(crewRows: Array<{ totalHours: string | number }>): number {
    const totalHours = crewRows.reduce((sum, row) => sum + toNumber(row.totalHours), 0)
    return Number(totalHours.toFixed(2))
}

async function resolveProjectZohoId(timesheetId: string, jobId: string, jobName: string): Promise<string | null> {
    const trimmedJobId = String(jobId ?? '').trim()
    const trimmedJobName = String(jobName ?? '').trim()

    const [projectById] = trimmedJobId
        ? await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, trimmedJobId)).limit(1)
        : []

    if (projectById?.id && isZohoStyleId(projectById.id)) {
        return projectById.id
    }

    const [projectByName] = trimmedJobName
        ? await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.name, trimmedJobName)).limit(1)
        : []

    if (!projectByName?.id || !isZohoStyleId(projectByName.id)) {
        console.warn(
            `[Sync] Unable to resolve Zoho project lookup for timesheet ${timesheetId}: stored jobId=${JSON.stringify(jobId)}, jobName=${JSON.stringify(jobName)}`
        )
        return null
    }

    if (projectByName.id !== trimmedJobId) {
        await db.update(timeEntries)
            .set({ jobId: projectByName.id, jobName: projectByName.name })
            .where(eq(timeEntries.id, timesheetId))

        await db.update(workEntries)
            .set({ jobId: projectByName.id, jobName: projectByName.name })
            .where(or(eq(workEntries.id, timesheetId), eq(workEntries.parentEntryId, timesheetId)))

        console.log(
            `[Sync] Repaired project lookup for timesheet ${timesheetId}: ${JSON.stringify(trimmedJobId)} -> ${JSON.stringify(projectByName.id)} using project name ${JSON.stringify(projectByName.name)}`
        )
    }

    return projectByName.id
}

async function resolvePainterZohoIdForCrewRow(crewRowId: string, painterId: string, painterName: string): Promise<string | null> {
    const trimmedPainterId = String(painterId ?? '').trim()
    const trimmedPainterName = String(painterName ?? '').trim()

    const [painterById] = trimmedPainterId
        ? await db.select({ id: painters.id, name: painters.name }).from(painters).where(eq(painters.id, trimmedPainterId)).limit(1)
        : []

    if (painterById?.id && isZohoStyleId(painterById.id)) {
        return painterById.id
    }

    const [painterByName] = trimmedPainterName
        ? await db.select({ id: painters.id, name: painters.name }).from(painters).where(eq(painters.name, trimmedPainterName)).limit(1)
        : []

    if (!painterByName?.id || !isZohoStyleId(painterByName.id)) {
        console.warn(
            `[Sync] Unable to resolve Zoho painter lookup for workEntryCrewRow ${crewRowId}: stored painterId=${JSON.stringify(painterId)}, painterName=${JSON.stringify(painterName)}`
        )
        return null
    }

    if (painterByName.id !== trimmedPainterId) {
        await db.update(workEntryCrewRows)
            .set({ painterId: painterByName.id, painterName: painterByName.name })
            .where(eq(workEntryCrewRows.id, crewRowId))

        console.log(
            `[Sync] Repaired painter lookup for workEntryCrewRow ${crewRowId}: ${JSON.stringify(trimmedPainterId)} -> ${JSON.stringify(painterByName.id)} using painter name ${JSON.stringify(painterByName.name)}`
        )
    }

    return painterByName.id
}

async function getPendingWorkPerformedRows(workEntryId: string): Promise<WorkPerformedSyncRow[]> {
    const rows = await db
        .select({
            id: workEntryWorkRows.id,
            workEntryId: workEntryWorkRows.workEntryId,
            area: workEntryWorkRows.area,
            groupCode: workEntryWorkRows.groupCode,
            groupLabel: workEntryWorkRows.groupLabel,
            taskCode: workEntryWorkRows.taskCode,
            taskLabel: workEntryWorkRows.taskLabel,
            quantity: workEntryWorkRows.quantity,
            laborHours: workEntryWorkRows.laborHours,
            paintGallons: workEntryWorkRows.paintGallons,
            primerGallons: workEntryWorkRows.primerGallons,
            primerSource: workEntryWorkRows.primerSource,
            count: workEntryWorkRows.count,
            linearFeet: workEntryWorkRows.linearFeet,
            stairFloors: workEntryWorkRows.stairFloors,
            doorCount: workEntryWorkRows.doorCount,
            windowCount: workEntryWorkRows.windowCount,
            handrailCount: workEntryWorkRows.handrailCount,
            sortOrder: workEntryWorkRows.sortOrder,
            zohoRecordId: workEntryWorkRows.zohoRecordId,
            entryType: workEntries.entryType,
        })
        .from(workEntryWorkRows)
        .innerJoin(workEntries, eq(workEntries.id, workEntryWorkRows.workEntryId))
        .where(eq(workEntryWorkRows.workEntryId, workEntryId))

    return rows
        .filter((row) => !row.zohoRecordId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
}

async function getWorkEntriesForTimesheet(timesheetId: string) {
    const rows = await db
        .select({
            id: workEntries.id,
            entryType: workEntries.entryType,
            parentEntryId: workEntries.parentEntryId,
            notes: workEntries.notes,
            displayLabel: workEntries.displayLabel,
            tmSequence: workEntries.tmSequence,
            entryDate: workEntries.entryDate,
            jobId: workEntries.jobId,
            jobName: workEntries.jobName,
            zohoRecordId: workEntries.zohoRecordId,
        })
        .from(workEntries)
        .where(or(eq(workEntries.id, timesheetId), eq(workEntries.parentEntryId, timesheetId)))

    return rows.sort((a, b) => {
        if (a.id === timesheetId) return -1
        if (b.id === timesheetId) return 1
        return (a.tmSequence ?? 0) - (b.tmSequence ?? 0)
    })
}

async function getEntrySundryPayload(workEntryId: string): Promise<Record<string, number>> {
    const rows = await db
        .select({ sundryName: workEntrySundryRows.sundryName, quantity: workEntrySundryRows.quantity })
        .from(workEntrySundryRows)
        .where(eq(workEntrySundryRows.workEntryId, workEntryId))

    const payload: Record<string, number> = {}
    for (const row of rows) {
        const apiName = SUNDRY_LABEL_TO_ZOHO[row.sundryName]
        if (!apiName) continue
        const quantity = toNumber(row.quantity)
        if (quantity > 0) payload[apiName] = quantity
    }
    return payload
}

/** Resolve foreman's Zoho Portal User ID and email from foremen table (by foremen.id). */
async function getForemanById(foremanId: string): Promise<{ zohoId: string; email: string } | null> {
    try {
        const [row] = await db.select({ zohoId: foremen.zohoId, email: foremen.email }).from(foremen).where(eq(foremen.id, foremanId)).limit(1)
        if (!row?.zohoId) return null
        const email = (row.email === 'EMPTY' || !row.email) ? '' : row.email
        return { zohoId: row.zohoId, email }
    } catch (error) {
        console.error('[Sync] Failed to lookup foreman by id:', error)
        return null
    }
}

/**
 * Sync timesheet to Zoho using main + T&M child records in the same Time_Entries module.
 * foremanId: selected foreman's id (foremen.id from Postgres).
 */
export async function syncTimesheetToZoho(data: TimesheetData, foremanId: string): Promise<void> {
    const timezone = getUserTimezoneOffset()
    const foreman = await getForemanById(foremanId)
    if (!foreman) {
        console.warn(`[Sync] Foreman not found for id ${foremanId}, skipping Zoho sync`)
        return
    }
    const zohoPortalUserId = foreman.zohoId

    const resolvedProjectId = await resolveProjectZohoId(data.id, data.jobId, data.jobName)
    if (!resolvedProjectId) return

    const entries = await getWorkEntriesForTimesheet(data.id)
    const mainEntry = entries.find((e) => e.id === data.id) ?? entries.find((e) => e.entryType === 'main')
    if (!mainEntry) {
        console.warn(`[Sync] Main work entry missing for timesheet ${data.id}, skipping Zoho sync`)
        return
    }

    let mainZohoId = mainEntry.zohoRecordId || data.zohoTimeEntryId || null

    if (!mainZohoId) {
        try {
            const sundryItems = await getEntrySundryPayload(mainEntry.id)
            const legacySundry = Object.keys(sundryItems).length > 0 ? sundryItems : buildLegacySundryPayload(data)
            const mainCrewRows = await db
                .select()
                .from(workEntryCrewRows)
                .where(eq(workEntryCrewRows.workEntryId, mainEntry.id))
            const mainTotalHours = buildTotalHoursOnly(mainCrewRows)

            const parent = await zohoClient.createTimeEntryParent({
                projectId: resolvedProjectId,
                foremanId: zohoPortalUserId,
                date: String(mainEntry.entryDate),
                notes: mainEntry.notes || data.notes,
                displayLabel: mainEntry.displayLabel || undefined,
                timeEntryType: 'Main',
                totalHours: mainTotalHours,
                sundryItems: Object.keys(legacySundry).length > 0 ? legacySundry : undefined,
            })

            if (!parent?.id) {
                throw new Error('Zoho createTimeEntryParent did not return an id for main entry')
            }

            mainZohoId = parent.id
            await db.update(timeEntries).set({ zohoTimeEntryId: parent.id }).where(eq(timeEntries.id, data.id))
            await db.update(workEntries)
                .set({ zohoRecordId: parent.id, syncState: 'pending' })
                .where(eq(workEntries.id, mainEntry.id))

            console.log(`[Sync] Created Zoho main Time_Entry ${parent.id} for ${data.id}`)
        } catch (err: any) {
            await db.update(workEntries).set({ syncState: 'failed' }).where(eq(workEntries.id, mainEntry.id))
            console.error(`[Sync] Failed to create Zoho main Time_Entry for ${data.id}:`, err?.message || err)
            return
        }
    }

    const zohoIdByEntryId: Record<string, string> = { [mainEntry.id]: mainZohoId }
    const tmEntries = entries.filter((e) => e.id !== mainEntry.id && e.entryType === 'tm_extra')

    for (const tm of tmEntries) {
        let tmZohoId = tm.zohoRecordId || null
        if (!tmZohoId) {
            try {
                const tmSundry = await getEntrySundryPayload(tm.id)
                const tmCrewRows = await db
                    .select()
                    .from(workEntryCrewRows)
                    .where(eq(workEntryCrewRows.workEntryId, tm.id))
                const tmTotalHours = buildTotalHoursOnly(tmCrewRows)
                const created = await zohoClient.createTimeEntryParent({
                    projectId: resolvedProjectId,
                    foremanId: zohoPortalUserId,
                    date: String(tm.entryDate),
                    notes: tm.notes || '',
                    displayLabel: tm.displayLabel || `T&M Extra Work #${tm.tmSequence ?? 1}`,
                    timeEntryType: 'T&M Extra',
                    parentTimeEntryId: mainZohoId,
                    totalHours: tmTotalHours,
                    sundryItems: Object.keys(tmSundry).length > 0 ? tmSundry : undefined,
                })

                if (!created?.id) {
                    throw new Error('Zoho createTimeEntryParent did not return an id for tm entry')
                }

                tmZohoId = created.id
                await db.update(workEntries)
                    .set({ zohoRecordId: created.id, syncState: 'pending' })
                    .where(eq(workEntries.id, tm.id))
                console.log(`[Sync] Created Zoho T&M Time_Entry ${created.id} for workEntry ${tm.id}`)
            } catch (err: any) {
                await db.update(workEntries).set({ syncState: 'failed' }).where(eq(workEntries.id, tm.id))
                console.error(`[Sync] Failed to create Zoho T&M Time_Entry for workEntry ${tm.id}:`, err?.message || err)
                continue
            }
        }
        zohoIdByEntryId[tm.id] = tmZohoId
    }

    for (const entry of [mainEntry, ...tmEntries]) {
        const entryZohoId = zohoIdByEntryId[entry.id]
        if (!entryZohoId) continue

        const pendingWorkRows = await getPendingWorkPerformedRows(entry.id)
        for (const row of pendingWorkRows) {
            try {
                const workRecord = await zohoClient.createWorkPerformedEntry({
                    zohoTimeEntryId: entryZohoId,
                    type: row.entryType === 'tm_extra' ? 'T&M' : 'Actual',
                    area: row.area === 'exterior' ? 'exterior' : 'interior',
                    groupCode: row.groupCode,
                    groupLabel: row.groupLabel,
                    taskCode: row.taskCode,
                    taskLabel: row.taskLabel,
                    quantity: toNumber(row.quantity),
                    laborHours: toNumber(row.laborHours),
                    paintGallons: toNumber(row.paintGallons),
                    primerGallons: toNumber(row.primerGallons),
                    primerSource: row.primerSource === 'retail' ? 'retail' : 'stock',
                    measurements: {
                        count: row.count,
                        linearFeet: row.linearFeet != null ? toNumber(row.linearFeet) : null,
                        stairFloors: row.stairFloors,
                        doorCount: row.doorCount,
                        windowCount: row.windowCount,
                        handrailCount: row.handrailCount,
                    },
                    sortOrder: row.sortOrder,
                })

                await db.update(workEntryWorkRows)
                    .set({ zohoRecordId: workRecord.id, syncState: 'synced' })
                    .where(eq(workEntryWorkRows.id, row.id))
            } catch (err: any) {
                await db.update(workEntryWorkRows).set({ syncState: 'failed' }).where(eq(workEntryWorkRows.id, row.id))
                console.error(`[Sync] Failed Work_Performed sync for row ${row.id}:`, err?.message || err)
            }
        }

        const crewRows = await db
            .select()
            .from(workEntryCrewRows)
            .where(eq(workEntryCrewRows.workEntryId, entry.id))

        for (const crew of crewRows.filter((c) => !c.zohoRecordId)) {
            const resolvedPainterId = await resolvePainterZohoIdForCrewRow(crew.id, crew.painterId, crew.painterName)
            if (!resolvedPainterId) {
                await db.update(workEntryCrewRows).set({ syncState: 'failed' }).where(eq(workEntryCrewRows.id, crew.id))
                continue
            }

            const lunchMinutes = crew.lunchStart && crew.lunchEnd
                ? Math.max(0, parseTimeToMinutes(crew.lunchEnd) - parseTimeToMinutes(crew.lunchStart))
                : 0
            const lunchHours = lunchMinutes > 0 ? Number((lunchMinutes / 60).toFixed(2)) : 0

            try {
                const junction = await zohoClient.createTimesheetPainterEntry({
                    zohoTimeEntryId: entryZohoId,
                    painterId: resolvedPainterId,
                    date: String(entry.entryDate),
                    startTime: crew.startTime,
                    endTime: crew.endTime,
                    totalHours: String(crew.totalHours),
                    lunchHours,
                    timezone,
                })

                await db.update(workEntryCrewRows)
                    .set({ zohoRecordId: junction.id, syncState: 'synced' })
                    .where(eq(workEntryCrewRows.id, crew.id))

                if (entry.id === data.id) {
                    await db.update(timesheetPainters)
                        .set({ zohoJunctionId: junction.id })
                        .where(and(
                            eq(timesheetPainters.timesheetId, data.id),
                            eq(timesheetPainters.painterId, crew.painterId),
                            eq(timesheetPainters.startTime, crew.startTime),
                            eq(timesheetPainters.endTime, crew.endTime)
                        ))
                }
            } catch (err: any) {
                await db.update(workEntryCrewRows).set({ syncState: 'failed' }).where(eq(workEntryCrewRows.id, crew.id))
                console.error(`[Sync] Failed painter junction sync for crew row ${crew.id}:`, err?.message || err)
            }
        }
    }

    let allEntriesSynced = true
    for (const entry of [mainEntry, ...tmEntries]) {
        const [entryRow] = await db.select().from(workEntries).where(eq(workEntries.id, entry.id)).limit(1)
        const crewRows = await db.select().from(workEntryCrewRows).where(eq(workEntryCrewRows.workEntryId, entry.id))
        const workRows = await db.select().from(workEntryWorkRows).where(eq(workEntryWorkRows.workEntryId, entry.id))

        const entrySynced =
            !!entryRow?.zohoRecordId &&
            crewRows.every((row) => !!row.zohoRecordId) &&
            workRows.every((row) => !!row.zohoRecordId)

        await db.update(workEntries)
            .set({ syncState: entrySynced ? 'synced' : 'failed' })
            .where(eq(workEntries.id, entry.id))

        if (!entrySynced) allEntriesSynced = false
    }

    await db.update(timeEntries).set({ synced: allEntriesSynced }).where(eq(timeEntries.id, data.id))
    if (allEntriesSynced) {
        console.log(`[Sync] Timesheet ${data.id} and all linked T&M entries marked synced`)
    }
}

/**
 * Retry unsynced timesheets for this foreman (piggyback recovery).
 * foremanId: selected foreman's id (foremen.id from Postgres).
 */
export async function retryFailedSyncs(foremanId: string): Promise<void> {
    try {
        const unsynced = await db.select().from(timeEntries).where(and(
            eq(timeEntries.foremanId, foremanId),
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
                userId: te.foremanId ?? te.userId ?? '',
                jobId: te.jobId,
                jobName: te.jobName,
                date: te.date,
                notes: te.notes ?? undefined,
                changeOrder: te.changeOrder ?? undefined,
                extraHours: te.extraHours ?? undefined,
                extraWorkDescription: te.extraWorkDescription ?? undefined,
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
            await syncTimesheetToZoho(timesheetData, foremanId)
        }
        console.log(`[Retry] Completed retry for ${unsynced.length} timesheets`)
    } catch (error) {
        console.error('[Retry] Failed to retry syncs:', error)
    }
}
