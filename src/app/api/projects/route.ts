import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/projects
 * Returns projects with status "Project Accepted" for the job dropdown.
 * Reads from Supabase (same project as painters) so jobs load from the same DB.
 */
export async function GET() {
  try {
    const admin = createAdminClient()
    const { data: list, error } = await admin
      .from('projects')
      .select('id, name, status, date, address')
      .eq('status', 'Project Accepted')
      .order('name')

    if (error) {
      console.error('[API] Failed to fetch projects:', error)
      return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
    }

    const parsed = (Array.isArray(list) ? list : []).map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status ?? '',
      date: p.date ?? '',
      address: p.address ?? '',
    }))

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('[API] Failed to fetch projects:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}
