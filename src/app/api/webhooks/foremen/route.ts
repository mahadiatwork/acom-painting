import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { foremen } from '@/lib/schema'

/**
 * POST /api/webhooks/foremen
 * Zoho webhook: when a Portal User (foreman) is created or updated in CRM,
 * sync name, email, phone to the foremen table. No users table or Supabase Auth.
 * Auth: Authorization: Bearer ZOHO_WEBHOOK_SECRET
 * Body: { id, Email?, name?, phone? } (id required; Email optional – foreman can be created without email)
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (authHeader !== `Bearer ${process.env.ZOHO_WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await request.json()
    const { id, Email, name: payloadName, phone } = payload

    if (!id) {
      return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 })
    }

    const zohoId = String(id)
    const email = (Email != null && String(Email).trim() !== '') ? String(Email).trim() : ''
    const name = (payloadName ?? (email || `Foreman ${zohoId}`)).trim()
    const phoneVal = (phone ?? '').trim() || null

    // We must return the Supabase row id to Zoho, but only when a row is newly created.
    // Drizzle's onConflictDoUpdate does not reliably tell us whether an insert or update happened.
    // So we do an explicit existence check by zoho_id.
    try {
      const existing = await db
        .select({ id: foremen.id })
        .from(foremen)
        .where(eq(foremen.zohoId, zohoId))
        .limit(1)

      if (existing.length > 0) {
        await db
          .update(foremen)
          .set({
            email,
            name,
            phone: phoneVal,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(foremen.zohoId, zohoId))

        console.log(`[Webhook] Updated foremen table: ${name} (Zoho ID: ${zohoId}${email ? `, ${email}` : ', no email'})`)
        return NextResponse.json({ success: true, created: false })
      }

      const inserted = await db
        .insert(foremen)
        .values({
          zohoId,
          email,
          name,
          phone: phoneVal,
        })
        .returning({ id: foremen.id })

      const supabaseId = inserted?.[0]?.id
      console.log(`[Webhook] Created foreman row: ${name} (Supabase ID: ${supabaseId}, Zoho ID: ${zohoId}${email ? `, ${email}` : ', no email'})`)

      return NextResponse.json({
        success: true,
        created: true,
        supabase_id: supabaseId,
      })
    } catch (dbError: any) {
      console.error('[Webhook] Foremen create/update failed:', dbError?.message || dbError)
      return NextResponse.json({ error: 'Database update failed' }, { status: 500 })
    }
  } catch (error) {
    console.error('[Webhook] Foremen update failed:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
