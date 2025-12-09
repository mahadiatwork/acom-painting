import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

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
    // We rely on the map created by the Nightly Cron Job
    const email = await redis.hget<string>('zoho:map:user_id_to_email', String(portalUserId))
    
    if (!email) {
        console.warn(`[Webhook] Unknown Portal User ID: ${portalUserId}. Run Cron Sync to populate map.`)
        return NextResponse.json({ 
            error: 'User mapping not found',
            hint: 'Trigger /api/cron/sync-projects to update user map'
        }, { status: 404 })
    }

    // 3. Update Redis Access Set
    const userKey = `user:${email}:projects`

    if (action === 'remove') {
        await redis.srem(userKey, String(dealId))
        console.log(`[Webhook] Removed access: ${email} -> ${dealId}`)
    } else {
        await redis.sadd(userKey, String(dealId))
        console.log(`[Webhook] Added access: ${email} -> ${dealId}`)
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[Webhook] Assignment update failed:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}


