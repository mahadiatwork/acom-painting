import { NextRequest, NextResponse } from 'next/server'
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
    const { id, Deal_Name, Stage, Closing_Date, Project_Start_Date, Shipping_Street, Single_Line_1, Single_Line_2, State, Zip_Code } = payload

    if (!id || !Deal_Name) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    // 2. Fetch existing project from Postgres
    let existingProject: any = null
    try {
      const [project] = await db.select().from(projects).where(eq(projects.id, String(id))).limit(1)
      existingProject = project || null
    } catch (dbError: any) {
      console.warn(`[Webhook] Postgres read failed for project ${id}, continuing:`, dbError?.message || dbError)
      existingProject = {}
    }
    
    // 3. Get date - prefer Closing_Date, fallback to Project_Start_Date
    let projectDate = ''
    if (Closing_Date) {
      projectDate = Closing_Date
    } else if (Project_Start_Date) {
      projectDate = Project_Start_Date
    } else if (existingProject?.date) {
      projectDate = existingProject.date
    }
    
    // 4. Get address - prefer Shipping_Street, or combine address fields
    let projectAddress = ''
    if (Shipping_Street) {
      projectAddress = Shipping_Street
    } else {
      // Combine address components
      const addressParts: string[] = []
      if (Single_Line_1) addressParts.push(Single_Line_1)
      if (Single_Line_2) addressParts.push(Single_Line_2)
      if (State) addressParts.push(State)
      if (Zip_Code) addressParts.push(Zip_Code)
      projectAddress = addressParts.join(', ')
    }
    
    if (!projectAddress && existingProject?.address) {
      projectAddress = existingProject.address
    }
    
    // 5. Transform to minimal schema
    const newProject = {
      id: String(id),
      name: Deal_Name,
      status: Stage || existingProject.status || 'Project Accepted',
      date: projectDate,
      address: projectAddress,
      updatedAt: new Date().toISOString(),
    }

    // 6. Write to Postgres
    try {
      await db.insert(projects).values(newProject).onConflictDoUpdate({
        target: projects.id,
        set: {
          name: newProject.name,
          status: newProject.status,
          date: newProject.date,
          address: newProject.address,
          updatedAt: newProject.updatedAt,
        }
      })
      console.log(`[Webhook] Written to Postgres projects table: ${id}`)
    } catch (dbError: any) {
      console.error(`[Webhook] Postgres write failed for project ${id}:`, dbError?.message || dbError)
      return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
    }

    return NextResponse.json({ success: true, action: existingProject ? 'updated' : 'created' })

  } catch (error) {
    console.error('[Webhook] Project Patch failed:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
