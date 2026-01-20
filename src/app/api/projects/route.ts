import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { projects } from '@/lib/schema'
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

    console.log(`[API] Fetching projects with status "Project Accepted"`)

    // Query Postgres: Get all projects with status "Project Accepted"
    try {
      const postgresProjects = await db
        .select({
          id: projects.id,
          name: projects.name,
          status: projects.status,
          date: projects.date,
          address: projects.address,
        })
        .from(projects)
        .where(eq(projects.status, 'Project Accepted'))

      console.log(`[API] Postgres query returned ${postgresProjects.length} projects with status "Project Accepted"`)

      // Return only the 4 essential fields: name, status, date, address
      const parsedProjects = postgresProjects.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        date: p.date || '',
        address: p.address || '',
      }))

      console.log(`[API] Fetched ${parsedProjects.length} projects from Postgres`)
      
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
