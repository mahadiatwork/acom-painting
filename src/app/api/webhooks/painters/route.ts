import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Incoming payload from Zoho (capitalized keys). */
interface ZohoPainterPayload {
  id?: string
  Name?: string
  name?: string
  Email?: string
  email?: string
  Phone?: string
  phone?: string
  Active?: boolean
  active?: boolean
}

/** Row shape for Supabase painters table (lowercase columns). */
interface PaintersRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  active: boolean
  created_at: string
  updated_at: string
}

/**
 * Safely parse JSON body. Handles raw string or already-parsed object (e.g. if Zoho stringifies oddly).
 */
function parseBody(raw: string): Record<string, unknown> {
  const trimmed = raw?.trim()
  if (!trimmed) return {}
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as Record<string, unknown>
  }
  return {}
}

/**
 * POST /api/webhooks/painters
 * Zoho webhook: create or update a painter in Supabase.
 * Auth: Bearer ZOHO_WEBHOOK_SECRET
 * Body: JSON { id, Name, Email?, Phone?, Active? }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authentication
    const authHeader = request.headers.get('Authorization')
    const secret =
      authHeader?.replace(/^\s*Bearer\s+/i, '').trim() ||
      request.headers.get('x-roofworx-secret')?.trim()
    if (!secret || secret !== process.env.ZOHO_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse body (handle stringified JSON or raw JSON)
    const raw = await request.text()
    let body: Record<string, unknown>
    try {
      body = parseBody(raw)
    } catch (e) {
      console.error('[Webhook] Painters invalid JSON. Raw:', raw?.slice(0, 500))
      return NextResponse.json(
        {
          error: 'Invalid JSON body. Send Content-Type: application/json with id and Name.',
        },
        { status: 400 }
      )
    }

    const payload = body as unknown as ZohoPainterPayload

    // 3. Map Zoho keys (capitalized) to Supabase columns (lowercase)
    const id = payload.id != null ? String(payload.id).trim() : ''
    const name = (payload.Name ?? payload.name ?? '').toString().trim()
    const email =
      payload.Email !== undefined && payload.Email !== null && payload.Email !== ''
        ? String(payload.Email).trim()
        : null
    const phone =
      payload.Phone !== undefined && payload.Phone !== null && payload.Phone !== ''
        ? String(payload.Phone).trim()
        : null
    const active =
      payload.Active === true ||
      payload.Active === 1 ||
      payload.Active === '1' ||
      (payload.active !== false && payload.active !== 0 && payload.active !== '0')

    if (!id || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: id and Name' },
        { status: 400 }
      )
    }

    // 4. Supabase admin client (service role for server-to-server)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[Webhook] Painters: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()

    // Upsert: insert or update. Use two-step so created_at is only set on insert.
    const { data: existing } = await supabase
      .from('painters')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (existing) {
      const { error: updateError } = await supabase
        .from('painters')
        .update({
          name,
          email,
          phone,
          active,
          updated_at: nowIso,
        } as Record<string, unknown>)
        .eq('id', id)

      if (updateError) {
        console.error('[Webhook] Painters update failed:', updateError)
        return NextResponse.json(
          { error: 'Internal Server Error', details: updateError.message },
          { status: 500 }
        )
      }
    } else {
      const row: PaintersRow = {
        id,
        name,
        email,
        phone,
        active,
        created_at: nowIso,
        updated_at: nowIso,
      }
      const { error: insertError } = await supabase.from('painters').insert(row)

      if (insertError) {
        console.error('[Webhook] Painters insert failed:', insertError)
        return NextResponse.json(
          { error: 'Internal Server Error', details: insertError.message },
          { status: 500 }
        )
      }
    }

    console.log('[Webhook] Painters upserted:', id)
    return NextResponse.json({
      success: true,
      message: 'Painter synced successfully',
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    console.error('[Webhook] Painters failed:', message, stack)
    const debug =
      request.headers.get('x-webhook-debug') === 'true' ||
      request.headers.get('x-webhook-debug') === '1'
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        ...(debug && {
          details: message,
          hint: 'Fix the issue above then remove X-Webhook-Debug header.',
        }),
      },
      { status: 500 }
    )
  }
}
