import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { painters } from '@/lib/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

/**
 * GET /api/painters
 * Returns all active painters for the Foreman's crew dropdown.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const list = await db
      .select({
        id: painters.id,
        name: painters.name,
        email: painters.email,
        phone: painters.phone,
      })
      .from(painters)
      .where(eq(painters.active, true))
      .orderBy(painters.name)

    return NextResponse.json(list)
  } catch (error) {
    console.error('[API] Failed to fetch painters:', error)
    return NextResponse.json({ error: 'Failed to fetch painters' }, { status: 500 })
  }
}
