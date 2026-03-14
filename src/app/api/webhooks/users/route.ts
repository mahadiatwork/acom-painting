import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { users } from '@/lib/schema'

/**
 * POST /api/webhooks/users
 * Zoho webhook: when a Portal User (foreman) is created or updated in CRM,
 * sync name, email, phone to Postgres users table. No password or Supabase Auth user is created.
 * Auth: Authorization: Bearer ZOHO_WEBHOOK_SECRET
 * Body: { id, Email, name?, phone? } (id = Zoho Portal_Users record ID)
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${process.env.ZOHO_WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await request.json()
    const { id, Email, name: payloadName, phone } = payload

    if (!id || !Email) {
      return NextResponse.json({ error: 'Missing required fields (id, Email)' }, { status: 400 })
    }

    const email = String(Email).trim()
    const name = (payloadName ?? email).trim() || null
    const phoneVal = (phone ?? '').trim() || null

    try {
      await db.insert(users).values({
        email,
        zohoId: String(id),
        username: email,
        password: '',
        name: name,
        phone: phoneVal,
      }).onConflictDoUpdate({
        target: users.email,
        set: {
          zohoId: String(id),
          username: email,
          name: name,
          phone: phoneVal,
        }
      })
      console.log(`[Webhook] Updated Postgres users (foreman): ${email} (Zoho ID: ${id})`)
    } catch (dbError: any) {
      console.error('[Webhook] Postgres update failed:', dbError?.message || dbError)
      return NextResponse.json({ error: 'Database update failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Webhook] User update failed:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}


