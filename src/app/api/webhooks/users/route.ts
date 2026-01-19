import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { users } from '@/lib/schema'

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

    // 2. Update Postgres users table (UPSERT)
    try {
      await db.insert(users).values({
        email: Email,
        zohoId: String(id),
        username: Email, // Use email as username
        password: '', // Password managed by Supabase Auth
      }).onConflictDoUpdate({
        target: users.email,
        set: {
          zohoId: String(id),
          username: Email,
        }
      })
      console.log(`[Webhook] Updated Postgres users table: ${Email} (Zoho ID: ${id})`)
    } catch (dbError: any) {
      console.error('[Webhook] Postgres update failed:', dbError?.message || dbError)
      // Continue even if Postgres fails
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[Webhook] User update failed:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}


