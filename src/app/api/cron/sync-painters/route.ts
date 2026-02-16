import { NextResponse } from 'next/server'
import { zohoClient } from '@/lib/zoho'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/sync-painters
 * One-time or on-demand: fetch all Painters from Zoho CRM and upsert into Supabase
 * (same painters table the portal and webhook use). Run this to populate real
 * Zoho painters so the portal shows them and junction sync works.
 */
export async function GET() {
  try {
    console.log('[Cron] Sync Painters: fetching from Zoho...')
    const zohoPainters = await zohoClient.getPainters()
    if (!zohoPainters?.length) {
      console.log('[Cron] Sync Painters: no painters returned from Zoho')
      return NextResponse.json({
        success: true,
        paintersSynced: 0,
        message: 'No painters in Zoho',
        timestamp: new Date().toISOString(),
      })
    }

    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()
    let paintersSynced = 0

    for (const p of zohoPainters) {
      const id = p.id
      const name = (p as { Name?: string }).Name ?? ''
      if (!id || !name) continue
      const active = (p as { Active?: boolean }).Active !== false
      const { error } = await supabase.from('painters').upsert(
        {
          id: String(id),
          name: String(name),
          email: (p as { Email?: string }).Email ?? null,
          phone: (p as { Phone?: string }).Phone ?? null,
          active,
          updated_at: nowIso,
        },
        { onConflict: 'id' }
      )
      if (!error) paintersSynced++
      else console.warn('[Cron] Sync Painters upsert failed:', id, error.message)
    }

    console.log(`[Cron] Sync Painters: synced ${paintersSynced} to Supabase`)
    return NextResponse.json({
      success: true,
      paintersSynced,
      totalFromZoho: zohoPainters.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron] Sync Painters failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
