import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/painters
 * Returns all active painters for the Foreman's crew dropdown.
 * Reads from Supabase (same DB the webhook writes to).
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: list, error } = await admin
      .from('painters')
      .select('id, name, email, phone')
      .eq('active', true)
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
