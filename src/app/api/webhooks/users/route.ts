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
    const { id, Email } = payload

    if (!id || !Email) {
      return NextResponse.json({ error: 'Missing required fields (id, Email)' }, { status: 400 })
    }

    // 2. Update User Map in Redis
    await redis.hset('zoho:map:user_id_to_email', { [String(id)]: Email })
    
    console.log(`[Webhook] User Map Updated: ${id} -> ${Email}`)

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[Webhook] User update failed:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}


