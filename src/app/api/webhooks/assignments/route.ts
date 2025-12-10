import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { db } from '@/lib/db'
import { userProjects } from '@/lib/schema'
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

    // 2. Lookup User Email
    // Try Postgres first, then Redis fallback
    let email: string | null = null
    
    try {
      // Try to get email from Postgres users table
      const { users } = await import('@/lib/schema')
      const [user] = await db.select().from(users).where(eq(users.zohoId, String(portalUserId))).limit(1)
      email = user?.email || null
    } catch (dbError: any) {
      console.warn(`[Webhook] Postgres user lookup failed, trying Redis:`, dbError?.message || dbError)
    }
    
    // Fallback to Redis map
    if (!email) {
      email = await redis.hget<string>('zoho:map:user_id_to_email', String(portalUserId))
    }
    
    if (!email) {
        console.warn(`[Webhook] Unknown Portal User ID: ${portalUserId}. Run Cron Sync to populate map.`)
        return NextResponse.json({ 
            error: 'User mapping not found',
            hint: 'Trigger /api/cron/sync-projects to update user map'
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
      // Continue to Redis update even if Postgres fails
    }

    // 4. Update Redis Access Set
    const userKey = `user:${email}:projects`

    if (action === 'remove') {
        await redis.srem(userKey, String(dealId))
        console.log(`[Webhook] Removed from Redis: ${email} -> ${dealId}`)
    } else {
        await redis.sadd(userKey, String(dealId))
        console.log(`[Webhook] Added to Redis: ${email} -> ${dealId}`)
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[Webhook] Assignment update failed:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}


