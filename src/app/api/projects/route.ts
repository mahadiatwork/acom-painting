import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { projects, userProjects } from '@/lib/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // 1. Authenticate User
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log(`[API] Fetching projects for user: ${user.email}`)

    // Query Postgres: JOIN user_projects with projects
    try {
      const postgresProjects = await db
        .select({
          id: projects.id,
          name: projects.name,
          customer: projects.customer,
          status: projects.status,
          address: projects.address,
          salesRep: projects.salesRep,
          supplierColor: projects.supplierColor,
          trimColor: projects.trimColor,
          accessoryColor: projects.accessoryColor,
          gutterType: projects.gutterType,
          sidingStyle: projects.sidingStyle,
          workOrderLink: projects.workOrderLink,
        })
        .from(userProjects)
        .innerJoin(projects, eq(userProjects.projectId, projects.id))
        .where(eq(userProjects.userEmail, user.email))

      console.log(`[API] Postgres query returned ${postgresProjects.length} rows`)

      const parsedProjects = postgresProjects.map(p => ({
        id: p.id,
        name: p.name,
        customer: p.customer,
        status: p.status,
        address: p.address || '',
        salesRep: p.salesRep || '',
        supplierColor: p.supplierColor || '',
        trimColor: p.trimColor || '',
        accessoryColor: p.accessoryColor || '',
        gutterType: p.gutterType || '',
        sidingStyle: p.sidingStyle || '',
        workOrderLink: p.workOrderLink || '',
      }))

      console.log(`[API] Fetched ${parsedProjects.length} projects from Postgres for ${user.email}`)
      
      return NextResponse.json(parsedProjects)
    } catch (dbError: any) {
      console.error('[API] Postgres query failed:', dbError?.message || dbError)
      return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
    }

  } catch (error) {
    console.error('Failed to fetch projects:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}
