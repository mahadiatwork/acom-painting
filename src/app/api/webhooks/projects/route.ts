import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { db } from '@/lib/db'
import { projects } from '@/lib/schema'
import { eq } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  try {
    // 1. Security Check
    const secret = request.headers.get('x-roofworx-secret')
    if (secret !== process.env.ZOHO_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await request.json()
    const { id, Deal_Name, Account_Name, Stage } = payload

    if (!id || !Deal_Name) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    // 2. Fetch existing project from Postgres (source of truth)
    let existingProject: any = null
    try {
      const [project] = await db.select().from(projects).where(eq(projects.id, String(id))).limit(1)
      existingProject = project || null
    } catch (dbError: any) {
      console.warn(`[Webhook] Postgres read failed for project ${id}, continuing:`, dbError?.message || dbError)
    }

    // 3. Fallback to Redis if Postgres miss
    if (!existingProject) {
      const existingJson = await redis.hget<string>('projects:data', String(id))
      existingProject = existingJson ? JSON.parse(existingJson) : {}
    }
    
    // 4. Transform & Merge
    const newProject = {
      id: String(id),
      name: Deal_Name,
      customer: Account_Name || existingProject.customer || 'Unknown',
      status: Stage || existingProject.status || 'Active',
      supplierColor: payload.Supplier_Color || existingProject.supplierColor || '',
      trimColor: payload.Trim_Coil_Color || existingProject.trimColor || '',
      accessoryColor: payload.Shingle_Accessory_Color || existingProject.accessoryColor || '',
      gutterType: payload.Gutter_Types || existingProject.gutterType || '',
      sidingStyle: payload.Siding_Style || existingProject.sidingStyle || '',
      address: payload.Shipping_Street || existingProject.address || '',
      salesRep: payload.Owner || existingProject.salesRep || '',
      workOrderLink: existingProject.workOrderLink || '',
      updatedAt: new Date().toISOString(),
    }

    // 5. Write to Postgres first (source of truth)
    try {
      await db.insert(projects).values(newProject).onConflictDoUpdate({
        target: projects.id,
        set: {
          name: newProject.name,
          customer: newProject.customer,
          status: newProject.status,
          supplierColor: newProject.supplierColor,
          trimColor: newProject.trimColor,
          accessoryColor: newProject.accessoryColor,
          gutterType: newProject.gutterType,
          sidingStyle: newProject.sidingStyle,
          address: newProject.address,
          salesRep: newProject.salesRep,
          workOrderLink: newProject.workOrderLink,
          updatedAt: newProject.updatedAt,
        }
      })
      console.log(`[Webhook] Written to Postgres projects table: ${id}`)
    } catch (dbError: any) {
      console.error(`[Webhook] Postgres write failed for project ${id}:`, dbError?.message || dbError)
      // Continue to Redis update even if Postgres fails
    }

    // 6. Update Redis cache
    await redis.hset('projects:data', { [String(id)]: JSON.stringify(newProject) })
    console.log(`[Webhook] Updated Redis cache for project ${id}`)

    return NextResponse.json({ success: true, action: existingProject ? 'updated' : 'created' })

  } catch (error) {
    console.error('[Webhook] Project Patch failed:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
