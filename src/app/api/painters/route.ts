import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/painters
 * Returns all painters for the Foreman's crew dropdown (no active filter).
 * Reads from Supabase (same DB the webhook writes to).
 *
 * PGRST205 "Could not find the table 'public.painters'" = NEXT_PUBLIC_SUPABASE_URL
 * (and SUPABASE_SERVICE_ROLE_KEY) point to a project that has no painters table.
 * Use the same Supabase project where you created the table (e.g. roofworx-timesheet-app).
 */
export async function GET() {
  try {
    const admin = createAdminClient()
    const { data: list, error } = await admin
      .from('painters')
      .select('id, name, email, phone')
      .order('name')

    if (error) {
      console.error('[API] Failed to fetch painters:', error)
      return NextResponse.json({ error: 'Failed to fetch painters' }, { status: 500 })
    }

    return NextResponse.json(Array.isArray(list) ? list : [])
  } catch (error) {
    console.error('[API] Failed to fetch painters:', error)
    return NextResponse.json({ error: 'Failed to fetch painters' }, { status: 500 })
  }
}
