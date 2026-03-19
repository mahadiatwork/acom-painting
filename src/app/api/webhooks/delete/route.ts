import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { foremen, painters, projects, timeEntries, timesheetPainters, workEntries, workEntryCrewRows } from '@/lib/schema'
import { eq } from 'drizzle-orm'

type DeleteModule = 'portal_users' | 'foremen' | 'deals' | 'painters'

function normalizeModule(value: string | null | undefined): DeleteModule | null {
    const key = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
    if (key === 'portal_users' || key === 'portal_user') return 'portal_users'
    if (key === 'foremen' || key === 'foreman') return 'foremen'
    if (key === 'deals' || key === 'deal') return 'deals'
    if (key === 'painters' || key === 'painter') return 'painters'
    return null
}

function getWebhookSecret(request: NextRequest): string {
    const authHeader = request.headers.get('Authorization')
    return (
        authHeader?.replace(/^\s*Bearer\s+/i, '').trim() ||
        request.headers.get('x-roofworx-secret')?.trim() ||
        request.headers.get('x-zoho-delete-secret')?.trim() ||
        ''
    )
}

function deletedToken(zohoId: string) {
    return `DELETED:${zohoId}`
}

async function handleForemanDelete(zohoId: string) {
    const [row] = await db.select({ id: foremen.id }).from(foremen).where(eq(foremen.zohoId, zohoId)).limit(1)
    if (!row?.id) {
        return { deleted: false, anonymized: 0, reason: 'Foreman not found (already deleted or never synced)' }
    }

    const token = deletedToken(zohoId)

    await db.update(timeEntries)
        .set({ foremanId: null })
        .where(eq(timeEntries.foremanId, row.id))

    await db.update(workEntries)
        .set({ foremanId: token, syncState: 'pending' })
        .where(eq(workEntries.foremanId, row.id))

    await db.delete(foremen).where(eq(foremen.id, row.id))

    return { deleted: true, anonymized: 1 }
}

async function handleDealDelete(zohoId: string) {
    const token = deletedToken(zohoId)

    await db.update(timeEntries)
        .set({ jobId: token, jobName: 'Deleted Project', synced: false })
        .where(eq(timeEntries.jobId, zohoId))

    await db.update(workEntries)
        .set({ jobId: token, jobName: 'Deleted Project', syncState: 'pending' })
        .where(eq(workEntries.jobId, zohoId))

    const deleted = await db.delete(projects).where(eq(projects.id, zohoId)).returning({ id: projects.id })
    return {
        deleted: deleted.length > 0,
        anonymized: 1,
        reason: deleted.length === 0 ? 'Project not found (already deleted or never synced)' : undefined,
    }
}

async function handlePainterDelete(zohoId: string) {
    const [painter] = await db.select({ id: painters.id }).from(painters).where(eq(painters.id, zohoId)).limit(1)
    const token = deletedToken(zohoId)

    await db.update(timesheetPainters)
        .set({ painterId: token, painterName: 'Deleted Painter', zohoJunctionId: null })
        .where(eq(timesheetPainters.painterId, zohoId))

    await db.update(workEntryCrewRows)
        .set({ painterId: token, painterName: 'Deleted Painter', zohoRecordId: null, syncState: 'pending' })
        .where(eq(workEntryCrewRows.painterId, zohoId))

    if (painter) {
        await db.delete(painters).where(eq(painters.id, zohoId))
    }

    return {
        deleted: !!painter,
        anonymized: 1,
        reason: !painter ? 'Painter not found (already deleted or never synced)' : undefined,
    }
}

/**
 * POST /api/webhooks/delete
 * Handles Zoho delete events where only module + record id are available.
 */
export async function POST(request: NextRequest) {
    try {
        const secret = getWebhookSecret(request)
        if (!secret || secret !== process.env.ZOHO_WEBHOOK_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const payload = await request.json().catch(() => ({})) as Record<string, unknown>
        const moduleRaw = String(payload.module ?? payload.moduleName ?? payload.entity ?? '').trim()
        const zohoId = String(payload.id ?? payload.recordId ?? payload.record_id ?? '').trim()

        if (!moduleRaw || !zohoId) {
            return NextResponse.json({ error: 'Missing required fields: module and id' }, { status: 400 })
        }

        const moduleKey = normalizeModule(moduleRaw)
        if (!moduleKey) {
            return NextResponse.json({ error: `Unsupported module: ${moduleRaw}` }, { status: 400 })
        }

        let result: { deleted: boolean; anonymized: number; reason?: string }

        if (moduleKey === 'portal_users' || moduleKey === 'foremen') {
            result = await handleForemanDelete(zohoId)
        } else if (moduleKey === 'deals') {
            result = await handleDealDelete(zohoId)
        } else {
            result = await handlePainterDelete(zohoId)
        }

        console.log('[Webhook][Delete] Processed Zoho delete:', {
            module,
            zohoId,
            deleted: result.deleted,
            anonymized: result.anonymized,
            reason: result.reason ?? null,
        })

        return NextResponse.json({
            success: true,
            module,
            id: zohoId,
            deleted: result.deleted,
            anonymized: result.anonymized,
            reason: result.reason ?? null,
        })
    } catch (error) {
        console.error('[Webhook][Delete] Failed:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

