import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { foremen } from '@/lib/schema'
import { asc } from 'drizzle-orm'

/**
 * GET /api/foremen
 * Returns the list of foremen from the foremen table (synced from Zoho Portal_Users).
 * Requires auth. Used by the "Select Foreman" screen.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rows = await db
      .select({
        id: foremen.id,
        email: foremen.email,
        name: foremen.name,
        phone: foremen.phone,
      })
      .from(foremen)
      .orderBy(asc(foremen.name))

    const list = rows.map((r) => ({
      id: r.id,
      email: r.email ?? '',
      name: r.name.trim(),
      phone: r.phone ?? '',
    }))

    return NextResponse.json(list)
  } catch (error) {
    console.error('[API] Failed to fetch foremen:', error)
    return NextResponse.json({ error: 'Failed to fetch foremen' }, { status: 500 })
  }
}
