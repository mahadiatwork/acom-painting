import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { users } from '@/lib/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

/**
 * GET /api/user/zoho-id
 * Returns the logged-in user's zoho_id from the users table
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate User
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Query Postgres users table for zoho_id
    try {
      const [userRecord] = await db
        .select({ zohoId: users.zohoId })
        .from(users)
        .where(eq(users.email, user.email))
        .limit(1)

      if (!userRecord || !userRecord.zohoId) {
        return NextResponse.json({ 
          error: 'Zoho ID not found',
          message: `No zoho_id found for user ${user.email}. Please ensure the user is provisioned from Zoho.`
        }, { status: 404 })
      }

      return NextResponse.json({ 
        zohoId: userRecord.zohoId,
        email: user.email
      })
    } catch (dbError: any) {
      console.error('[API] Failed to fetch zoho_id:', dbError?.message || dbError)
      return NextResponse.json({ 
        error: 'Database error',
        details: dbError?.message || 'Failed to query users table'
      }, { status: 500 })
    }
  } catch (error) {
    console.error('[API] Failed to get zoho_id:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
