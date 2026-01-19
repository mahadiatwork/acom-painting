import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { userProjects, users } from '@/lib/schema'
import { eq, and } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  try {
    // 1. Security Check
    const secret = request.headers.get('x-roofworx-secret')
    if (secret !== process.env.ZOHO_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await request.json()
    const { portalUserId, dealId, action } = payload // action: 'add' | 'remove'

    if (!portalUserId || !dealId) {
      return NextResponse.json({ error: 'Missing required fields (portalUserId, dealId)' }, { status: 400 })
    }

    // 2. Lookup User Email from Postgres
    let email: string | null = null
    
    try {
      const [user] = await db.select().from(users).where(eq(users.zohoId, String(portalUserId))).limit(1)
      email = user?.email || null
    } catch (dbError: any) {
      console.error(`[Webhook] Postgres user lookup failed:`, dbError?.message || dbError)
    }
    
    if (!email) {
        console.warn(`[Webhook] Unknown Portal User ID: ${portalUserId}. Run Cron Sync to populate users table.`)
        return NextResponse.json({ 
            error: 'User mapping not found',
            hint: 'Trigger /api/cron/sync-projects to update users table'
        }, { status: 404 })
    }

    // 3. Update Postgres user_projects table
    try {
      if (action === 'remove') {
        await db.delete(userProjects).where(
          and(
            eq(userProjects.userEmail, email),
            eq(userProjects.projectId, String(dealId))
          )
        )
        console.log(`[Webhook] Removed from Postgres: ${email} -> ${dealId}`)
      } else {
        await db.insert(userProjects).values({
          userEmail: email,
          projectId: String(dealId),
        }).onConflictDoNothing()
        console.log(`[Webhook] Added to Postgres: ${email} -> ${dealId}`)
      }
    } catch (dbError: any) {
      console.error(`[Webhook] Postgres update failed:`, dbError?.message || dbError)
      // Return error if Postgres fails
      return NextResponse.json({ error: 'Failed to update user projects' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[Webhook] Assignment update failed:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}


