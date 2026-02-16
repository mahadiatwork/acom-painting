import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/painters
 * Returns all active painters for the Foreman's crew dropdown.
 * Reads from Supabase (same DB the webhook writes to).
 * No auth check here so the list loads reliably in Route Handlers (session cookies
 * are not always available). The entry page itself is protected by middleware.
 */
export async function GET() {
  try {
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
