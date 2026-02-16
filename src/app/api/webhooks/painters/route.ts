import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { painters } from '@/lib/schema'

/**
 * POST /api/webhooks/painters
 * Zoho webhook when a Painter is created or updated.
 * Auth: Bearer ZOHO_WEBHOOK_SECRET or x-roofworx-secret
 * Payload: JSON body { id, Name, Email, Phone, Active }
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const secret = authHeader?.replace('Bearer ', '') || request.headers.get('x-roofworx-secret')
    if (secret !== process.env.ZOHO_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const raw = await request.text()
    let body: Record<string, unknown>
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    } catch {
      console.error('[Webhook] Painters invalid JSON. Raw body:', raw?.slice(0, 500))
      return NextResponse.json(
        { error: 'Invalid JSON body. Send Content-Type: application/json and a JSON object with id and Name.' },
        { status: 400 }
      )
    }

    const id = body.id
    const name = (body.Name ?? body.name) ?? ''
    const email = body.Email ?? body.email ?? null
    const phone = body.Phone ?? body.phone ?? null
    const active = body.Active !== false && body.active !== false

    if (!id || !name) {
      return NextResponse.json({ error: 'Missing id or Name' }, { status: 400 })
    }

    await db
      .insert(painters)
      .values({
        id: String(id),
        name: String(name),
        email: email != null ? String(email) : null,
        phone: phone != null ? String(phone) : null,
        active,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: painters.id,
        set: {
          name: String(name),
          email: email != null ? String(email) : null,
          phone: phone != null ? String(phone) : null,
          active,
          updatedAt: new Date().toISOString(),
        },
      })

    console.log('[Webhook] Painters upserted:', id)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[Webhook] Painters failed:', message, error)
    return NextResponse.json(
      { error: 'Internal Server Error', details: process.env.NODE_ENV === 'development' ? message : undefined },
      { status: 500 }
    )
  }
}
