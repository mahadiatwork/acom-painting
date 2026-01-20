import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projects } from '@/lib/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// Payload schema for validation - only essential fields
const projectSyncSchema = z.object({
  zoho_record_id: z.string(),
  name: z.string(), // Deal_Name
  status: z.string(), // Stage
  date: z.string().optional(), // Closing_Date or Project_Start_Date
  address: z.string().optional(), // Shipping_Street or combined address
  sync_source: z.enum(['trigger', 'daily']).default('daily'),
  sync_run_id: z.string().optional(),
})

/**
 * POST /api/sync/projects/daily
 * 
 * Safety net sync endpoint for daily batch synchronization.
 * Called by Zoho scheduled Deluge function to ensure all active projects are synced.
 * 
 * Idempotent: Uses zoho_record_id (which maps to projects.id) for upsert.
 * Handles multiple projects in sequence (called once per project by Deluge).
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Security Check
    const authHeader = request.headers.get('Authorization')
    const secret = authHeader?.replace('Bearer ', '') || request.headers.get('x-roofworx-secret')
    
    if (!secret || secret !== process.env.ZOHO_WEBHOOK_SECRET) {
      return NextResponse.json(
        { success: false, reason: 'unauthorized', details: 'Invalid or missing secret' },
        { status: 401 }
      )
    }

    // 2. Parse and validate payload
    const body = await request.json()
    const validated = projectSyncSchema.parse(body)

    const zohoRecordId = validated.zoho_record_id
    const syncRunId = validated.sync_run_id || 'unknown'

    console.log(`[Sync Daily] Processing project: ${zohoRecordId}, run_id: ${syncRunId}`)

    // 3. Check if project already exists
    const existing = await db
      .select()
      .from(projects)
      .where(eq(projects.id, zohoRecordId))
      .limit(1)

    // 4. Prepare project data - only essential fields
    const projectData = {
      id: zohoRecordId,
      name: validated.name,
      status: validated.status,
      date: validated.date || '',
      address: validated.address || '',
      updatedAt: new Date().toISOString(),
    }

    // 5. Idempotent Upsert
    if (existing.length > 0) {
      // Update existing project

      await db
        .update(projects)
        .set(projectData)
        .where(eq(projects.id, zohoRecordId))

      console.log(`[Sync Daily] Updated project: ${zohoRecordId} (run: ${syncRunId})`)
      
      return NextResponse.json({
        success: true,
        updated: true,
        created: false,
        zoho_record_id: zohoRecordId,
        sync_run_id: syncRunId
      })
    } else {
      // Insert new project
      await db.insert(projects).values({
        id: zohoRecordId,
        name: validated.name,
        status: validated.status,
        date: validated.date || '',
        address: validated.address || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      console.log(`[Sync Daily] Created project: ${zohoRecordId} (run: ${syncRunId})`)
      
      return NextResponse.json({
        success: true,
        updated: false,
        created: true,
        zoho_record_id: zohoRecordId,
        sync_run_id: syncRunId
      }, { status: 201 })
    }

  } catch (error) {
    console.error('[Sync Daily] Error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          reason: 'validation_error',
          details: error.errors
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        reason: 'internal_error',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
